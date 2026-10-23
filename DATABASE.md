# DATABASE — PratapPass

Status: **migrations 0001–0009 applied** (T-02 auth slice + T-02a hotfix → T-05 seed → T-06
storage/cap → T-08 staff/student profile read);
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
| `verification_result` | `valid` \| `expired` \| `revoked` \| `already_exited` \| `invalid_token` \| `staff_rejected` |

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
security: none (verify function returns minimal view).

### `departments`
`name` UNIQUE · `code` UNIQUE (e.g. `CSE`) · timestamps. Read: all authed; write: admin.

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
`actor_id` FK NULL (NULL = system trigger) · `action` text (`application.submitted`,
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
Editable by admin UI only; read only by admins (RLS) — workflow functions read via definer path.

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
| `fn_issue_pass(p_application_id)` | system (0006 trigger) | not client-executable (`permission denied`); one pass per application (UNIQUE); token = `HMAC-SHA256(qr_token_secret, pass_id)` hex (D-015 — raw never stored, re-derivable by the QR route); `pass_code` `MPGI-<6hex>` with retry; validity = trip window bounded by `pass_validity_hours`; notification + audit |
| `fn_gate_record(p_token_or_code, p_event)` | security/admin | resolves by raw-token hash OR `MPGI-*` code (normalized); classifies
`valid/expired/revoked/already_exited/already_returned/invalid_token/staff_rejected`; appends `gate_verification_logs` — **unknown probes return `invalid_token` without a log row** (logs require a pass reference); valid `return` completes the application; returns holder name + validity ONLY (never reason/medical text) |
| *notifications read-at touch (no function)* | user | plain `UPDATE (read_at)` own unread rows via the 0003 column GRANT + 0004 own-row policy — a planned `fn_mark_notifications_read` helper was deliberately dropped (T-07): a definer function would add no authority over an RLS-covered touch |

Where the secret lives: `private.app_secrets (qr_token_secret)` — a non-API schema
(`db_extra_search_path` untouched), full revokes on all client roles; `fn_issue_pass` reads it
in-session. Production value is provisioned at go-live (KI-002 parity checklist).

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
