# DATABASE — PratapPass

Status: **migrations 0001–0011 applied** (T-02 auth slice + T-02a hotfix → T-05 seed → T-06
storage/cap → T-08 staff/student profile read → T-10 guarded QR token re-derivation → T-11 public
gate classification);
demo seed lives OUTSIDE migrations in `supabase/seed.sql` (this document is the normative source).

Conventions: UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` `timestamptz` not null
defaults via trigger touch, all FKs explicit, RLS **enabled on every table**, enforcement of
workflow through `SECURITY DEFINER` functions — clients receive no direct UPDATE grant on
workflow-relevant columns.

## 1. Enums

| Type | Values |
|---|---|
| `user_role` | `student` \| `faculty` \| `hod` \| `security` \| `admin` |
| `gate_reason` | `medical` \| `emergency` \| `personal` \| `other` |
| `app_status` | `submitted` \| `under_review` \| `additional_info_required` \| `approved` \| `rejected` \| `completed` |
| `step_status` | `pending` \| `approved` \| `rejected` \| `info_requested` |
| `verification_event` | `exit` \| `return` \| `rejection` |
| `verification_result` | `valid` \| `expired` \| `revoked` \| `already_exited` \| `already_returned` \| `invalid_token` \| `staff_rejected` |

## 2. Core tables (required by the product brief)

### `profiles`
`id` FK→`auth.users` CASCADE · `role user_role` DEFAULT `student` · `full_name` NOT NULL ·
`roll_number` (students; NULL for staff — **case-insensitive unique**:
partial expression index on `lower(roll_number)`, 0002) · `phone` ·
`department_id` FK→departments · `designation` (staff title) · timestamps.
*Email lives only in `auth.users` (no drift-prone copy).*
RLS (0001/0002/0009): self select; self **update scoped by column GRANTs to
`full_name`/`phone`** (Postgres has no column lists in `CREATE POLICY` — row scope is
the policy, write scope is the grant) · admin all · faculty/hod select same-department
**student rows** (queue context — planned in early drafts, landed as 0009 with T-08) ·
security: none (verify function returns minimal view). **Role/department/roll/designation writes are
admin-only via the audited `fn_admin_create_user` / `fn_admin_update_user` functions (T-12b)** — the
table itself stays non-writable by clients (0002 column grants).

### `departments`
`name` UNIQUE · `code` UNIQUE (e.g. `CSE`) · timestamps. Read: all authed; write: admin only via the audited `fn_admin_*_department` functions (T-12a).

### `gate_pass_applications`
`student_id` FK→profiles · `department_id` FK (snapshot at submit) · `reason gate_reason` ·
`status app_status` DEFAULT `submitted` · `departure_at` NOT NULL · `expected_return_at` NOT NULL
CHECK (> departure) · `explanation` NOT NULL, length ≤ 2000 · `additional_info` (student's answer
to an info request) · `submitted_at` DEFAULT now() · `decided_at` · timestamps.
Indexes: `(student_id, submitted_at DESC)`, `(department_id, status)`, `(status, submitted_at DESC)`,
`(departure_at)`.
RLS: student insert own + select own · faculty/hod select where `department_id` in their scope ·
admin select all · **no direct client UPDATE** (status written by functions only).

### `medical_documents`
`application_id` FK→applications CASCADE · `storage_path` UNIQUE (opaque: `{application_id}/{uuid}.{ext}`) ·
`content_type` CHECK IN (`application/pdf`,`image/jpeg`,`image/png`) · `byte_size` CHECK ≤ 4 194 304 (0008, D-016) ·
`label` (display text, no filename) · `uploaded_by` FK · `uploaded_at`.
RLS: student select own · approver select limited to applications inside their decision scope ·
**access only via server signed-URL action** (audit-gated); no public bucket paths, ever.

### `approval_steps`
`application_id` FK · `step_order` int ≥1 · `approver_role` CHECK IN (`faculty`,`hod`) ·
`department_id` FK (scope of the step) · `assigned_to` FK→profiles NULL (**explicit assignment —
audit addition; NULL = any staff of the step's role in that department**) ·
`status step_status` DEFAULT `pending` · `decided_by` · `decided_at` ·
UNIQUE `(application_id, step_order)`.
Built by the submit function from `approval_rules` (expedited: single `hod` step). RLS: scoped read —
student (own, for timeline), step-assignee role in scope, admin.

### `approval_actions` — **append-only history**
`application_id` FK · `step_id` FK NULL · `actor_id` FK→profiles ·
`action` ('approve'\|'reject'\|'request_info'\|'provide_info') · `remarks` ≤ 1000 · `created_at`.
RLS: insert **only** via the decide function; select scoped like steps; **no UPDATE/DELETE policies
exist** — history is immutable to every role, including admins.

### `gate_passes`
`application_id` UNIQUE FK · `token_hash` UNIQUE NOT NULL (SHA-256 of raw token; raw token appears
only inside the QR URL) · `pass_code` UNIQUE-when-present (human pass code, PRD SE-1 — set by
`fn_issue_pass`; the QR token stays machine-only) · `issued_at` DEFAULT now() · `valid_from`,
`expires_at` (from `approval_rules.pass_validity_hours` bounded by expected return) · `revoked_at` NULL.
RLS: student select own · hod/admin select (dept/all) · **security reads only via verify function**;
revocation only via server function.

### `gate_verification_logs` — **append-only**
`pass_id` FK · `gate_user_id` FK (recording security profile) · `event verification_event` ·
`result verification_result` · `occurred_at` DEFAULT now(). Index `(pass_id, occurred_at)`.
Insert via gate function only.

### `notifications`
`user_id` FK · `type` CHECK (`application_submitted`,`review_required`,`decision_made`,`info_requested`,
`info_received`,`pass_issued`) · `title`, `body` · `application_id` FK NULL · `read_at` NULL.
Index `(user_id, read_at NULLS FIRST, created_at DESC)`.
RLS: select own; update limited to `read_at` (own rows — implemented as column GRANT `UPDATE (read_at)`
in 0003 + own-row policy in 0004); insert via workflow functions (triggers) only — no client inserts.

### `audit_logs` — **append-only**
`actor_id` FK NULL (NULL = system trigger; **`ON DELETE RESTRICT`** since 0014 — a profile with audit
history can never be deleted) · `action` text (`application.submitted`,
`document.signed_url_issued`, `application.decided`, `pass.issued`, `gate.exit`, `gate.return`,
`admin.user_created`, `auth.role_changed`, …) · `entity_type` text, `entity_id` uuid ·
`metadata` jsonb (ids/timestamps only — no secrets, no file contents, no bulk PII) · `created_at`.
RLS: select admin; append via functions; no UPDATE/DELETE.

## 3. Configuration table (added by decision D-008)

### `approval_rules`
Per ``(department_id NULL = global default, reason)`` (UNIQUE pair, `NULLS NOT DISTINCT`):
`chain jsonb NOT NULL` (ordered array, 1–2 elements per MVP; CHECK enforces `emergency ⇒ ["hod"]`
— D-007: emergency is always expedited) · `requires_medical_document bool NOT NULL` (set by admin
UI/seed, **not** a derived column — the drafted auto-default from `reason` is unimplementable in
Postgres DEFAULTs and admin control is safer) · `pass_validity_hours int DEFAULT 12 CHECK 1..720`.
Editable by admin UI only, through the audited `fn_admin_*_rule` functions (0015, T-12c); read only by
admins (RLS) — workflow functions read via definer path. `0015` also backfilled the **global `other`
default** the T-05 seed omitted (idempotent insert), so every `gate_reason` now resolves to a rule.
Global defaults (`department_id IS NULL`) are editable but never deletable; deleting a department
override reverts that department to the global default. The `(department_id, reason)` key is immutable
after creation — moving a rule means creating the new scope and deleting the old override.

## 4. Storage

- Bucket **`medical-documents` — private** (0007): path `{application_id}/{uuid}.{ext}` (no PII in
  paths); bucket-level `file_size_limit` = 4 MiB + mime allowlist mirror the app boundary.
- Progress documents (profile photo) optional, separate private bucket, same rules.
- Browser upload goes through the validated server action (magic bytes are the content-type
  authority; a declared type that disagrees with the sniffed bytes is rejected; size ≤ 4 MiB);
  the anon client never receives a bucket write credential (no `storage.objects` client policies —
  default-deny smoke-proven).

## 5. SECURITY DEFINER functions (workflow authority)

| Function | Caller | Enforces |
|---|---|---|
| `fn_submit_application(reason, departure, expected_return, explanation, docs jsonb, application_id? = null)` | student | role = student, future departure window, rules lookup (department rule → global), `requires_medical_document` ⇒ ≥1 doc row, chain built (emergency ⇒ single `hod` step); audit + notifications; doc metadata validated; the optional id is server-allocated by the submission action (0008) so uploads land on the FINAL path |
| `fn_decide_application(p_application_id, p_action, p_remarks)` | approver | role = faculty/hod; actor is the *active step's* role in the step's department (or explicit assignee); lowest pending step is the ONLY reachable one; reject/request_info require remarks; transitions per §6; appends `approval_actions`; on final approve sets app `approved` (0006 trigger issues the pass); notifications |
| `fn_provide_info(p_application_id, p_text)` | student | only while `additional_info_required`; paused step resumes `pending`; app back to `under_review`; audit + notify resumed approvers |
| `fn_issue_pass(p_application_id)` | system (0006 trigger) | not client-executable (`permission denied`); one pass per application (UNIQUE); token = `HMAC-SHA256(qr_token_secret, pass_id)` hex (D-015 — raw never stored; re-derived on demand by `fn_pass_qr_token`); `pass_code` `MPGI-<6hex>` with retry; validity = trip window bounded by `pass_validity_hours`; notification + audit |
| `fn_gate_record(p_token_or_code, p_event)` | security/admin | resolves by raw-token hash OR `MPGI-*` code (normalized); classifies
`valid/expired/revoked/already_exited/already_returned/invalid_token/staff_rejected`; appends `gate_verification_logs` — **unknown probes return `invalid_token` without a log row** (logs require a pass reference); valid `return` completes the application; returns holder name + validity ONLY (never reason/medical text) |
| `fn_gate_verify(p_token_or_code)` | anon / authenticated (0011, T-11) | **READ-ONLY** classification for `/verify` + `/api/gate/verify` — never writes logs (anonymous scans have no `gate_user_id`, D-018). Resolves the raw-token hash for anyone; the `MPGI-*` code path is security/admin-only with an explicit NULL-role guard (anonymous `NOT IN` would otherwise be NULL, i.e. pass-through). Returns `valid/expired/revoked/already_exited/already_returned/invalid_token` + holder/department/window/exit_state ONLY (never reason/medical text). Result precedence: revoked > already_returned > already_exited > expired > valid |
| `fn_pass_qr_token(p_pass_id)` | owning student / admin (0010, T-10) | re-derives the deterministic raw token from `private.app_secrets` in-session and returns it ONLY to the pass's owning student or an admin; `SHA-256(raw)` must equal the stored `token_hash` or it fails LOUDLY (rotation detection). `private` is not PostgREST-exposed, so this is the sole raw-token path (D-017); gate security is deliberately not a caller |
| `fn_admin_create_department(p_name, p_code)` · `fn_admin_update_department(p_id, p_name, p_code)` · `fn_admin_delete_department(p_id)` | admin (0012, T-12a) | `is_admin() is not true` fails closed (a missing profile would otherwise make `NOT NULL` pass); `search_path = public`; EXECUTE revoked from anon/public. Name 2–80, code `^[A-Z0-9-]{2,12}$` after trim/upper (shared `private.assert_department_fields`). Create/update/delete append `admin.department_*` audit rows (name/code only). Delete pre-counts profiles/applications/steps/rules and refuses while any exist — there is **no cascade**; a concurrent FK insert maps to the same refusal |
| `fn_admin_list_users(p_search?, p_role?, p_user_id?)` · `fn_admin_create_user(p_user_id, p_full_name, p_role, p_department_id, p_roll_number, p_designation)` · `fn_admin_update_user(…)` · `fn_admin_record_password_reset(p_user_id)` | admin (0013, T-12b) | Same admin/`search_path`/EXECUTE contract as 0012. Field contract shared by `private.normalize_user_fields`: name 2–80, roll `^[A-Z0-9]{3,20}$` uppercased, designation ≤80; students require roll+department, faculty/HOD require department, staff never carry a roll, students never carry a designation. `fn_admin_update_user` takes `pg_advisory_xact_lock(730421)` **before** re-checking `is_admin()`; refuses self-role changes, demoting the last admin, changing an approver who owns pending steps (assigned or unassigned matching role+department), and moving a student with in-flight applications off the role. List joins `auth.users` for email, caps at 100 rows and returns `total_count`. Audits `admin.user_created` / `admin.user_updated` / `admin.user_password_reset` — ids/enums/role transitions only, never email or a password. Passwords never enter SQL: GoTrue hashes them; the reset function only records the administrative action (D-020) |
| `fn_admin_list_rules(p_rule_id?)` · `fn_admin_create_rule(p_department_id, p_reason, p_chain, p_requires_medical_document, p_pass_validity_hours)` · `fn_admin_update_rule(p_id, p_chain, p_requires_medical_document, p_pass_validity_hours)` · `fn_admin_delete_rule(p_id)` | admin (0015, T-12c) | Same admin/`search_path`/EXECUTE contract as 0012. Field contract shared by `private.assert_rule_fields`: chain is a 1–2 element array of **distinct** roles from `{faculty,hod}` (order preserved — steps are created in array order), document flag non-null, validity 1–720, `emergency ⇒ ["hod"]`. Create checks the department exists and maps the unique violation to "already exists — edit it instead". Update locks the row `FOR UPDATE` and validates the **stored** reason, so the immutable `(department_id, reason)` key cannot be moved by a client; it takes no reason/department argument at all. Delete refuses `department_id IS NULL` (global defaults always remain as the fallback) and reverts the department by removing the override. Audits `admin.rule_created|updated|deleted` with reason, department id, chain(s), document flag and validity — no PII |
| `fn_admin_analytics()` · `fn_admin_analytics_breakdown()` · `fn_admin_list_audit(p_actor_id?, p_system_actor?, p_action?, p_from?, p_to?, p_limit?, p_offset?)` · `fn_admin_audit_actors()` | admin (0016, T-13) | **Read-only** — these functions write no audit rows (a dashboard/audit view is not a mutation; the log records mutations and document access). Same `is_admin() is not true` / `search_path = public` / anon-EXECUTE-revoked contract as 0012–0015. Metric definitions: pending = `submitted + under_review + additional_info_required`; approved includes `completed`; rate = approved ÷ (approved + rejected), NULL until a decision exists; processing = `decided_at − submitted_at`; overdue = pending AND `expected_return_at < now()`. The breakdown returns `reason` and `department` rows in one call (department is the submit-time snapshot). Audit: actor or system-only (NULL), `p_action` is a **literal prefix** (`%`/`_` are not wildcards), inclusive `[p_from, p_to]`, newest-first with `(created_at, id)` as the stable key, `p_limit` clamped 1–200, and `total_count` for pagination |
| *notifications read-at touch (no function)* | user | plain `UPDATE (read_at)` own unread rows via the 0003 column GRANT + 0004 own-row policy — a planned `fn_mark_notifications_read` helper was deliberately dropped (T-07): a definer function would add no authority over an RLS-covered touch |

Where the secret lives: `private.app_secrets (qr_token_secret)` — a non-API schema
(`db_extra_search_path` untouched), full revokes on all client roles; `fn_issue_pass` and
`fn_pass_qr_token` read it in-session (never through PostgREST). Production value is provisioned
at go-live (KI-002 parity checklist).

All notify/audit appends live inside these functions (or triggers) so ordinary roles need no
direct INSERT on logs/notifications.

## 6. State machine (authoritative)

```
submitted ──(first step action)──> under_review
under_review ──approve (non-final)──> under_review (next step becomes active)
under_review ──request_info──> additional_info_required
additional_info_required ──fn_provide_info──> under_review (same step resumes)
under_review ──approve (final step)──> approved ──(fn_issue_pass)──> pass row
under_review ──reject (any step)──> rejected (terminal)
gate 'return' recorded ──> completed
```
Emergency/expedited: submit function emits only a `hod` step.

§6 addendum (edge semantics implemented in `fn_gate_record` — decided at T-04, see D-015):
- **Exit before the window opens** → `expired` (classification covers both ends; the guard sees
  `valid_from`).
- **Late return is ALWAYS accepted** once a valid exit exists — rejecting a student who is
  *coming back* would strand them at the gate and freeze the application; strictness lives at the
  exit window, admins can revoke if ever needed.
- **Return without a recorded exit** → `staff_rejected` (manual verification; log kept, no transition).
- **Unknown tokens/codes** → `invalid_token` with NO log row (logs reference a pass id).
- Double decisions are structurally impossible: after approval/rejection the application leaves
  `under_review`, and the decide guard rejects anything other than `submitted`/`under_review`.


## 7. Migrations plan (files to be authored)

| Migration | Contents | Status |
|---|---|---|
| `0001_profiles_auth.sql` | `pgcrypto`; `user_role` enum; `departments`, `profiles` (+ indexes, `touch_updated_at`); `handle_new_user` bootstrap trigger on `auth.users`; role helpers `get_user_role`/`is_admin`; `check_roll_number_available` RPC; RLS on both tables (authenticated select, profile update by self, department writes closed until admin functions) | ✅ applied — T-02 |
| `0002_profiles_policy_fix.sql` | T-02a audit hotfix: self-update scoped by column GRANTs (`full_name`/`phone`) replacing the column-open UPDATE policy (P0); case-insensitive roll unique (`lower(roll_number)`, partial); role helpers revoked from anon | ✅ applied — T-02a |
| `0003_schema_applications.sql` | remaining tables/enums/indexes/constraints: `applications`, `approval_steps`, `gate_passes`, `documents`, `approval_actions`, `notifications`, `audit_logs`, `approval_rules` | ✅ applied — T-03 |
| `0004_rls_policy_matrix.sql` | RLS enable + policies per §2 for the tables above (append-only enforcement for history tables; workflow UPDATE constraints live in the functions) | ✅ applied — T-03 |
| `0005_workflow.sql` | SECURITY DEFINER transition functions (§5) with chain-order enforcement (no bypass); `private.app_secrets` schema (D-015 QR secret); client EXECUTE labeled (fn_issue_pass/system-only) | ✅ applied — T-04 |
| `0006_triggers.sql` | pass-issuance trigger on app-status → `approved`; **absolute append-only guards** (BEFORE UPDATE/DELETE RAISE on approval_actions, gate_verification_logs, audit_logs — binds owner/definer too, grants alone cover only client roles); no remaining `updated_at` touches (0001/0003 cover every timestamped table; history tables are timeless) | ✅ applied — T-04 |
| `0007_storage_bucket.sql` | private `medical-documents` bucket (4 MiB `file_size_limit`, PDF/JPG/PNG allowlist, idempotent); **no** `storage.objects` client policies — default deny holds, service-role writes only (D-016) | ✅ applied — T-06 |
| `0008_document_cap_and_submit_id.sql` | document cap 10 MiB → 4 MiB (`byte_size` CHECK, D-016); `fn_submit_application` gains optional server-allocated `p_application_id` so uploads land on the FINAL `{application_id}/{uuid}.{ext}` path with no staging/move (five-param overload dropped; grants re-issued on the six-param identity) | ✅ applied — T-06 |
| `0009_profiles_staff_student_read.sql` | the profiles read slice that DATABASE.md §2 had planned but 0003/0004 never authored: faculty/hod SELECT on same-department **student** rows (queue identity context; staff profiles and cross-dept students stay invisible; security gains nothing; D-014 write scope untouched) | ✅ applied — T-08 |
| `0010_pass_qr_token_fn.sql` | `fn_pass_qr_token(p_pass_id)` (SECURITY DEFINER, authenticated-only): re-derives the D-015 raw token in-session, owner/admin-only, digest must round-trip `token_hash` (loud rotation error). `private` stays outside PostgREST — the fn is the sole raw-token path (D-017) | ✅ applied — T-10 |
| `0011_gate_verify_fn.sql` | `fn_gate_verify(p_token_or_code)` (SECURITY DEFINER, stable, EXECUTE to anon+authenticated): read-only classification for `/verify` + `/api/gate/verify`; anonymous callers are raw-token-only (codes are security/admin-only; explicit NULL-role guard), no log writes (D-018) | ✅ applied — T-11 |
| `0012_admin_departments.sql` | admin-only department CRUD functions (0012, T-12a): `fn_admin_create_department` / `fn_admin_update_department` / `fn_admin_delete_department`, shared `private.assert_department_fields`; audited; strict referenced-delete refusal with exact counts (no cascade) | ✅ applied — T-12a |
| `0013_admin_users.sql` | admin user directory + provisioning/role functions (T-12b): `fn_admin_list_users`, `fn_admin_create_user`, `fn_admin_update_user`, `fn_admin_record_password_reset`, shared `private.normalize_user_fields`; advisory-lock final-admin guard; self-role, pending-approver and in-flight-student guards; audited (ids/enums only) | ✅ applied — T-12b |
| `0014_audit_actor_restrict.sql` | `audit_logs.actor_id` FK `ON DELETE SET NULL` → **`ON DELETE RESTRICT`**: the 0006 append-only guard is statement-level, so the RI nulling update fired even with zero matching rows and blocked every profile delete. RESTRICT makes the invariant explicit — history-bearing users are undeletable, fresh provisioning rollbacks work | ✅ applied — T-12b |
| `0015_admin_rules.sql` | admin-only approval-rule functions (T-12c): `fn_admin_list_rules` / `fn_admin_create_rule` / `fn_admin_update_rule` / `fn_admin_delete_rule`, shared `private.assert_rule_fields`; immutable `(department, reason)` key; global defaults undeletable; audited; plus the idempotent global `other` default the seed omitted (submissions for `other` previously failed) | ✅ applied — T-12c |
| `0016_admin_analytics.sql` | read-only admin analytics + audit viewer (T-13): `fn_admin_analytics`, `fn_admin_analytics_breakdown`, `fn_admin_list_audit`, `fn_admin_audit_actors`; admin-guarded, `search_path = public`, anon-EXECUTE revoked; no writes (reads are not audited); literal action prefix, inclusive range, limit clamp 1–200 | ✅ applied — T-13 |
| `supabase/seed.sql` | **synthetic** demo data only (§8) — identities incl. GoTrue-required `auth.users` shape (zero-uuid `instance_id`, provider `raw_app_meta_data`, empty token strings) + `auth.identities` rows; fixed UUIDs; every insert idempotent (`on conflict`/`where not exists`) | ✅ T-05 |

Run: `supabase db reset` (local; migrations apply on `start`/`reset`) / applied to the cloud project
by CLI push with user-provided credentials (KI-002, go-live). Every migration must be reversible in
effect or paired with a documented `down` note.

## 8. Seed data policy

Only clearly synthetic identities (fake roll numbers like `24FAKE0001`, placeholder names), a fake
one-page PDF/PNG "prescription" asset, and a demo rule set. **Never** real student names, roll
numbers, or medical documents. Mechanism: the file lives at `supabase/seed.sql` — the CLI seed
path that ONLY `supabase db reset` / dev seeding executes; `supabase db push` (cloud applies)
never runs it, which is why no seed migration exists. Proven: `db reset` → counts
(6 users / 3 apps / 1 issued pass / 2 gate logs / 4 notifications) → byte-identical replay keeps
every count; all five demo identities sign in via GoTrue and read their own profile
(`scripts/dev/seed-login-check.mjs`).
