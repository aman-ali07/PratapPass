-- 0008_document_cap_and_submit_id.sql -------------------------------------------
-- T-06 (D-016):
-- 1) The product cap on medical documents drops 10 MiB → 4 MiB: Vercel functions
--    reject request bodies over ~4.5 MB at the infrastructure level (no config
--    override exists), so a server-mediated upload cannot carry 10 MiB in
--    production. The DB CHECK is the last line; the app boundary and the bucket
--    (0007) enforce the same number.
-- 2) fn_submit_application gains an OPTIONAL server-allocated application id.
--    The T-06 server action generates the UUID server-side, which turns the
--    storage path `{application_id}/{uuid}.{ext}` (DATABASE.md §4) available
--    BEFORE the row exists — upload lands on its final path, no staging prefix,
--    no post-commit move. Calls without the parameter keep generating one and
--    keep the T-04 evidence behavior unchanged.

alter table public.medical_documents
  drop constraint medical_documents_byte_size_check;

alter table public.medical_documents
  add constraint medical_documents_byte_size_check
  check (byte_size > 0 and byte_size <= 4194304);

create or replace function public.fn_submit_application(
  p_reason             public.gate_reason,
  p_departure_at       timestamptz,
  p_expected_return_at timestamptz,
  p_explanation        text,
  p_docs               jsonb default '[]'::jsonb,
  p_application_id     uuid  default null
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
  v_app_id uuid            := coalesce(p_application_id, gen_random_uuid());
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
    id, student_id, department_id, reason, departure_at, expected_return_at, explanation
  ) values (
    v_app_id, v_uid, v_dept, p_reason, p_departure_at, p_expected_return_at, p_explanation
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

-- The five-argument overload is superseded by the explicit-id form; drop it so
-- exactly one callable signature remains (function identity includes defaults).
drop function public.fn_submit_application(gate_reason, timestamptz, timestamptz, text, jsonb);

revoke execute on function public.fn_submit_application(gate_reason, timestamptz, timestamptz, text, jsonb, uuid) from anon, public;
grant  execute on function public.fn_submit_application(gate_reason, timestamptz, timestamptz, text, jsonb, uuid) to authenticated;
