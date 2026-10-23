-- supabase/seed.sql -------------------------------------------------------------
-- ⚠️  LOCAL DEMO DATA ONLY (DATABASE.md §8). This file runs on `supabase db
-- reset` / `supabase seed` on a DEVELOPMENT machine. `supabase db push` (cloud)
-- NEVER applies it — do not move workflow seeds into migrations.
-- Every identity below is synthetic (24FAKE radios, placeholder names, a dev
-- QR secret). Re-running is safe: fixed UUIDs + ON CONFLICT DO NOTHING / guards.

-- 1) Departments ----------------------------------------------------------------
insert into public.departments (id, name, code) values
  ('00000000-0000-0000-0000-000000000101', 'Computer Science & Engineering', 'CSE'),
  ('00000000-0000-0000-0000-000000000102', 'Electronics & Communication',     'ECE'),
  ('00000000-0000-0000-0000-000000000103', 'Mechanical Engineering',          'ME')
on conflict (code) do nothing;

-- GoTrue sign-in requires the API-shape of these fields: instance_id is the
-- zero-uuid (deprecated column but still scoped on), raw_app_meta_data names
-- the email provider, and the token columns are scanned as Go strings — NULL
-- there breaks the login scan ("Database error querying schema"); the API
-- always writes empty strings for them.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, email_change,
                        confirmation_token, recovery_token, email_change_token_new)
select v.id, v.instance_id, v.aud, v.role, v.email, v.encrypted_password,
       v.email_confirmed_at, v.created_at, v.updated_at,
       '{"provider":"email","providers":["email"]}'::jsonb,
       v.raw_user_meta_data, '', '', '', ''
from (values
-- students
  ('00000000-0000-0000-0000-000000000001'::uuid,
   '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
   'aarav.demo@pratappass.test', crypt('DemoPassw0rd!', gen_salt('bf'))::text,
   now(), now(), now(), '{"full_name":"Aarav Demo","roll_number":"24FAKE0001"}'::jsonb),
  ('00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'isha.demo@pratappass.test', crypt('DemoPassw0rd!', gen_salt('bf'))::text,
   now(), now(), now(), '{"full_name":"Isha Test","roll_number":"24FAKE0002"}'::jsonb),
-- staff (profiles upgraded below)
  ('00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'faculty.demo@pratappass.test', crypt('DemoPassw0rd!', gen_salt('bf'))::text,
   now(), now(), now(), '{"full_name":"Dr. Demo Faculty"}'::jsonb),
  ('00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'hod.demo@pratappass.test', crypt('DemoPassw0rd!', gen_salt('bf'))::text,
   now(), now(), now(), '{"full_name":"Dr. Demo HOD"}'::jsonb),
  ('00000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'security.demo@pratappass.test', crypt('DemoPassw0rd!', gen_salt('bf'))::text,
   now(), now(), now(), '{"full_name":"Security Demo"}'::jsonb),
  ('00000000-0000-0000-0000-000000000006',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'admin.demo@pratappass.test', crypt('DemoPassw0rd!', gen_salt('bf'))::text,
   now(), now(), now(), '{"full_name":"Admin Demo"}'::jsonb)
) as v(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
where not exists (select 1 from auth.users u where u.email = v.email);

-- Email/password logins resolve through auth.identities as well (no row →
-- "Invalid login credentials" even with a valid hash).
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', u.email_confirmed_at, u.created_at, u.updated_at
from auth.users u
where u.email like '%.demo@pratappass.test'
  and not exists (select 1 from auth.identities i
                  where i.user_id = u.id and i.provider = 'email');

-- 3) Staff upgrades (0002 column grants do not bind the seed owner) ---------------
update public.profiles set
  role          = 'faculty',
  department_id = '00000000-0000-0000-0000-000000000101',
  designation   = 'Assistant Professor'
where id = '00000000-0000-0000-0000-000000000003';

update public.profiles set
  role          = 'hod',
  department_id = '00000000-0000-0000-0000-000000000101',
  designation   = 'Head of Department'
where id = '00000000-0000-0000-0000-000000000004';

update public.profiles set
  role = 'security',
  designation = 'Gate Security'
where id = '00000000-0000-0000-0000-000000000005';

update public.profiles set
  role = 'admin',
  designation = 'Administrator'
where id = '00000000-0000-0000-0000-000000000006';

-- 4) Students belong to a program department (rule lookup + app snapshots) --------
update public.profiles set department_id = '00000000-0000-0000-0000-000000000101'
 where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set department_id = '00000000-0000-0000-0000-000000000102'
 where id = '00000000-0000-0000-0000-000000000002';

-- 5) Demo rules (global defaults + one department override showcasing lookup) -----
insert into public.approval_rules (department_id, reason, chain, requires_medical_document, pass_validity_hours) values
  (null, 'medical',  '["faculty","hod"]'::jsonb, true,  12),
  (null, 'personal', '["hod"]'::jsonb,           false, 12),
  (null, 'emergency','["hod"]'::jsonb,           false, 12),
  ('00000000-0000-0000-0000-000000000101', 'personal', '["faculty","hod"]'::jsonb, false, 12) -- CSE override
on conflict do nothing;

-- 6) Dev QR secret (D-015): fine for local only; go-live provisions prod value ----
insert into private.app_secrets (name, value) values ('qr_token_secret', 'local-demo-secret-not-for-prod')
on conflict (name) do nothing;

-- 7) Demo workflow ---------------------------------------------------------------
-- App A (medical, CSE): queued at faculty — the live demo the faculty user sees.
insert into public.gate_pass_applications (id, student_id, department_id, reason, departure_at, expected_return_at, explanation)
values ('00000000-0000-0000-0000-000000002001',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000101', 'medical',
        now() + interval '1 day', now() + interval '2 days',
        'Dental surgery in the morning; need two days off campus.')
on conflict (id) do nothing;

insert into public.approval_steps (application_id, step_order, approver_role, department_id, status) values
  ('00000000-0000-0000-0000-000000002001', 1, 'faculty', '00000000-0000-0000-0000-000000000101', 'pending'),
  ('00000000-0000-0000-0000-000000002001', 2, 'hod',     '00000000-0000-0000-0000-000000000101', 'pending')
on conflict (application_id, step_order) do nothing;

insert into public.medical_documents (application_id, storage_path, content_type, byte_size, label, uploaded_by) values
  ('00000000-0000-0000-0000-000000002001',
   'staging/00000000-0000-0000-0000-000000002001/6f9a1b2c-3333-4a56-b0d5-916b0b3e2a03.pdf',
   'application/pdf', 20480, 'Dental surgery advisory',
   '00000000-0000-0000-0000-000000000001')
on conflict (storage_path) do nothing;

insert into public.notifications (user_id, type, title, body, application_id)
select '00000000-0000-0000-0000-000000000001', 'application_submitted', 'Application submitted',
       'Your gate-pass application was received and is awaiting approval.',
       '00000000-0000-0000-0000-000000002001'
where not exists (select 1 from public.notifications n
                  where n.application_id = '00000000-0000-0000-0000-000000002001'
                    and n.type = 'application_submitted'
                    and n.user_id = '00000000-0000-0000-0000-000000000001');

insert into public.notifications (user_id, type, title, body, application_id)
select '00000000-0000-0000-0000-000000000003', 'review_required', 'New application to review',
       'Aarav Demo submitted a medical gate-pass request for your approval.',
       '00000000-0000-0000-0000-000000002001'
where not exists (select 1 from public.notifications n
                  where n.application_id = '00000000-0000-0000-0000-000000002001'
                    and n.type = 'review_required'
                    and n.user_id = '00000000-0000-0000-0000-000000000003');

-- App B (personal, ECE): queued for an ECE hod (BEFORE that provisioning exists —
-- demonstrates the empty-queue state for staff without matching steps).
insert into public.gate_pass_applications (id, student_id, department_id, reason, departure_at, expected_return_at, explanation)
values ('00000000-0000-0000-0000-000000002002',
        '00000000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000102', 'personal',
        now() + interval '3 hours', now() + interval '6 hours',
        'Home for a family function this evening.')
on conflict (id) do nothing;

insert into public.approval_steps (application_id, step_order, approver_role, department_id, status) values
  ('00000000-0000-0000-0000-000000002002', 1, 'hod', '00000000-0000-0000-0000-000000000102', 'pending')
on conflict (application_id, step_order) do nothing;

insert into public.notifications (user_id, type, title, body, application_id)
select '00000000-0000-0000-0000-000000000002', 'application_submitted', 'Application submitted',
       'Your gate-pass application was received and is awaiting approval.',
       '00000000-0000-0000-0000-000000002002'
where not exists (select 1 from public.notifications n
                  where n.application_id = '00000000-0000-0000-0000-000000002002'
                    and n.type = 'application_submitted'
                    and n.user_id = '00000000-0000-0000-0000-000000000002');

-- App C (Aaraf's COMPLETED emergency trip): exercises the full timeline, an issued
-- pass, and gate logs — the story a student sees in their history.
insert into public.gate_pass_applications (id, student_id, department_id, reason, departure_at, expected_return_at, explanation, status, submitted_at, decided_at)
values ('00000000-0000-0000-0000-000000002003',
        '00000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000101', 'emergency',
        now() - interval '5 hours', now() - interval '1 hour',
        'Escorted a sick roommate to emergency care; returning by evening.', 'completed',
        now() - interval '6 hours', now() - interval '2 hours')
on conflict (id) do nothing;

insert into public.approval_steps (application_id, step_order, approver_role, department_id, status, decided_by, decided_at) values
  ('00000000-0000-0000-0000-000000002003', 1, 'hod', '00000000-0000-0000-0000-000000000101', 'approved',
   '00000000-0000-0000-0000-000000000004', now() - interval '2 hours')
on conflict (application_id, step_order) do nothing;

insert into public.approval_actions (application_id, step_id, actor_id, action, remarks, created_at)
select '00000000-0000-0000-0000-000000002003', s.id,
       '00000000-0000-0000-0000-000000000004', 'approve',
       'Emergency — approved immediately', now() - interval '2 hours'
from public.approval_steps s
where s.application_id = '00000000-0000-0000-0000-000000002003' and s.step_order = 1
  and not exists (select 1 from public.approval_actions x
                  where x.application_id = s.application_id and x.step_id = s.id);

insert into public.gate_passes (id, application_id, token_hash, pass_code, issued_at, valid_from, expires_at)
values ('00000000-0000-0000-0000-000000002103',
        '00000000-0000-0000-0000-000000002003',
        encode(digest(encode(extensions.hmac('local-demo-secret-not-for-prod',
                                             '00000000-0000-0000-0000-000000002103', 'sha256'), 'hex'), 'sha256'), 'hex'),
        'MPGI-100F0A', now() - interval '3 hours',
        now() - interval '5 hours', now() - interval '1 hour')
on conflict (application_id) do nothing;

insert into public.gate_verification_logs (pass_id, gate_user_id, event, result, occurred_at)
select g.id, '00000000-0000-0000-0000-000000000005',
       v.event::public.verification_event, v.result::public.verification_result, now() - v.hours
from public.gate_passes g,
     (values ('exit', 'valid', interval '4 hours'), ('return', 'valid', interval '2 hours')) as v(event, result, hours)
where g.application_id = '00000000-0000-0000-0000-000000002003'
  and not exists (select 1 from public.gate_verification_logs l
                  where l.pass_id = g.id and l.event = v.event::public.verification_event
                    and l.result = v.result::public.verification_result);

insert into public.notifications (user_id, type, title, body, application_id)
select '00000000-0000-0000-0000-000000000001', 'pass_issued', 'Gate pass issued',
       'Your emergency gate pass is ready.', '00000000-0000-0000-0000-000000002003'
where not exists (select 1 from public.notifications n
                  where n.application_id = '00000000-0000-0000-0000-000000002003'
                    and n.type = 'pass_issued');

insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata, created_at)
select null, 'seed.applied', 'database', '00000000-0000-0000-0000-000000000000'::uuid,
       jsonb_build_object('note', 'local demo seed — excluded from cloud pushes'), now()
where not exists (select 1 from public.audit_logs a
                  where a.action = 'seed.applied'
                    and a.entity_id = '00000000-0000-0000-0000-000000000000');
