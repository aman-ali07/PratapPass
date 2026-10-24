-- Approve the fixture application through the CSE faculty -> HOD chain and
-- capture its pass. Requires: _vars.sql, _submit_app.sql, role authenticated
-- (the current JWT claims are replaced below).
-- Sets: test.pass_id, test.pass_code, test.raw_token.
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'facultyCse', 'role', 'authenticated')::text,
  true
) as _ \gset
select public.fn_decide_application(current_setting('test.app_id')::uuid, 'approve') \gset

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'hodCse', 'role', 'authenticated')::text,
  true
) as _ \gset
select public.fn_decide_application(current_setting('test.app_id')::uuid, 'approve') \gset

select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'admin', 'role', 'authenticated')::text,
  true
) as _ \gset
select id as pass_id, pass_code
from public.gate_passes
where application_id = current_setting('test.app_id')::uuid \gset
select public.fn_pass_qr_token(:'pass_id') as raw_token \gset
select set_config('test.pass_id', :'pass_id', true) as _ \gset
select set_config('test.pass_code', :'pass_code', true) as _ \gset
select set_config('test.raw_token', :'raw_token', true) as _ \gset
