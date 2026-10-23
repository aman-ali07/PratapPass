-- 0005_workflow.sql ------------------------------------------------------------
-- T-04: SECURITY DEFINER workflow functions (DATABASE.md §5/§6). Ordinary roles
-- hold NO write grants on workflow tables (0003) — every transition happens here,
-- which runs as the table owner and bypasses RLS. Functions are the ONLY writers
-- of notifications and audit rows, so client scope stays read-only.
--
-- Token strategy (closes audit KI-012, D-015): raw QR token =
-- HMAC-SHA256(qr_token_secret, gate_passes.id) hex. Only its SHA-256 is stored
-- (`token_hash`), never the raw value. Deterministic HMAC lets the QR-rendering
-- route (T-10) re-derive the raw token from the pass id without a token table —
-- the secret is the single source of truth in `private.app_secrets` (unexposed
-- schema; go-live pulls the production value from the ops checklist, KI-002).
--
-- Verification contract (§5/T-11): fn_gate_record returns holder name + validity
-- ONLY — never reason/medical text; unknown tokens cannot be logged (log rows
-- reference a pass id), unknown probes are answered without a log row.
--
-- All error paths RAISE (never silent); SQLSTATE P0001 with user-actionable text
-- is mapped server-side in T-06/T-08 actions.

create schema if not exists private;
revoke all on schema private from anon, authenticated, service_role, public;

create table if not exists private.app_secrets (
  name  text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
revoke all on private.app_secrets from anon, authenticated, service_role, public;
-- no seed row here: issuance fails loudly in a bare environment; the local dev
-- secret is inserted by the smoke fixture, the production one at go-live.

-- fn_submit_application ---------------------------------------------------------
-- STUDENT only. Validates the trip window against the rules, resolves
-- approval_rules (department rule → global fallback), builds the chain
-- (emergency ⇒ single hod step, D-007), inserts document metadata rows, writes
-- audit + notifications. Investigation of `p_docs` shape: jsonb array of
-- {storage_path, content_type, byte_size, label} — metadata ONLY (files land in
-- storage before submit via the T-06 action; transport = KI-011).
create or replace function public.fn_submit_application(
  p_reason            public.gate_reason,
  p_departure_at      timestamptz,
  p_expected_return_at timestamptz,
  p_explanation       text,
  p_docs              jsonb default '[]'::jsonb
) returns public.gate_pass_applications
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_uid    uuid            := (select auth.uid());
  v_role   public.user_role;
  v_app    public.gate_pass_applications;
  v_rule   public.approval_rules%rowtype;
  v_dept   uuid;
  v_docs   jsonb;
  v_doc    jsonb;
  v_step   int;
  v_next_role text;
begin
  v_role := public.get_user_role(v_uid);
  if v_role is distinct from 'student' then
    raise exception 'Only students may submit applications' using errcode = 'P0001';
  end if;
  v_dept := (select department_id from public.profiles where id = v_uid);

  if v_dept is null then
    raise exception 'Your profile is missing a department assignment — contact the administration' using errcode = 'P0001';
  end if;

  -- Window sanity: the trip must start in the future; return must follow (the
  -- table CHECK guards the relation, this guards the past).
  if p_departure_at < now() then
    raise exception 'Departure time must be in the future' using errcode = 'P0001';
  end if;

  -- Rules lookup: department-specific rule wins over the global default.
  select * into v_rule
  from public.approval_rules r
  where r.reason = p_reason
    and (r.department_id = v_dept or r.department_id is null)
  order by r.department_id nulls last   -- non-null (department) row first
  limit 1;
  if not found then
    raise exception 'No approval rule is configured for this request type — contact the administration' using errcode = 'P0001';
  end if;

  -- Medical requirement is a rule decision (admin-set), enforced at submit.
  if v_rule.requires_medical_document then
    if jsonb_typeof(p_docs) is distinct from 'array' or jsonb_array_length(p_docs) = 0 then
      raise exception 'A medical document is required for this request type' using errcode = 'P0001';
    end if;
  end if;
  -- Shape-validate provided docs even when optional.
  if jsonb_typeof(p_docs) = 'array' then
    for v_doc in select * from jsonb_array_elements(p_docs) loop
      if v_doc ? 'storage_path' is not true or v_doc ? 'content_type' is not true
         or v_doc ? 'byte_size' is not true then
        raise exception 'Malformed document metadata' using errcode = 'P0001';
      end if;
    end loop;
  end if;

  -- Emergency is ALWAYS a single expedited hod step (D-007).
  if p_reason = 'emergency' then
    v_rule.chain := '["hod"]'::jsonb;
  end if;

  insert into public.gate_pass_applications (
    student_id, department_id, reason, departure_at, expected_return_at, explanation
  ) values (
    v_uid, v_dept, p_reason, p_departure_at, p_expected_return_at, p_explanation
  ) returning * into v_app;

  -- Document metadata rows: insert whatever was provided, and REQUIRE at least
  -- one when the rule demands a medical document (enforced above).
  v_docs := p_docs;
  if jsonb_typeof(v_docs) = 'array' and jsonb_array_length(v_docs) > 0 then
    for v_doc in select * from jsonb_array_elements(v_docs) loop
      insert into public.medical_documents (
        application_id, storage_path, content_type, byte_size, label, uploaded_by
      ) values (
        v_app.id,
        v_doc ->> 'storage_path',
        v_doc ->> 'content_type',
        (v_doc ->> 'byte_size')::bigint,
        v_doc ->> 'label',
        v_uid
      );
    end loop;
  end if;

  v_step := 1;
  for v_next_role in select value::text from jsonb_array_elements_text(v_rule.chain) loop
    insert into public.approval_steps (
      application_id, step_order, approver_role, department_id
    ) values (
      v_app.id, v_step, v_next_role::public.user_role, v_dept
    );
    v_step := v_step + 1;
  end loop;

  insert into public.notifications (user_id, type, title, body, application_id)
  values (
    v_uid, 'application_submitted', 'Application submitted',
    'Your gate-pass application was received and is awaiting approval.', v_app.id
  );

  -- Notify the first step's scope: every unassigned staff member of that role
  -- in the department; explicit assignees (PRD AD-3, via admin tooling) alone
  -- when an assignment exists.
  insert into public.notifications (user_id, type, title, body, application_id)
  select p.id, 'review_required', 'New application to review',
         format('%s submitted a %s gate-pass request for your approval',
                (select full_name from public.profiles where id = v_uid), p_reason),
         v_app.id
  from public.profiles p
  join lateral (
    select s.approver_role, s.assigned_to
    from public.approval_steps s
    where s.application_id = v_app.id and s.step_order = 1
  ) fs on true
  where p.role = fs.approver_role
    and p.department_id = v_dept
    and (fs.assigned_to is null or p.id = fs.assigned_to);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_uid, 'application.submitted', 'gate_pass_applications', v_app.id,
    jsonb_build_object('reason', p_reason, 'department', v_dept, 'steps', v_step - 1)
  );

  return v_app;
end;
$$;

revoke execute on function public.fn_submit_application(gate_reason, timestamptz, timestamptz, text, jsonb) from anon, public;
grant  execute on function public.fn_submit_application(gate_reason, timestamptz, timestamptz, text, jsonb) to authenticated;

-- fn_decide_application ----------------------------------------------------------
-- APPROVER only: actor must be the ACTIVE step's role in the step's department
-- (or the explicit assignee). Chain order is enforced by taking the lowest
-- pending step; a step that is not first is unreachable (reply: 'not your turn').
-- Transitions per §6: submitted → under_review on first action; approve advances;
-- final approve flips the app to `approved` — the 0006 trigger issues the pass.
-- reject needs remarks; request_info pauses the step on info_requested.
create or replace function public.fn_decide_application(
  p_application_id uuid,
  p_action         text,
  p_remarks        text default null
) returns public.approval_steps
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_role    public.user_role := public.get_user_role(v_uid);
  v_dept    uuid             := public.get_user_department(v_uid);
  v_app     public.gate_pass_applications;
  v_step    public.approval_steps;
  v_remaining int;
begin
  if v_role not in ('faculty', 'hod') then
    raise exception 'Only faculty or HOD members may decide applications' using errcode = 'P0001';
  end if;

  select * into v_app from public.gate_pass_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found' using errcode = 'P0001';
  end if;
  if v_app.status not in ('submitted', 'under_review') then
    raise exception using message = format('This application is not awaiting a decision (%s)', v_app.status),
      errcode = 'P0001';
  end if;
  if v_app.department_id is distinct from v_dept then
    raise exception 'This application belongs to another department' using errcode = 'P0001';
  end if;

  -- Active step = lowest pending step_order (chain order, no bypass).
  select * into v_step
  from public.approval_steps s
  where s.application_id = p_application_id and s.status = 'pending'
  order by s.step_order
  limit 1;
  if not found then
    raise exception 'No pending approval step matches this application' using errcode = 'P0001';
  end if;

  if v_step.approver_role is distinct from v_role
     or (v_step.assigned_to is not null and v_step.assigned_to is distinct from v_uid) then
    raise exception 'You are not the assigned approver for the current step'
      using errcode = 'P0001';
  end if;

  if p_action in ('reject', 'request_info') and coalesce(p_remarks, '') = '' then
    raise exception 'Remarks are required when rejecting or requesting information'
      using errcode = 'P0001';
  end if;
  if p_remarks is not null and char_length(p_remarks) > 1000 then
    raise exception 'Remarks must fit in 1000 characters' using errcode = 'P0001';
  end if;

  if p_action = 'approve' then
    update public.approval_steps
       set status = 'approved', decided_by = v_uid, decided_at = now()
     where id = v_step.id
     returning * into v_step;

    select count(*) into v_remaining
    from public.approval_steps s
    where s.application_id = p_application_id and s.status = 'pending';

    if v_remaining = 0 then
      -- Final approve → app flips to `approved`; the 0006 trigger issues the pass.
      update public.gate_pass_applications
         set status = 'approved', decided_at = now()
       where id = p_application_id;
    else
      if v_app.status = 'submitted' then
        update public.gate_pass_applications set status = 'under_review' where id = p_application_id;
      end if;

      -- Hand off to the next step's scope.
      insert into public.notifications (user_id, type, title, body, application_id)
      select p.id, 'review_required', 'Application awaiting your approval',
             format('A gate-pass request advanced to a %s step and needs your decision', v_role),
             p_application_id
      from public.approval_steps ns, public.profiles p
      where ns.application_id = p_application_id
        and ns.step_order = v_step.step_order + 1
        and p.role = ns.approver_role
        and p.department_id = ns.department_id
        and (ns.assigned_to is null or p.id = ns.assigned_to);
    end if;

  elsif p_action = 'reject' then
    update public.approval_steps
       set status = 'rejected', decided_by = v_uid, decided_at = now()
     where id = v_step.id
     returning * into v_step;
    update public.gate_pass_applications
       set status = 'rejected', decided_at = now()
     where id = p_application_id;

    insert into public.notifications (user_id, type, title, body, application_id)
    values (v_app.student_id, 'decision_made', 'Application rejected',
            format('Your gate-pass request was rejected: %s', p_remarks), p_application_id);

  elsif p_action = 'request_info' then
    update public.approval_steps
       set status = 'info_requested', decided_by = v_uid, decided_at = now()
     where id = v_step.id
     returning * into v_step;
    update public.gate_pass_applications
       set status = 'additional_info_required'
     where id = p_application_id;

    insert into public.notifications (user_id, type, title, body, application_id)
    values (v_app.student_id, 'info_requested', 'Additional information requested',
            format('%s requested more information: %s', (select full_name from public.profiles where id = v_uid), p_remarks),
            p_application_id);

  else
    raise exception 'Unknown action' using errcode = 'P0001';
  end if;

  insert into public.approval_actions (application_id, step_id, actor_id, action, remarks)
  values (p_application_id, v_step.id, v_uid,
          case p_action when 'approve' then 'approve'
                        when 'reject' then 'reject'
                        else 'request_info' end,
          p_remarks);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (
    v_uid, 'application.decided', 'gate_pass_applications', p_application_id,
    jsonb_build_object('action', p_action, 'step', v_step.step_order, 'role', v_role,
                       'remarks', p_remarks is not null)
  );

  return v_step;
end;
$$;

revoke execute on function public.fn_decide_application(uuid, text, text) from anon, public;
grant  execute on function public.fn_decide_application(uuid, text, text) to authenticated;

-- fn_provide_info ------------------------------------------------------------------
-- STUDENT (owner) only, only while `additional_info_required`. Stores the answer,
-- puts the paused step back to `pending` so it resumes as the active one, returns
-- the app to `under_review`, notifies the paused step's approver.
create or replace function public.fn_provide_info(
  p_application_id uuid,
  p_text           text
) returns void
language plpgsql security definer volatile
set search_path = public
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_role public.user_role := public.get_user_role(v_uid);
  v_app  public.gate_pass_applications;
  v_step public.approval_steps;
begin
  if v_role is distinct from 'student' or not exists (
    select 1 from public.gate_pass_applications a
    where a.id = p_application_id and a.student_id = v_uid
  ) then
    raise exception 'Only the owning student may provide information' using errcode = 'P0001';
  end if;

  select * into v_app from public.gate_pass_applications where id = p_application_id;
  if not found then
    raise exception 'Application not found' using errcode = 'P0001';
  end if;
  if v_app.status <> 'additional_info_required' then
    raise exception 'This application is not awaiting additional information' using errcode = 'P0001';
  end if;
  if char_length(p_text) = 0 or char_length(p_text) > 2000 then
    raise exception 'Answer must be 1–2000 characters' using errcode = 'P0001';
  end if;

  select * into v_step
  from public.approval_steps s
  where s.application_id = p_application_id and s.status = 'info_requested'
  order by s.step_order
  limit 1;
  if not found then
    raise exception 'No step is waiting for information — contact the administration' using errcode = 'P0001';
  end if;

  update public.approval_steps set status = 'pending' where id = v_step.id;
  update public.gate_pass_applications
     set status = 'under_review', additional_info = p_text
   where id = p_application_id;

  insert into public.approval_actions (application_id, step_id, actor_id, action, remarks)
  values (p_application_id, v_step.id, v_uid, 'provide_info', p_text);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (v_uid, 'application.info_provided', 'gate_pass_applications', p_application_id,
          jsonb_build_object('step', v_step.step_order));

  -- Inform the paused step's approver(s) that the answer arrived.
  insert into public.notifications (user_id, type, title, body, application_id)
  select p.id, 'info_received', 'Student answered your request',
         'The applicant provided additional information; your step is ready again.',
         p_application_id
  from public.profiles p
  where p.role = v_step.approver_role
    and p.department_id = v_step.department_id
    and (p.id = v_step.assigned_to or v_step.assigned_to is null);
end;
$$;

revoke execute on function public.fn_provide_info(uuid, text) from anon, public;
grant  execute on function public.fn_provide_info(uuid, text) to authenticated;

-- fn_issue_pass ----------------------------------------------------------------------
-- SYSTEM-only (invoked by the 0006 approval trigger). Deterministic HMAC token
-- (D-015): raw = HMAC-SHA256(secret, pass_id); only the SHA-256 hash is stored.
-- Validity = the trip window bounded by the rule's pass_validity_hours.
create or replace function public.fn_issue_pass(p_application_id uuid)
returns public.gate_passes
language plpgsql security definer volatile
set search_path = public, extensions   -- pgcrypto: digest / hmac / gen_random_bytes
as $$
declare
  v_app     public.gate_pass_applications;
  v_rule    public.approval_rules%rowtype;
  v_secret  text;
  v_id      uuid := gen_random_uuid();
  v_raw     text;
  v_code    text;
  v_pass    public.gate_passes;
  v_tries   int := 0;
begin
  select * into v_app from public.gate_pass_applications where id = p_application_id;
  if not found then
    raise exception 'Application % does not exist', p_application_id using errcode = 'P0001';
  end if;
  if v_app.status is distinct from 'approved' then
    raise exception 'Passes are issued only for approved applications' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.gate_passes where application_id = p_application_id) then
    raise exception 'Pass already issued for this application' using errcode = 'P0001';
  end if;

  select value into v_secret from private.app_secrets where name = 'qr_token_secret';
  if v_secret is null then
    raise exception 'QR token secret is not configured — issuance blocked (contact the administration)'
      using errcode = 'P0001';
  end if;

  select * into v_rule
  from public.approval_rules r
  where r.reason = v_app.reason
    and (r.department_id = v_app.department_id or r.department_id is null)
  order by r.department_id nulls last
  limit 1;
  if not found then
    raise exception 'No approval rule found for this application' using errcode = 'P0001';
  end if;

  v_raw := encode(hmac(v_secret, v_id::text, 'sha256'), 'hex');

  -- Human pass code: MPGI-<6 hex>; retry on the (rare) partial-unique clash.
  loop
    v_tries := v_tries + 1;
    v_code := 'MPGI-' || upper(encode(gen_random_bytes(3), 'hex'));
    if v_tries > 10 then
      raise exception 'Could not allocate a pass code — try again' using errcode = 'P0001';
    end if;
    exit when not exists (select 1 from public.gate_passes where pass_code = v_code);
  end loop;

  insert into public.gate_passes (
    id, application_id, token_hash, pass_code,
    valid_from, expires_at
  ) values (
    v_id, p_application_id,
    encode(digest(v_raw, 'sha256'), 'hex'),
    v_code,
    v_app.departure_at,
    least(v_app.expected_return_at, v_app.departure_at + make_interval(hours => v_rule.pass_validity_hours))
  ) returning * into v_pass;

  insert into public.notifications (user_id, type, title, body, application_id)
  values (v_app.student_id, 'pass_issued', 'Gate pass issued',
          format('Your gate pass %s is ready — valid until %s', v_pass.pass_code, v_pass.expires_at),
          p_application_id);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (null, 'pass.issued', 'gate_passes', v_pass.id,
          jsonb_build_object('application', p_application_id, 'code', v_pass.pass_code));

  return v_pass;
end;
$$;

revoke execute on function public.fn_issue_pass(uuid) from anon, authenticated, public;

-- fn_gate_record ----------------------------------------------------------------------
-- SECURITY (or admin) only. Resolves a pass by raw QR token hash OR human pass
-- code (case/whitespace-normalized), classifies the event, appends the log, and
-- on a valid `return` completes the application (§6). Unknown tokens are answered
-- without a log row (logs require a pass reference). Returns holder name +
-- validity ONLY — never reason/explanation text (T-11 contract).
create or replace function public.fn_gate_record(
  p_token_or_code text,
  p_event         public.verification_event
) returns jsonb
language plpgsql security definer volatile
set search_path = public, extensions   -- pgcrypto: digest (token-hash compare)
as $$
declare
  v_uid   uuid   := (select auth.uid());
  v_role  public.user_role := public.get_user_role(v_uid);
  v_probe text := trim(coalesce(p_token_or_code, ''));
  v_has_hash boolean;
  v_pass public.gate_passes;
  v_named jsonb;
  v_exit_ok boolean;
begin
  if v_role not in ('security', 'admin') then
    raise exception 'Only security staff may record gate events' using errcode = 'P0001';
  end if;
  if v_probe = '' then
    raise exception 'Provide the pass token or code' using errcode = 'P0001';
  end if;

  -- Does the probe look like a raw token (64 hex) or a human code (MPGI-…)?
  v_has_hash := v_probe ~ '^[0-9a-f]{64}$';

  select * into v_pass from public.gate_passes
  where (v_has_hash and token_hash = encode(digest(v_probe, 'sha256'), 'hex'))
     or (not v_has_hash
         and pass_code = upper(v_probe) and upper(v_probe) like 'MPGI-%')
  limit 1;
  if not found then
    return jsonb_build_object('result', 'invalid_token');
  end if;

  v_named := jsonb_build_object(
    'pass_code', v_pass.pass_code,
    'holder', (select full_name from public.profiles
               where id = (select student_id from public.gate_pass_applications
                           where id = v_pass.application_id)),
    'valid_from', v_pass.valid_from,
    'expires_at', v_pass.expires_at,
    'revoked_at', v_pass.revoked_at
  );

  if v_pass.revoked_at is not null then
    v_named := jsonb_set(v_named, '{result}', '"revoked"'::jsonb);
    insert into public.gate_verification_logs (pass_id, gate_user_id, event, result)
    values (v_pass.id, v_uid, p_event, 'revoked');
    return v_named;
  end if;

  select exists (
    select 1 from public.gate_verification_logs
    where pass_id = v_pass.id and event = 'exit' and result = 'valid'
  ) into v_exit_ok;

  if p_event = 'exit' then
    if v_exit_ok then
      v_named := jsonb_set(v_named, '{result}', '"already_exited"'::jsonb);
      insert into public.gate_verification_logs (pass_id, gate_user_id, event, result)
      values (v_pass.id, v_uid, 'exit', 'already_exited');
      return v_named;
    end if;
    if now() < v_pass.valid_from or now() > v_pass.expires_at then
      v_named := jsonb_set(v_named, '{result}', '"expired"'::jsonb);
      insert into public.gate_verification_logs (pass_id, gate_user_id, event, result)
      values (v_pass.id, v_uid, 'exit', 'expired');
      return v_named;
    end if;
    v_named := jsonb_set(v_named, '{result}', '"valid"'::jsonb);
    insert into public.gate_verification_logs (pass_id, gate_user_id, event, result)
    values (v_pass.id, v_uid, 'exit', 'valid');
    return v_named;
  end if;

  if p_event = 'return' then
    if not v_exit_ok then
      -- Return without a recorded exit: guard must verify manually (§6 addendum).
      v_named := jsonb_set(v_named, '{result}', '"staff_rejected"'::jsonb);
      insert into public.gate_verification_logs (pass_id, gate_user_id, event, result)
      values (v_pass.id, v_uid, 'return', 'staff_rejected');
      return v_named;
    end if;
    if exists (
      select 1 from public.gate_verification_logs
      where pass_id = v_pass.id and event = 'return' and result = 'valid'
    ) then
      v_named := jsonb_set(v_named, '{result}', '"already_returned"'::jsonb);
      insert into public.gate_verification_logs (pass_id, gate_user_id, event, result)
      values (v_pass.id, v_uid, 'return', 'already_returned');
      return v_named;
    end if;
    -- Late returns (past expires_at) are still valid: rejecting a student who is
    -- COMING BACK would strand them at the gate and freeze the application.
    -- Strictness lives at the exit window; admins revoke if ever needed.
    v_named := jsonb_set(v_named, '{result}', '"valid"'::jsonb);
    insert into public.gate_verification_logs (pass_id, gate_user_id, event, result)
    values (v_pass.id, v_uid, 'return', 'valid');
    update public.gate_pass_applications set status = 'completed'
     where id = v_pass.application_id;
    return v_named;
  end if;

  -- p_event = 'rejection': a manual staff decision, no transition (§5).
  v_named := jsonb_set(v_named, '{result}', '"staff_rejected"'::jsonb);
  insert into public.gate_verification_logs (pass_id, gate_user_id, event, result)
  values (v_pass.id, v_uid, 'rejection', 'staff_rejected');
  return v_named;
end;
$$;

revoke execute on function public.fn_gate_record(text, verification_event) from anon, public;
grant  execute on function public.fn_gate_record(text, verification_event) to authenticated;

-- fn_mark_notifications_read -----------------------------------------------------------
-- Owned-ids marking; a thin convenience over the RLS+column-grant path (same
-- guarantee either way — the grant layer pins `read_at`, the policy pins owner).
create or replace function public.fn_mark_notifications_read(p_ids uuid[])
returns int
language sql security definer volatile
set search_path = public
as $$
  with marked as (
    update public.notifications
       set read_at = now()
     where id = any(p_ids)
       and user_id = (select auth.uid())
       and read_at is null
    returning 1
  )
  select count(*)::int from marked;
$$;

revoke execute on function public.fn_mark_notifications_read(uuid[]) from anon, public;
grant  execute on function public.fn_mark_notifications_read(uuid[]) to authenticated;
