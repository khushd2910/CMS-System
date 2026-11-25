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
- Wireframe registration/login/forgot-password differences (extra fields, mobile login, CAPTCHA, OTP) are untouched.
