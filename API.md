# API — PratapPass

Status: **contract design** (implementation lands with tasks T-06–T-11; `ARCHITECTURE.md` §3 is the
navigation context).

Two mutation surfaces, one rule behind both: **Zod-validated input at the boundary + Postgres
functions as workflow authority** (see `DATABASE.md` §5). Client code never updates workflow state
directly.

## 1. Transport conventions

- **Server Actions** (`'use server'`) for application mutations driven by forms/dashboard UIs —
  typed domain objects in, typed result out (`{ ok: true, data } | { ok: false, error: { code, message, details? } }`).
- **Route handlers** (`app/api/**`) for operations that are not form mutations: QR image serving,
  signed-URL redirect, gate verification endpoints.
- Sessions: Supabase Auth cookie session via `@supabase/ssr`; every action/handler re-reads the
  user and role server-side (`profiles.role`); nothing operates on a client-supplied role/token.
- HTTP error envelope (route handlers): `{ error: { code, message } }` with
  `401 unauthenticated · 403 forbidden · 404 not_found · 409 conflict · 422 validation_failed`.
  Server Actions use the typed result shape above; messages are user-appropriate, details carry
  field-level errors.

## 2. Server Actions (internal mutations)

| Action | Actor | Input | Guarantees |
|---|---|---|---|
| `signUpStudent` | guest | roll number, email, password | roll format/prefix rule (KI-001); always role `student`; staff cannot self-grant |
| `signIn` | guest | email, password | session-issued; honors validated `?next=` intra-site path |
| `signOutAction` | any authenticated | — (none) | clears session cookies; failure surfaced via `/login?signout=failed` |
| `submitApplicationAction(prevState, formData)` | student | reason, departure/return (UTC ISO converted client-side), explanation, document file (PDF/JPG/PNG ≤4 MB) | server-mediated upload (D-016): magic bytes are the content-type authority (declared/sniffed mismatch rejected), service-role bucket write to the final `{application_id}/{uuid}.{ext}` path, then `fn_submit_application` under the real session with a server-allocated application id (0008); a failed submit removes the uploaded object; audit + notifications |
| `answerAdditionalInfoAction(prevState, formData)` | student | application id, answer ≤ 2000 chars (trimmed) | only while `additional_info_required` (re-checked in `fn_provide_info`); back to `under_review` with step resumed; audit + notify approver |
| `decideApplication(appId, { approve \| reject \| request_info }, remarks)` | faculty/hod | remarks required on reject/request_info | Postgres `fn_decide_application` enforces chain order & scope; immutable history; notifications |
| `markNotificationsReadAction()` | user | — (all own unread) | RLS column-grant `UPDATE (read_at)` own unread rows only; failure surfaced via dashboard banner |
| `recordGateEvent(tokenOrCode, { exit \| return })` | security | token/human pass code | `fn_gate_record`: classification, dedupe, completion |
| Admin actions (T-12) | admin | departments/users/roles/rules | role changes audit-logged; admin cannot demote final admin without second admin (guard) |

## 3. Route handlers (public-facing/programmatic)

| Endpoint | Method | Auth | Request | Response |
|---|---|---|---|---|
| `/api/passes/[id]/qr` | GET | student owner / admin | — | SVG/PNG QR encoding `{SITE}/verify?token=…` (raw token never stored server-side) |
| `/api/documents/[id]` | GET | student owner, scoped approver, admin | — | `307` to short-lived signed URL (≤5 min) **after** audit append `document.signed_url_issued` |
| `/api/gate/verify` | POST | none (token is the credential) | `{ token }` | classification `{ result, pass: { holder_name, department, departure_window, exit_state } }` — **no reason, no medical data, no doc links** |
| `/api/gate/record` | POST | security | `{ token, event }` | recording result; used by in-app security UI (phone camera via `/verify?token=` is the primary flow) |

`/verify` itself is a **server-rendered page** (reads `?token=`, calls verify function, renders the
verify result card) — the QR encodes the page URL, so scanning requires no native app.

## 4. Reads

Page reads go through Server Components with the anon-key server client (RLS applies; service-role
module never used for student/approver listings). Search/filter params (student, department, date
range, reason, status) are server-side, index-backed (`DATABASE.md` §2 indexes).

## 5. Error & edge rules

- Validation failures return **field-level** errors; unknown/extra fields are rejected, not ignored.
- Stale decisions (another approver acted while the form was open) surface as `409 conflict` /
  re-synced state — never a silent overwrite.
- File rejections enumerate concrete reasons (type/size/count).
- Rate limiting: add a per-IP/identity limiter on `/api/gate/verify` + submit actions when the
  platform goes live (tracked in `KNOWN_ISSUES.md` KI); not in MVP scope.
- Audit trail: `SE-1..AD-5` audit events (`DATABASE.md` §2 `audit_logs`) emitted on submissions,
  document URL issuance, decisions, gate events, staff/admin mutations.
