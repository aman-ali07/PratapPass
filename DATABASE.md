# DATABASE — PratapPass

Status: **schema designed; migrations 0001–0002 applied (T-02 auth slice + T-02a hotfix);
0003–0007 planned** (T-03/T-04/T-05 author them; this document is the normative source).

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
RLS (0001/0002): self select; self **update scoped by column GRANTs to
`full_name`/`phone`** (Postgres has no column lists in `CREATE POLICY` — row scope is
the policy, write scope is the grant) · admin all · faculty/hod select same-department
students (queue context, planned 0003/0004) · security: none (verify function returns minimal view).

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
`content_type` CHECK IN (`application/pdf`,`image/jpeg`,`image/png`) · `byte_size` CHECK ≤ 10 485 760 ·
`label` (display text, no filename) · `uploaded_by` FK · `uploaded_at`.
RLS: student select own · approver select limited to applications inside their decision scope ·
**access only via server signed-URL action** (audit-gated); no public bucket paths, ever.

### `approval_steps`
`application_id` FK · `step_order` int ≥1 · `approver_role` CHECK IN (`faculty`,`hod`) ·
`department_id` FK (scope of the step) · `status step_status` DEFAULT `pending` · `decided_by` ·
`decided_at` · UNIQUE `(application_id, step_order)`.
Built by the submit function from `approval_rules` (expedited: single `hod` step). RLS: scoped read —
student (own, for timeline), step-assignee role in scope, admin.

### `approval_actions` — **append-only history**
`application_id` FK · `step_id` FK NULL · `actor_id` FK→profiles ·
`action` ('approve'\|'reject'\|'request_info'\|'provide_info') · `remarks` ≤ 1000 · `created_at`.
RLS: insert **only** via the decide function; select scoped like steps; **no UPDATE/DELETE policies
exist** — history is immutable to every role, including admins.

### `gate_passes`
`application_id` UNIQUE FK · `token_hash` UNIQUE NOT NULL (SHA-256 of raw token; raw token appears
only inside the QR URL) · `issued_at` DEFAULT now() · `valid_from`, `expires_at` (from
`approval_rules.pass_validity_hours` bounded by expected return) · `revoked_at` NULL.
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
RLS: select own; update limited to `read_at` (own rows); insert via workflow functions (triggers)
only — no client inserts.

### `audit_logs` — **append-only**
`actor_id` FK NULL (NULL = system trigger) · `action` text (`application.submitted`,
`document.signed_url_issued`, `application.decided`, `pass.issued`, `gate.exit`, `gate.return`,
`admin.user_created`, `auth.role_changed`, …) · `entity_type` text, `entity_id` uuid ·
`metadata` jsonb (ids/timestamps only — no secrets, no file contents, no bulk PII) · `created_at`.
RLS: select admin; append via functions; no UPDATE/DELETE.

## 3. Configuration table (added by decision D-008)

### `approval_rules`
Per ``(department_id NULL = global default, reason)`` (UNIQUE pair):
`chain jsonb NOT NULL` (ordered `["faculty","hod"]` array validated by CHECK/ `jsonb_array_elements` ·
`requires_medical_document bool DEFAULT (reason='medical')` · `pass_validity_hours int DEFAULT 12` ·
`expedited bool COMPUTED/DEFAULT (reason='emergency' → chain ["hod"])` — read-only enforced by
function). Editable by admin UI only.

## 4. Storage

- Bucket **`medical-documents` — private**: path `{application_id}/{uuid}.{ext}` (no PII in paths).
- Progress documents (profile photo) optional, separate private bucket, same rules.
- Browser upload goes through the validated server action (mime + size re-verified server-side);
  the anon client never receives a bucket write credential.

## 5. SECURITY DEFINER functions (workflow authority)

| Function | Caller | Enforces |
|---|---|---|
| `fn_submit_application(...)` (incl. doc rows) | student | role, window checks, rules lookup → builds steps; audit + notifications |
| `fn_decide_application(p_app, p_action, p_remarks)` | approver | actor is the *active step's* role/scope; chain order; transitions per §6; appends `approval_actions`; on final approve → `fn_issue_pass`; notifications |
| `fn_provide_info(p_app, p_text)` | student | only while `additional_info_required`; returns app to `under_review`; audit |
| `fn_issue_pass(p_app)` | system | one pass per approved application; token generation+hash; expiry from rules |
| `fn_gate_record(p_token_or_code, p_event)` | security | token hash lookup; validity window; exit/return dedupe; `result` classification; rejections logged & rejected |
| `fn_mark_notifications_read(p_ids)` | user | owns rows |

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

## 7. Migrations plan (files to be authored)

| Migration | Contents | Status |
|---|---|---|
| `0001_profiles_auth.sql` | `pgcrypto`; `user_role` enum; `departments`, `profiles` (+ indexes, `touch_updated_at`); `handle_new_user` bootstrap trigger on `auth.users`; role helpers `get_user_role`/`is_admin`; `check_roll_number_available` RPC; RLS on both tables (authenticated select, profile update by self, department writes closed until admin functions) | ✅ applied — T-02 |
| `0002_profiles_policy_fix.sql` | T-02a audit hotfix: self-update scoped by column GRANTs (`full_name`/`phone`) replacing the column-open UPDATE policy (P0); case-insensitive roll unique (`lower(roll_number)`, partial); role helpers revoked from anon | ✅ applied — T-02a |
| `0003_schema_applications.sql` | remaining tables/enums/indexes/constraints: `applications`, `approval_steps`, `gate_passes`, `documents`, `approval_actions`, `notifications`, `audit_logs`, `approval_rules` | ⬜ T-03 |
| `0004_rls_policy_matrix.sql` | RLS enable + policies per §2 for the tables above (append-only enforcement for history tables; workflow UPDATE constraints live in the functions) | ⬜ T-03 |
| `0005_workflow.sql` | SECURITY DEFINER transition functions (§5) with chain-order enforcement (no bypass) | ⬜ T-04 |
| `0006_triggers.sql` | notification triggers, remaining `updated_at` touches | ⬜ T-04 |
| `0007_seed.sql` | **synthetic** demo data only (see §8) | ⬜ T-05 |

Run: `supabase db reset` (local; migrations apply on `start`/`reset`) / applied to the cloud project
by CLI push with user-provided credentials (KI-002, go-live). Every migration must be reversible in
effect or paired with a documented `down` note.

## 8. Seed data policy

Only clearly synthetic identities (fake roll numbers like `24FAKE0001`, placeholder names), a fake
one-page PDF/PNG "prescription" asset, and a demo rule set. **Never** real student names, roll
numbers, or medical documents; seed file warns and is excluded from production applies.
