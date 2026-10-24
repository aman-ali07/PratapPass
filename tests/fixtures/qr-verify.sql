-- T-15 QR/verify fixture: token derivation scope, anonymous raw-token-only
-- verification, read-only classification, exit/return state, and the promise
-- that a medical pass never leaks reason/medical text. Rolled back at the end.
\set ON_ERROR_STOP on
begin;
\ir _helpers.sql
\ir _vars.sql
\ir _submit_app.sql
\ir _approve_app.sql

reset role;
do $$
declare
  v_pass_id uuid := current_setting('test.pass_id')::uuid;
  v_raw     text := current_setting('test.raw_token');
  v_hash    text;
begin
  perform pg_temp.expect_eq((v_raw ~ '^[0-9a-f]{64}$')::text, 'true',
    'qr: raw token is 64 hex');
  select token_hash into v_hash from public.gate_passes where id = v_pass_id;
  perform pg_temp.expect_eq(encode(digest(v_raw, 'sha256'), 'hex'), v_hash,
    'qr: raw token digest matches stored hash');

  -- The personal pass is valid now for the gate transitions below.
  update public.gate_passes
     set valid_from = now() - interval '1 hour', expires_at = now() + interval '1 hour'
   where id = v_pass_id;
end $$;

-- ── Token derivation scope ──────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'studentCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
declare
  v_owner_token text;
begin
  v_owner_token := public.fn_pass_qr_token(current_setting('test.pass_id')::uuid);
  perform pg_temp.expect_eq(v_owner_token, current_setting('test.raw_token'),
    'qr: owner derives the same token');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'admin', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_eq(
    public.fn_pass_qr_token(current_setting('test.pass_id')::uuid),
    current_setting('test.raw_token'),
    'qr: admin derives the same token');
  perform pg_temp.expect_error(
    format('select public.fn_pass_qr_token(%L)', '00000000-0000-0000-0000-000000000000'),
    'Pass not found',
    'qr: unknown pass id');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'studentEce', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_pass_qr_token(%L)', current_setting('test.pass_id')),
    'You cannot view this pass',
    'qr: foreign student denied');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'facultyCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_pass_qr_token(%L)', current_setting('test.pass_id')),
    'You cannot view this pass',
    'qr: faculty denied');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'hodCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_pass_qr_token(%L)', current_setting('test.pass_id')),
    'You cannot view this pass',
    'qr: HOD denied');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'security', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_pass_qr_token(%L)', current_setting('test.pass_id')),
    'You cannot view this pass',
    'qr: security denied');
end $$;

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true) as _ \gset
do $$
begin
  perform pg_temp.expect_error(
    format('select public.fn_pass_qr_token(%L)', current_setting('test.pass_id')),
    '%permission denied for function fn_pass_qr_token%',
    'qr: anonymous denied');
end $$;

-- ── Anonymous verification: raw token only, no medical fields ───────────────
do $$
declare
  v_payload jsonb;
  v_keys    text;
begin
  v_payload := public.fn_gate_verify(current_setting('test.raw_token'));
  select string_agg(k, ',' order by k) into v_keys from jsonb_object_keys(v_payload) k;
  perform pg_temp.expect_eq(v_keys,
    'department,exit_state,expires_at,holder,pass_code,result,revoked_at,valid_from',
    'verify: exact payload keys');
  perform pg_temp.expect_eq(v_payload->>'result', 'valid', 'verify: valid');
  perform pg_temp.expect_eq(v_payload->>'holder', 'Aarav Demo', 'verify: holder');
  perform pg_temp.expect_eq(v_payload->>'department', 'Computer Science & Engineering',
    'verify: department');
  perform pg_temp.expect_eq(v_payload->>'pass_code', current_setting('test.pass_code'),
    'verify: pass code');
  perform pg_temp.expect_eq(v_payload->>'exit_state', 'not_exited', 'verify: not exited');
  perform pg_temp.expect_eq(coalesce(v_payload->>'revoked_at', ''), '',
    'verify: not revoked');
  perform pg_temp.expect_eq((v_payload ? 'reason')::text, 'false', 'verify: no reason key');
  perform pg_temp.expect_eq((v_payload ? 'explanation')::text, 'false',
    'verify: no explanation key');
  perform pg_temp.expect_eq((v_payload ? 'documents')::text, 'false',
    'verify: no documents key');
  perform pg_temp.expect_eq((v_payload::text ~* 'medical')::text, 'false',
    'verify: no medical text');

  -- 24-bit human codes are never accepted anonymously.
  v_payload := public.fn_gate_verify(current_setting('test.pass_code'));
  perform pg_temp.expect_eq(v_payload->>'result', 'invalid_token',
    'verify: anon code refused');
  perform pg_temp.expect_eq((select count(*)::text from jsonb_object_keys(v_payload)), '1',
    'verify: refused payload is minimal');

  v_payload := public.fn_gate_verify(repeat('0', 64));
  perform pg_temp.expect_eq(v_payload->>'result', 'invalid_token',
    'verify: unknown raw token');
end $$;

-- ── Security may classify by code; students may not ─────────────────────────
reset role;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'security', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
declare
  v_payload jsonb;
begin
  v_payload := public.fn_gate_verify(current_setting('test.pass_code'));
  perform pg_temp.expect_eq(v_payload->>'result', 'valid', 'verify: security code resolves');
  perform pg_temp.expect_eq(v_payload->>'pass_code', current_setting('test.pass_code'),
    'verify: security sees the code');
end $$;

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'studentCse', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_eq(
    public.fn_gate_verify(current_setting('test.pass_code'))->>'result',
    'invalid_token',
    'verify: student code refused');
end $$;

-- ── Read-only verification and revoked/expired classification ───────────────
reset role;
do $$
declare
  v_pass_id uuid := current_setting('test.pass_id')::uuid;
  v_before  int;
  v_after   int;
begin
  select count(*) into v_before from public.gate_verification_logs where pass_id = v_pass_id;
  perform pg_temp.expect_eq(v_before::text, '0', 'verify: no log rows yet');

  perform set_config('test.log_before', v_before::text, true);
end $$;

set local role anon;
select set_config('request.jwt.claims', '', true) as _ \gset
do $$
begin
  perform public.fn_gate_verify(current_setting('test.raw_token'));
  perform public.fn_gate_verify(current_setting('test.pass_code'));
  perform public.fn_gate_verify(repeat('0', 64));
end $$;

reset role;
do $$
declare
  v_pass_id uuid := current_setting('test.pass_id')::uuid;
  v_after   int;
  v_payload jsonb;
begin
  select count(*) into v_after from public.gate_verification_logs where pass_id = v_pass_id;
  perform pg_temp.expect_eq(v_after::text, current_setting('test.log_before'),
    'verify: no log writes');

  update public.gate_passes set revoked_at = now() where id = v_pass_id;
  perform set_config('test.pass_id', v_pass_id::text, true);
end $$;

set local role anon;
select set_config('request.jwt.claims', '', true) as _ \gset
do $$
begin
  perform pg_temp.expect_eq(
    public.fn_gate_verify(current_setting('test.raw_token'))->>'result',
    'revoked',
    'verify: revoked classification');
end $$;

reset role;
update public.gate_passes set revoked_at = null,
  valid_from = now() - interval '2 hours', expires_at = now() - interval '1 hour'
 where id = current_setting('test.pass_id')::uuid;

set local role anon;
select set_config('request.jwt.claims', '', true) as _ \gset
do $$
begin
  perform pg_temp.expect_eq(
    public.fn_gate_verify(current_setting('test.raw_token'))->>'result',
    'expired',
    'verify: expired classification');
end $$;

reset role;
update public.gate_passes
  set valid_from = now() - interval '1 hour', expires_at = now() + interval '1 hour'
 where id = current_setting('test.pass_id')::uuid;

-- ── Gate lifecycle reflected by the read-only view ──────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'security', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_eq(
    public.fn_gate_record(current_setting('test.pass_code'), 'exit')->>'result',
    'valid',
    'verify: exit recorded');
end $$;

set local role anon;
select set_config('request.jwt.claims', '', true) as _ \gset
do $$
declare
  v_payload jsonb;
begin
  v_payload := public.fn_gate_verify(current_setting('test.raw_token'));
  perform pg_temp.expect_eq(v_payload->>'result', 'already_exited',
    'verify: exited classification');
  perform pg_temp.expect_eq(v_payload->>'exit_state', 'exited', 'verify: exit state');
end $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'security', 'role', 'authenticated')::text,
  true
) as _ \gset
do $$
begin
  perform pg_temp.expect_eq(
    public.fn_gate_record(current_setting('test.pass_code'), 'return')->>'result',
    'valid',
    'verify: return recorded');
end $$;

set local role anon;
select set_config('request.jwt.claims', '', true) as _ \gset
do $$
declare
  v_payload jsonb;
begin
  v_payload := public.fn_gate_verify(current_setting('test.raw_token'));
  perform pg_temp.expect_eq(v_payload->>'result', 'already_returned',
    'verify: returned classification');
  perform pg_temp.expect_eq(v_payload->>'exit_state', 'returned', 'verify: return state');
end $$;

reset role;
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.gate_verification_logs
   where pass_id = current_setting('test.pass_id')::uuid;
  perform pg_temp.expect_eq(v_count::text, '2', 'verify: two gate log rows');
end $$;

-- ── A medical pass exposes no medical/reason text ───────────────────────────
reset role;
update public.approval_rules
   set chain = '["faculty","hod"]'::jsonb, requires_medical_document = true,
       pass_validity_hours = 12
 where department_id is null and reason = 'medical';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'studentCse', 'role', 'authenticated')::text,
  true
) as _ \gset
select id as medical_app_id
from public.fn_submit_application(
  'medical'::public.gate_reason,
  now() + interval '1 hour',
  now() + interval '5 hours',
  'T-15 medical privacy fixture',
  '[{"storage_path":"tests/t15-medical.pdf","content_type":"application/pdf","byte_size":1024,"label":"T-15 medical fixture"}]'::jsonb
) \gset
select set_config('test.app_id', :'medical_app_id', true) as _ \gset
\ir _approve_app.sql

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true) as _ \gset
do $$
declare
  v_payload jsonb;
begin
  v_payload := public.fn_gate_verify(current_setting('test.raw_token'));
  perform pg_temp.expect_eq(v_payload->>'holder', 'Aarav Demo', 'medical verify: holder');
  perform pg_temp.expect_eq((v_payload ? 'reason')::text, 'false',
    'medical verify: no reason key');
  perform pg_temp.expect_eq((v_payload ? 'explanation')::text, 'false',
    'medical verify: no explanation key');
  perform pg_temp.expect_eq((v_payload ? 'documents')::text, 'false',
    'medical verify: no documents key');
  perform pg_temp.expect_eq((v_payload::text like '%T-15 medical privacy fixture%')::text,
    'false', 'medical verify: explanation absent');
  perform pg_temp.expect_eq((v_payload::text ~* 'medical')::text, 'false',
    'medical verify: no medical text');
end $$;

rollback;
