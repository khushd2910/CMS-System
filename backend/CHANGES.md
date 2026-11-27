# Backend changes - roles, department assignment, status rules, priority

## Roles (now three)
`citizen`, `admin`, `manager`. The `officer` role is gone (model, admin API, routes, checks).
A manager must belong to an active department (`departmentId`).

**Existing data:** if your database already has `officer` users, convert them (they cannot log in to officer-only routes any more):

    db.users.updateMany({ role: "officer" }, { $set: { role: "manager" } })

Old grievances keep a harmless unused `assignedOfficerId` field; it is no longer read.

## Who can see a grievance (fix for problem 2)
Defined once in `utils/grievance-rules.js` -> `canAccessGrievance`, used by grievances AND attachments:

| Role    | Access                                              |
|---------|-----------------------------------------------------|
| admin   | every grievance                                     |
| citizen | only their own                                      |
| manager | only grievances whose `departmentId` is THEIR department |

A manager with no department sees nothing. `GET /api/grievances?departmentId=...` can no longer widen a manager's list.
Attachments: same access rule; deleting needs admin, or being the uploader.

## Assigning a department (admin only)
`PATCH /api/grievances/:id/assign-department`
body: `{ "departmentId": "...", "remarks": "...", "priority": "high" }` (remarks/priority optional on first assignment)

- Allowed while status is submitted, under_review, assigned or in_progress.
- Sets `departmentId`, sets status to `assigned`, writes a history entry, notifies the citizen and the department's managers.
- Moving to a different department requires `remarks`; the old department's managers lose access immediately.
- A citizen's `requestedDepartmentId` (sent when filing) is only a hint for the admin. It gives no access to anyone.

## Status rules
Edit them in one place: `TRANSITIONS` in `utils/grievance-rules.js`.

| From          | To            | Who                                  |
|---------------|---------------|--------------------------------------|
| submitted     | under_review  | admin                                |
| submitted     | rejected      | admin (remarks required)             |
| under_review  | rejected      | admin (remarks required)             |
| submitted / under_review / assigned / in_progress | assigned | admin, via assign-department |
| assigned      | in_progress   | manager of that department           |
| in_progress   | resolved      | manager of that department (remarks required) |
| resolved      | closed        | admin, or manager of that department |
| resolved      | in_progress   | admin, or manager (remarks required) - sent back for more work |
| rejected, closed | -          | final, no further changes            |

`PATCH /api/grievances/:id/status` body `{ "status": "...", "remarks": "..." }`
Wrong move -> 400 (with `allowedStatuses`), wrong role -> 403, missing remarks -> 400.
`GET /api/grievances/:id` now also returns `allowedTransitions` for the logged-in user (use it to show/hide buttons).
Also fixed: resolved -> closed no longer erases `resolvedAt`.

## Priority (fix for problem 5)
- Citizens can no longer set priority when filing: it is ignored and defaults to `medium`.
- Priority is set by admin (when creating, when assigning, or later) or by the department's manager:
  `PATCH /api/grievances/:id/priority` body `{ "priority": "high", "remarks": "..." }`
  (not allowed on rejected/closed grievances).

## History
`StatusHistory` has two new optional fields: `action` (`status_changed` | `department_assigned` | `priority_changed`, default `status_changed`) and `details` (readable text). Old entries remain valid.

## Tests
`npm test` runs `tests/workflow.test.js` (32 checks, real HTTP calls). It WIPES the database it connects to, so it only runs when `MONGO_DB_NAME` contains "test":

    MONGO_URI=mongodb://127.0.0.1:27017 MONGO_DB_NAME=cms_test npm test

## Not changed / still open
- `rejected` stays an admin-only status; `escalated` is not added (needs manager confirmation).
- Priority names are still low/medium/high/urgent (wireframe says "Critical").
- No "Submitted" history entry is written when a grievance is created yet.
- Wireframe registration/login/forgot-password differences (extra fields and CAPTCHA) are untouched.


## Admin login (CAPTCHA + admin-only endpoint)
- `GET /api/auth/captcha` -> `{ id, image, expiresInSeconds }` (self-hosted SVG CAPTCHA, `utils/captcha.js`; one use, 5 min expiry, answer kept only as a hash).
- `POST /api/auth/admin-login` body `{ email, password, captchaId, captchaAnswer }`. Order: lock-out check, CAPTCHA, credentials.
  Wrong CAPTCHA -> 400 `CAPTCHA_INVALID`; unknown account / wrong password / non-admin account -> the SAME 401 `Invalid Admin ID or Password.`; too many failures -> 429 (rules below).
- The CAPTCHA store still lives in memory (one server process). The lock-out and the audit trail now live in the database: see "Staff login: lock-out and audit trail" below.
- Citizen login also requires the one-use CAPTCHA from `GET /api/auth/captcha`; staff use their role-specific CAPTCHA endpoints.
- Unit checks: `npm run test:unit`. End-to-end checks: `npm run test:staff`.

## Department Manager login
- `POST /api/auth/manager-login` (same body and CAPTCHA as admin-login) accepts `role: "manager"` accounts only. Wrong account, wrong password and wrong role all return the same 401 `Invalid Manager ID or Password.`
- Admin and manager share one handler (`createStaffLogin`) but have separate endpoints and separate lock-out counters (key = role + email).
- A manager can sign in even if no department is assigned yet; the existing access rules then show them no grievances (`canAccessGrievance`).

## Email-only citizen registration and login
- `POST /api/auth/login` is CITIZEN-ONLY. Body `{ identifier, password, captchaId, captchaAnswer }` (`identifier` is an email; `{ email }` remains accepted). Admin, manager, unknown and wrong-password all return the same 401 `Invalid email or password.` Staff must use `/api/auth/admin-login` or `/api/auth/manager-login` (CAPTCHA). CAPTCHA challenges are one-use and expire after five minutes.
- Registration requires name, email, state, district, city/taluka, complete address, PIN, and `termsAccepted: true`. It records the terms acceptance and server timestamp. New passwords require at least eight characters with a letter, number, and symbol.
- Citizen email verification is mandatory. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in the private `backend/.env`. Gmail requires a Google App Password with 2-Step Verification enabled; set `MAIL_FROM` to the authenticated mailbox or an authorized sender.
- `POST /api/auth/register` stores registration details in the expiring `pendingregistrations` collection and emails a six-digit code. It does not create a `User` document or issue a token. `POST /api/auth/verify-email { email, code }` creates the citizen account only after a valid code and returns a citizen session. Codes expire in 10 minutes, are stored as hashes, and allow at most five attempts; resending invalidates the previous code. Pending registrations expire after 24 hours.
- Resend uses `POST /api/auth/resend-verification { identifier }` and is limited to five requests per 15 minutes per IP+email. Email sending is awaited and failures return 503; failed delivery leaves only a pending registration, never a user account. Missing SMTP configuration also returns 503. Check the backend log for a safe SMTP error code, then run `npm run test-email` with `TEST_EMAIL` set to a mailbox you can access.
- `POST /api/auth/verify-email/:token` (link-based verification) has been removed; verification emails only contain the six-digit code. Existing accounts with `emailVerified` unset can still verify with `POST /api/auth/verify-email { email, code }` after requesting a new code.
- To remove mobile fields from existing user documents and drop the old mobile index, run `$env:CONFIRM_REMOVE_MOBILE_DATA="true"; npm run migrate:remove-mobile-data` in PowerShell from `backend/`. This migration is explicit and removes stored mobile and mobile-verification fields.
- Tests: `npm run test:citizen` (needs a test database, wipes it).


## Staff login: lock-out and audit trail
**Lock-out** (`utils/login-throttle.js`). Counted from the audit trail in the database, so a restart does not reset it and several servers agree. A lock lifts by itself 15 minutes after the oldest counted failure. The 429 answer carries a `Retry-After` header and `retryAfterSeconds` in the body.

| Rule | Counts | Limit / 15 min |
|------|--------|----------------|
| same IP + same account | wrong password, unknown account, wrong role. Reset by a successful sign-in from that IP on that account | 5 |
| any IP + same account | the same failures | 20 |
| same IP + any account | the same failures | 30 |
| same IP | wrong CAPTCHA | 20 |

- A wrong CAPTCHA never counts against an ACCOUNT, so nobody can lock an admin out by sending bad CAPTCHAs.
- Trade-off of the "any IP + same account" rule: while someone is guessing from many IPs the real owner is also asked to wait. Raise `LIMITS.account` if that is a problem.
- Admin and manager counters are separate. Locked attempts are logged once per minute per IP+account, so hammering a locked account cannot fill the database.

**Behind a proxy / load balancer** set `TRUST_PROXY=1` (the NUMBER of proxies in front of Node). Without it every visitor looks like the proxy's IP and the IP rules above lock everybody together. `TRUST_PROXY=true` is refused on purpose (visitors could fake their IP). In production the server prints a warning when it is not set (`config/trust-proxy.js`).

**Audit trail** (`models/audit-log.model.js`, `utils/audit.js`, collection `auditlogs`). One document per event: who (user id, or the e-mail typed on a failed login), role, event, outcome (`success` / `failure` / `blocked`), reason, client IP and browser, the record affected, time. Never stored: passwords, tokens, CAPTCHA answers, request bodies. A failure to write a log entry is printed to the console and never blocks the action.
- Logged: admin and manager login attempts (success, wrong credentials, wrong CAPTCHA, blocked), staff logout, password reset by e-mailed link (any role), grievance assignment / status / priority changes, user create / update (field names only), department create / update, attachment upload / delete by staff.
- NOT logged: citizen sign-ins and citizen actions (their login has no lock-out yet, so logging each try would let anyone fill the database), reading or searching records, forgot-password requests.
- There is no retention rule: the collection only grows. Decide how long to keep it (an archive job, or a TTL index) before going live.
- Read it: `GET /api/admin/audit-logs?event=&outcome=&role=&userId=&identifier=&from=&to=&page=&limit=` (admin only, newest first). `identifier` is a partial match, `to=2026-11-30` includes the whole day. This is the data for the wireframe's "Activity Logs" table.

## Other changes in this round
- The CAPTCHA now loads once per page (it was requested twice in development), and the old CAPTCHA is removed from the screen the moment it is used up, so it cannot be submitted again.
- The header badge follows the area of the site: "Admin Portal" under `/admin/...`, "Manager Portal" under `/manager/...`, "Citizen Portal" everywhere else.
- The admin/manager login screens show "try again in about N minutes" using the real remaining time.
- `resend-verification` kept its own small in-memory limit (5 per IP + e-mail per 15 minutes).
- Tests: `npm run test:all` runs every suite. `test:staff` is new (20 checks); `test:unit` now covers the CAPTCHA and the TRUST_PROXY parser.
