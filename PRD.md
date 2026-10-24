# PRD — PratapPass (Digital College Gate Pass & Medical Approval System)

Institution: **Maharana Pratap Group of Institutions (MPGI), Kanpur**
Status: implemented and verified locally (T-01 → T-15); cloud deployment and email delivery are
pending (see `KNOWN_ISSUES.md`).

---

## 1. Problem statement

Students currently request gate passes through paper forms, submit medical records physically to
their department, and follow up in person with faculty and administration. Consequences:

- Departure delays for time-sensitive medical visits and emergencies
- Repeated in-person follow-ups for staff and students
- No reliable status tracking or history; misfiled paper records
- No verifiable proof at the gate; no record of actual exit/return times
- Medical documents handled with no structured privacy/audit control

**Goal:** a centralized digital platform to submit, review, approve, verify, and audit gate-pass
requests with secure medical document handling.

## 2. Target users

| User | Context |
|---|---|
| Student | Registered by roll number; applies for gate passes |
| Faculty / Department approver | Reviews and decides department requests |
| HOD / Administrator (admin) | Oversees system; manages people, departments, rules; analytics; also acts as final approval step in the chain |
| Security / Gate staff | Verifies approved passes at campus exit/entry |

## 3. Scope

### In scope
- Digital gate-pass application (reasons: **medical, emergency, personal, other**)
- Conditional medical document upload (PDF/JPG/PNG) with type/size/ownership validation
- Configurable approval chain (default: Faculty → HOD) with **expedited routing for emergencies**
- Status lifecycle: `Submitted → Under Review → Additional Information Required → Approved / Rejected → Completed`
- Time-limited, revocable QR gate pass; gate verification page that **never exposes medical data**
- Security recording of actual exit/return times; rejection of invalid/expired/revoked passes
- In-app notifications for submissions, decisions, and info requests
- Admin: departments, users/roles, approver assignment, approval rules, analytics, audit log viewer
- Search/filter by student, department, date range, reason, status
- Append-only audit trail (submissions, document access, decisions, gate events)
- Responsive MPGI-branded university interface (mobile-first)

### Non-goals (explicitly out of scope for MVP)
- SMS or push notifications (in-app first; email integration later when a provider is chosen — see `KNOWN_ISSUES.md`)
- Native mobile apps
- Multi-institution SaaS tenancy
- Online payments or hostel-integration workflows
- In-app camera QR **scanning** by staff (MVP: QR encodes a URL that opens `/verify`; scanning via any phone camera — see `docs/DECISIONS.md` D-005)

## 4. User stories & acceptance criteria

### Student
- **ST-1** — As a student, I can register with my **roll number + email + password** so that my applications are tied to my institutional identity.
  *AC:* roll number required and unique; department resolved via roll-prefix map or left "Unassigned"; staff roles cannot be self-granted.
- **ST-2** — As a student, I can submit an application with reason, departure date/time, expected return time, and explanation.
  *AC:* forms validated server-side; medical uploads shown/conditioned on the reason or document requirement rule; submission lands in the approver queue and notifies them.
- **ST-3** — As a student, I can upload prescriptions/reports (PDF, JPG, PNG) only to my own application.
  *AC:* allowed mime + ≤4 MB per file (server-mediated upload — D-016); files land in a private bucket; direct bucket access is impossible for students; access is via server-minted signed URLs and is audit-logged.
- **ST-4** — As a student, I can see the live status and full approval timeline of my applications and read approver remarks.
  *AC:* state machine transitions only; no unauthorized status changes.
- **ST-5** — As a student, I can download/scan my approved pass (QR) and view past applications.
  *AC:* QR present after final approval; pass expires per configured validity; download works on mobile.
- **ST-6** — As a student asked for additional information, I can update my application and resubmit for review.
  *AC:* application returns to `Under Review`; the request and resubmission are audited/visible.

### Faculty / Department approver
- **FA-1** — As an approver, I see pending requests **only within my authorized scope** (my department / assigned steps).
- **FA-2** — As an approver, I review application details and document previews (authorized only), then **approve, reject, or request more information with remarks**.
  *AC:* decision respected chain order (cannot pre-approve an earlier step); remarks stored immutably in `approval_actions`; student notified.
- **FA-3** — As an approver, I can search/filter requests (student, department, date, reason, status) and see processing-time history.

### HOD / Admin
- **AD-1** — As admin, I manage students, faculty, security, roles, and departments (CRUD + role assignment).
- **AD-2** — As admin, I configure approval rules (chain length/order per department & reason) and document-requirement rules (per reason).
- **AD-3** — As admin, I assign department approvers and monitor queues and decisions.
- **AD-4** — As admin, I view analytics: request counts, approval rate, average processing time, overdue requests.
- **AD-5** — As admin, I view the audit log of submissions, document access, decisions, and gate events.
- **AD-6** — As HOD approver, I act on expedited emergency requests directly.

### Security / Gate staff
- **SE-1** — As security, I verify a pass via QR / unique pass ID and confirm identity and validity.
  *AC:* `/verify` shows only pass status + holder name + pass validity; **no medical information**; expired/revoked/pending/used passes are rejected with clear reasons.
- **SE-2** — As security, I record the actual **exit** and **return** times.
  *AC:* records are audit-logged; return completes the application; duplicate exit prevention.

## 5. Acceptance criteria (system-level, from the overall brief)

- [ ] Student can submit and track a gate-pass application end-to-end.
- [ ] Medical documents upload securely (private storage, validated, restricted access).
- [ ] Authorized staff can review and decide within their scope only.
- [ ] Students receive status updates (in-app) on every meaningful transition.
- [ ] Approved passes contain a verifiable, time-limited QR code.
- [ ] Security can validate a pass and record exit/return.
- [ ] Unauthorized users cannot view private applications or medical records (verified by tests, not by assumption).
- [ ] Responsive on mobile and desktop.
- [ ] Setup instructions, env vars, migrations, and tests are documented.

## 6. Success metrics (proposed)

- Median application→decision time < 1 institutional working day
- ≥ 90% of departures accompanied by a verified pass scan (gate logs)
- Zero unauthorized medical-document access incidents (audit sampling)

## 7. Open questions

Tracked in `KNOWN_ISSUES.md`: roll-number format/department mapping, email provider choice, pass
print/PDF template, retention policy for medical documents.
