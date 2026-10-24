-- Submit a fresh CSE `personal` application as the seed student.
-- Requires: _vars.sql, an open transaction, role postgres.
-- Sets: test.app_id (transaction-local GUC).
-- Pin the two-step chain this fixture exercises; the update rolls back with the
-- transaction, so a demo admin's rule edit cannot make the test flaky.
update public.approval_rules
   set chain = '["faculty","hod"]'::jsonb, pass_validity_hours = 12
 where department_id = :'deptCse' and reason = 'personal';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub', :'studentCse', 'role', 'authenticated')::text,
  true
) as _ \gset

select id as app_id
from public.fn_submit_application(
  'personal'::public.gate_reason,
  now() + interval '1 hour',
  now() + interval '5 hours',
  'T-15 lifecycle fixture'
) \gset

select set_config('test.app_id', :'app_id', true) as _ \gset
