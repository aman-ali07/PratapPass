-- T-15 workflow fixture: submit -> request_info -> provide_info -> faculty ->
-- HOD -> pass -> gate exit/return -> completed, with denial probes. Everything
-- runs in one transaction and is rolled back, so the local demo DB is unchanged.
\set ON_ERROR_STOP on
begin;
\ir _helpers.sql
\ir _vars.sql
\ir _submit_app.sql

-- ── Student submission ──────────────────────────────────────────────────────
do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_app    public.gate_pass_applications;
  v_steps  int;
begin
  select * into v_app from public.gate_pass_applications where id = v_app_id;
  perform pg_temp.expect_eq(v_app.status::text, 'submitted', 'submit: status');
  perform pg_temp.expect_eq(v_app.reason::text, 'personal', 'submit: reason');
  perform pg_temp.expect_eq(v_app.department_id::text, '00000000-0000-0000-0000-000000000101',
    'submit: department');

  select count(*) into v_steps from public.approval_steps where application_id = v_app_id;
  perform pg_temp.expect_eq(v_steps::text, '2', 'submit: two-step CSE personal chain');
  select count(*) into v_steps
    from public.approval_steps where application_id = v_app_id and status = 'pending';
  perform pg_temp.expect_eq(v_steps::text, '2', 'submit: both steps pending');

  perform pg_temp.expect_error(
    format('select public.fn_decide_application(%L, %L)', v_app_id, 'approve'),
    'Only faculty or HOD members may decide applications',
    'student cannot decide');
  perform pg_temp.expect_error(
    format('select public.fn_gate_record(%L, %L)', 'MPGI-000000', 'exit'),
    'Only security staff may record gate events',
    'student cannot record gate events');
end $$;

reset role;

do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_count  int;
begin
  select count(*) into v_count from public.notifications
   where application_id = v_app_id and type = 'review_required';
  perform pg_temp.expect_eq((v_count > 0)::text, 'true', 'submit: faculty notified');

  select count(*) into v_count from public.audit_logs
   where entity_id = v_app_id and action = 'application.submitted';
  perform pg_temp.expect_eq(v_count::text, '1', 'submit: audit row');
end $$;

-- ── HOD cannot skip the faculty step ────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'hodCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_decide_application(%L, %L)',
      current_setting('test.app_id')::uuid, 'approve'),
    'You are not the assigned approver for the current step',
    'HOD cannot skip step 1');
end $$;

-- ── Faculty: validation + request_info pause ────────────────────────────────
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'facultyCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_app    public.gate_pass_applications;
  v_step   public.approval_steps;
begin
  perform pg_temp.expect_error(
    format('select public.fn_decide_application(%L, %L)', v_app_id, 'reject'),
    'Remarks are required when rejecting or requesting information',
    'reject requires remarks');
  perform pg_temp.expect_error(
    format('select public.fn_decide_application(%L, %L)', v_app_id, 'bogus'),
    'Unknown action',
    'unknown action rejected');

  perform public.fn_decide_application(v_app_id, 'request_info', 'Attach the certificate');

  select * into v_app from public.gate_pass_applications where id = v_app_id;
  perform pg_temp.expect_eq(v_app.status::text, 'additional_info_required',
    'request_info: app paused');
  select * into v_step from public.approval_steps
   where application_id = v_app_id and step_order = 1;
  perform pg_temp.expect_eq(v_step.status::text, 'info_requested',
    'request_info: step paused');

  perform pg_temp.expect_error(
    format('select public.fn_decide_application(%L, %L)', v_app_id, 'approve'),
    'This application is not awaiting a decision (additional_info_required)',
    'cannot decide while paused');
end $$;

reset role;
do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_count  int;
begin
  select count(*) into v_count from public.notifications
   where application_id = v_app_id and type = 'info_requested'
     and user_id = '00000000-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq((v_count > 0)::text, 'true', 'request_info: student notified');
  select count(*) into v_count from public.audit_logs
   where entity_id = v_app_id and action = 'application.decided'
     and metadata->>'action' = 'request_info';
  perform pg_temp.expect_eq((v_count > 0)::text, 'true', 'request_info: audit row');
end $$;

-- ── Student answer (and a foreign-student denial) ───────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'studentCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_app    public.gate_pass_applications;
  v_step   public.approval_steps;
  v_actions int;
begin
  perform public.fn_provide_info(v_app_id, 'Certificate attached.');

  select * into v_app from public.gate_pass_applications where id = v_app_id;
  perform pg_temp.expect_eq(v_app.status::text, 'under_review', 'provide_info: resumed');
  select * into v_step from public.approval_steps
   where application_id = v_app_id and step_order = 1;
  perform pg_temp.expect_eq(v_step.status::text, 'pending', 'provide_info: step resumed');
  select count(*) into v_actions from public.approval_actions
   where application_id = v_app_id and action = 'provide_info';
  perform pg_temp.expect_eq(v_actions::text, '1', 'provide_info: action recorded');

  perform pg_temp.expect_error(
    format('select public.fn_provide_info(%L, %L)', v_app_id, 'again'),
    'This application is not awaiting additional information',
    'provide_info only while paused');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'studentEce', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_provide_info(%L, %L)',
      current_setting('test.app_id')::uuid, 'foreign answer'),
    'Only the owning student may provide information',
    'foreign student cannot answer');
end $$;

reset role;
do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_count  int;
begin
  select count(*) into v_count from public.notifications
   where application_id = v_app_id and type = 'info_received'
     and user_id = '00000000-0000-0000-0000-000000000003';
  perform pg_temp.expect_eq((v_count > 0)::text, 'true', 'provide_info: faculty notified');
  select count(*) into v_count from public.audit_logs
   where entity_id = v_app_id and action = 'application.info_provided';
  perform pg_temp.expect_eq((v_count > 0)::text, 'true', 'provide_info: audit row');
end $$;

-- ── Faculty approve -> HOD approve -> pass issuance ─────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'facultyCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_app    public.gate_pass_applications;
  v_step   public.approval_steps;
begin
  perform public.fn_decide_application(v_app_id, 'approve');

  select * into v_app from public.gate_pass_applications where id = v_app_id;
  perform pg_temp.expect_eq(v_app.status::text, 'under_review', 'faculty approve: under review');
  select * into v_step from public.approval_steps
   where application_id = v_app_id and step_order = 1;
  perform pg_temp.expect_eq(v_step.status::text, 'approved', 'faculty approve: step 1 done');
  select * into v_step from public.approval_steps
   where application_id = v_app_id and step_order = 2;
  perform pg_temp.expect_eq(v_step.status::text, 'pending', 'faculty approve: HOD next');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'hodCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_app    public.gate_pass_applications;
  v_pass   public.gate_passes;
begin
  perform public.fn_decide_application(v_app_id, 'approve');

  select * into v_app from public.gate_pass_applications where id = v_app_id;
  perform pg_temp.expect_eq(v_app.status::text, 'approved', 'HOD approve: approved');
  select * into v_pass from public.gate_passes where application_id = v_app_id;
  perform pg_temp.expect_eq((v_pass.id is not null)::text, 'true', 'HOD approve: pass issued');
  perform pg_temp.expect_eq((v_pass.pass_code ~ '^MPGI-[0-9A-F]{6}$')::text, 'true',
    'pass: MPGI code shape');
  perform pg_temp.expect_eq((v_pass.token_hash ~ '^[0-9a-f]{64}$')::text, 'true',
    'pass: hashed token');
  perform pg_temp.expect_eq(v_pass.valid_from::text, v_app.departure_at::text,
    'pass: starts at departure');
  perform pg_temp.expect_eq(v_pass.expires_at::text, v_app.expected_return_at::text,
    'pass: ends at return (within 12h)');

  perform pg_temp.expect_error(
    format('select public.fn_decide_application(%L, %L)', v_app_id, 'approve'),
    'This application is not awaiting a decision (approved)',
    'cannot decide an approved application');
end $$;

reset role;
do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_count  int;
  v_pass_id uuid;
begin
  select id into v_pass_id from public.gate_passes where application_id = v_app_id;
  select count(*) into v_count from public.notifications
   where application_id = v_app_id and type = 'review_required'
     and user_id = '00000000-0000-0000-0000-000000000004';
  perform pg_temp.expect_eq((v_count > 0)::text, 'true', 'faculty approve: HOD notified');
  select count(*) into v_count from public.notifications
   where application_id = v_app_id and type = 'pass_issued'
     and user_id = '00000000-0000-0000-0000-000000000001';
  perform pg_temp.expect_eq((v_count > 0)::text, 'true', 'HOD approve: student notified');
  select count(*) into v_count from public.audit_logs
   where entity_id = v_pass_id and action = 'pass.issued';
  perform pg_temp.expect_eq(v_count::text, '1', 'HOD approve: pass audit row');

  -- Make the pass valid for "now" so the gate transition can be exercised.
  update public.gate_passes
     set valid_from = now() - interval '1 hour', expires_at = now() + interval '1 hour'
   where id = v_pass_id;
  perform set_config('test.pass_id', v_pass_id::text, true);
  perform set_config('test.pass_code',
    (select pass_code from public.gate_passes where id = v_pass_id), true);
end $$;

-- ── Gate lifecycle: exit -> duplicate exit -> return -> duplicate return ────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'security', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
declare
  v_pass_code text := current_setting('test.pass_code');
  v_pass_id   uuid := current_setting('test.pass_id')::uuid;
  v_result    jsonb;
begin
  v_result := public.fn_gate_record(v_pass_code, 'exit');
  perform pg_temp.expect_eq(v_result->>'result', 'valid', 'gate: exit valid');
  perform pg_temp.expect_eq((v_result ? 'reason')::text, 'false', 'gate: no reason in payload');

  v_result := public.fn_gate_record(v_pass_code, 'exit');
  perform pg_temp.expect_eq(v_result->>'result', 'already_exited', 'gate: duplicate exit');
  v_result := public.fn_gate_record(v_pass_code, 'return');
  perform pg_temp.expect_eq(v_result->>'result', 'valid', 'gate: return valid');
  v_result := public.fn_gate_record(v_pass_code, 'return');
  perform pg_temp.expect_eq(v_result->>'result', 'already_returned', 'gate: duplicate return');

  v_result := public.fn_gate_record('MPGI-000000', 'exit');
  perform pg_temp.expect_eq(v_result->>'result', 'invalid_token', 'gate: unknown code');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'studentCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_gate_record(%L, %L)', 'MPGI-000000', 'exit'),
    'Only security staff may record gate events',
    'gate: student denied (explicit role)');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'security', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_decide_application(%L, %L)',
      current_setting('test.app_id')::uuid, 'approve'),
    'Only faculty or HOD members may decide applications',
    'security cannot decide');
end $$;

reset role;
do $$
declare
  v_app_id uuid := current_setting('test.app_id')::uuid;
  v_pass_id uuid := current_setting('test.pass_id')::uuid;
  v_count int;
  v_app public.gate_pass_applications;
begin
  select * into v_app from public.gate_pass_applications where id = v_app_id;
  perform pg_temp.expect_eq(v_app.status::text, 'completed', 'return completes the application');

  select count(*) into v_count from public.gate_verification_logs where pass_id = v_pass_id;
  perform pg_temp.expect_eq(v_count::text, '4', 'gate: four log rows');
  select count(*) into v_count from public.gate_verification_logs
   where pass_id = v_pass_id and gate_user_id = '00000000-0000-0000-0000-000000000005';
  perform pg_temp.expect_eq(v_count::text, '4', 'gate: logs bound to security');

  select count(*) into v_count from public.gate_verification_logs
   where pass_id = v_pass_id and event = 'exit' and result = 'valid';
  perform pg_temp.expect_eq(v_count::text, '1', 'gate: one valid exit');
  select count(*) into v_count from public.gate_verification_logs
   where pass_id = v_pass_id and event = 'return' and result = 'valid';
  perform pg_temp.expect_eq(v_count::text, '1', 'gate: one valid return');
end $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'hodCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_decide_application(%L, %L)',
      current_setting('test.app_id')::uuid, 'approve'),
    'This application is not awaiting a decision (completed)',
    'cannot decide a completed application');
end $$;

-- Anonymous execution is denied by the function grant (not by a role guard).
reset role;
set local role anon;
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_gate_record(%L, %L)', 'MPGI-000000', 'exit'),
    '%permission denied for function fn_gate_record%',
    'anonymous cannot record gate events');
end $$;

rollback;
