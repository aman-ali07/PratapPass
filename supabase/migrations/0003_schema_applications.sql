-- 0003_schema_applications.sql -------------------------------------------------
-- T-03: remaining application/workflow tables. DATABASE.md §2/§3 is normative;
-- deviations from the drafted doc are recorded there when this lands:
--  * `gate_passes.pass_code` added (PRD SE-1 human pass code / audit AD);
--    nullable until fn_issue_pass populates it (unique when present).
--  * `step_status` has no 'active' variant — DATABASE.md §1 vocabulary is the
--    basis; activation is a transition the decide function performs (T-05).
--  * `approval_rules.expedited` column dropped: derived display value; the
--    emergency canonical-ness is enforced by CHECK (see below).
-- Workflow UPDATE/INSERT happens only via SECURITY DEFINER functions (§5);
-- INSERT/UPDATE/DELETE grants are revoked (4004 tightens select, §4 policies).
-- Client roles keep SELECT; RLS (0004) scopes visible rows.

create type public.gate_reason   as enum ('medical', 'emergency', 'personal', 'other');
create type public.app_status    as enum ('submitted', 'under_review', 'additional_info_required', 'approved', 'rejected', 'completed');
create type public.step_status   as enum ('pending', 'approved', 'rejected', 'info_requested');
create type public.verification_event  as enum ('exit', 'return', 'rejection');
create type public.verification_result as enum ('valid', 'expired', 'revoked', 'already_exited', 'already_returned', 'invalid_token', 'staff_rejected');

-- Gate-pass applications (the core workflow row) -------------------------------
create table public.gate_pass_applications (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid        not null references public.profiles (id) on delete cascade,
  department_id      uuid        not null references public.departments (id),
  reason             public.gate_reason      not null,
  status             public.app_status       not null default 'submitted',
  departure_at       timestamptz             not null,
  expected_return_at timestamptz             not null,
  explanation        text                    not null check (char_length(explanation) <= 2000),
  additional_info    text,                       -- student's answer to an info request
  submitted_at       timestamptz             not null default now(),
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (expected_return_at > departure_at)
);

create index applications_student_returns_idx
  on public.gate_pass_applications (student_id, submitted_at desc);
create index applications_department_status_idx
  on public.gate_pass_applications (department_id, status);
create index applications_status_returns_idx
  on public.gate_pass_applications (status, submitted_at desc);
create index applications_departure_idx
  on public.gate_pass_applications (departure_at);

create trigger applications_touch_updated_at
  before update on public.gate_pass_applications
  for each row execute function public.touch_updated_at();

-- Uploaded medical documents (opaque storage paths, no PII) --------------------
create table public.medical_documents (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid        not null references public.gate_pass_applications (id) on delete cascade,
  storage_path   text        not null unique,   -- {application_id}/{uuid}.{ext}, bucket-private
  content_type   text        not null check (content_type in ('application/pdf','image/jpeg','image/png')),
  byte_size      bigint      not null check (byte_size > 0 and byte_size <= 10485760),
  label          text        not null,          -- display text; never the original filename
  uploaded_by    uuid        not null references public.profiles (id),
  uploaded_at    timestamptz not null default now()
);

create index medical_documents_application_idx on public.medical_documents (application_id);

-- Approval chain steps (built by fn_submit_application from approval_rules) ----
create table public.approval_steps (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid            not null references public.gate_pass_applications (id) on delete cascade,
  step_order     int             not null check (step_order >= 1),
  approver_role  public.user_role not null check (approver_role in ('faculty', 'hod')),
  department_id  uuid            not null references public.departments (id),
  assigned_to    uuid            references public.profiles (id),  -- PRD AD-3 explicit assignment (NULL = any dept staff)
  status         public.step_status not null default 'pending',
  decided_by     uuid            references public.profiles (id),
  decided_at     timestamptz,
  created_at     timestamptz     not null default now(),
  updated_at     timestamptz     not null default now(),
  unique (application_id, step_order)
);

create index approval_steps_open_idx
  on public.approval_steps (department_id, status)
  where status = 'pending';

create trigger approval_steps_touch_updated_at
  before update on public.approval_steps
  for each row execute function public.touch_updated_at();

-- Immutable decision history ---------------------------------------------------
create table public.approval_actions (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid        not null references public.gate_pass_applications (id) on delete cascade,
  step_id        uuid        references public.approval_steps (id) on delete set null,
  actor_id       uuid        not null references public.profiles (id),
  action         text        not null check (action in ('approve', 'reject', 'request_info', 'provide_info')),
  remarks        text        check (remarks is null or char_length(remarks) <= 1000),
  created_at     timestamptz not null default now()
);

create index approval_actions_timeline_idx
  on public.approval_actions (application_id, created_at);

-- Issued gate passes ------------------------------------------------------------
create table public.gate_passes (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid        not null unique references public.gate_pass_applications (id) on delete cascade,
  token_hash     text        not null unique,   -- SHA-256; raw token lives only inside the QR URL
  pass_code      text,                          -- human pass code (PRD SE-1); set at issue time
  issued_at      timestamptz not null default now(),
  valid_from     timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  check (expires_at > valid_from)
);

create unique index gate_passes_pass_code_idx
  on public.gate_passes (pass_code)
  where pass_code is not null;

-- Verification log (append-only; security writes via fn_gate_record) ------------
create table public.gate_verification_logs (
  id           uuid primary key default gen_random_uuid(),
  pass_id      uuid        not null references public.gate_passes (id),
  gate_user_id uuid        not null references public.profiles (id),
  event        public.verification_event   not null,
  result       public.verification_result  not null,
  occurred_at  timestamptz not null default now()
);

create index gate_verification_logs_pass_idx
  on public.gate_verification_logs (pass_id, occurred_at);

-- Notifications (inserted by workflow functions only) ----------------------------
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null references public.profiles (id) on delete cascade,
  type           text        not null check (type in
                   ('application_submitted', 'review_required', 'decision_made',
                    'info_requested', 'info_received', 'pass_issued')),
  title          text        not null,
  body           text        not null,
  application_id uuid        references public.gate_pass_applications (id) on delete cascade,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index notifications_unread_idx
  on public.notifications (user_id, read_at nulls first, created_at desc);
-- no touch trigger: notifications are append-ish (only `read_at` ever changes)

-- Audit trail (append-only; actor NULL = system trigger) -------------------------
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid        references public.profiles (id) on delete set null,
  action      text        not null,   -- e.g. application.submitted / gate.exit / admin.user_created
  entity_type text        not null,
  entity_id   uuid        not null,
  metadata    jsonb       not null default '{}'::jsonb,   -- ids/timestamps only; never secrets/file contents
  created_at  timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_action_time_idx on public.audit_logs (action, created_at desc);

-- Approval configuration (D-008) -----------------------------------------------
create table public.approval_rules (
  id             uuid primary key default gen_random_uuid(),
  department_id  uuid references public.departments (id),   -- NULL = global default
  reason         public.gate_reason not null,
  chain          jsonb              not null
                   check (jsonb_typeof(chain) = 'array'
                          and jsonb_array_length(chain) between 1 and 2),
  requires_medical_document boolean not null,               -- set by admin/seed, never derived
  pass_validity_hours      int     not null default 12
                   check (pass_validity_hours between 1 and 720),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique nulls not distinct (department_id, reason),
  -- emergency is ALWAYS expedited to a single hod step (D-007):
  check (reason <> 'emergency' or chain = '["hod"]'::jsonb)
);

create trigger approval_rules_touch_updated_at
  before update on public.approval_rules
  for each row execute function public.touch_updated_at();

-- Client grants ------------------------------------------------------------------
-- Client roles keep SELECT (RLS scopes rows in 0004). Every mutation flows
-- through SECURITY DEFINER functions (§5), so direct INSERT/UPDATE/DELETE is
-- revoked — matching "no direct UPDATE on workflow columns" (header §DB).
revoke insert, update, delete
  on public.gate_pass_applications, public.medical_documents, public.approval_steps,
     public.approval_actions, public.gate_passes, public.gate_verification_logs,
     public.notifications, public.audit_logs, public.approval_rules
  from anon, authenticated;
-- students mark notifications read — the ONLY client-write surface (T-07):
grant update (read_at) on public.notifications to authenticated;
