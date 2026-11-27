# Grievance Redressal Portal – Frontend

React (Vite) frontend for the CMS project. Current modules include **Citizen Login, Registration and Dashboard**, **Admin Login and Dashboard**, and **Department Manager Login**.

## Run it

1. Start the backend (in `backend/`): `npm install`, create `backend/.env` from `.env.example`, then `npm run dev` (port 3000).
2. Start the frontend (in `frontend/`):

```bash
npm install
npm run dev
```

Open http://localhost:5173 (it opens the Citizen Login page).
In development, requests to `/api/...` are forwarded to the backend by Vite (see `vite.config.js`),
so no backend URL is hard-coded and CORS is not an issue.

`npm run build` creates a production build in `dist/`. For production set `VITE_API_BASE_URL` (see `.env.example`).

## Folder map

```
src/
  main.jsx, App.jsx        entry point and routes
  config/auth.config.js    allowed roles and post-login page
  services/                apiClient (fetch wrapper), authService (one function per endpoint), tokenStorage
  context/AuthContext.jsx  who is signed in (login / logout / restore session)
  utils/validators.js      email + password validation
  components/ui/           TextField, PasswordField, Button, Alert
  components/layout/       PortalHeader, NavBar, Breadcrumb, PortalFooter, PortalLayout, PortalEmblem
  components/ProtectedRoute.jsx
  pages/                   Citizen and staff pages, AdminDashboard, admin department/manager/grievance modules
  data/locations.js        State/District/Taluka choices; Gujarat includes all 34 districts and 265 talukas
  styles/                  tokens.css (colours/fonts), base, layout, form, login
```

## Citizen Registration notes

- Route: `/register`. Posts to `POST /api/auth/register`; the user remains a pending registration until the
  six-digit email verification code is accepted. Only then is a citizen account created and signed in.
- Registration requires name, email, address, PIN code, and acceptance of the Terms and Conditions and
  Privacy Policy. The backend stores the acceptance and its timestamp. Passwords require at least 8 characters,
  a letter, a number, and a symbol. English is the only supported site language.
- The location dropdown has all Gujarat districts and talukas; other states are still sample data.

## Admin Login notes

- Routes: `/admin/login`, `/admin/verify-otp`, and `/admin/dashboard` (`ProtectedRoute roles={["admin"]}`).
- Sign-in requires the CAPTCHA, email/password, and a one-time code emailed to the administrator. The token is not
  issued until the code is verified. OTPs expire after five minutes and can be resent after the cooldown.
- The admin token is kept in `sessionStorage` only (no "remember me"); passwords are never stored client-side and raw OTPs are not retained.
- The pending OTP challenge ID and its safe navigation metadata are kept in tab-scoped `sessionStorage`, so refreshing the verification page does not lose the challenge.
- Admins sign in with their **email**. The User model has no separate Admin ID field (`SUPPORTS_ADMIN_ID_LOGIN` in `config/auth.config.js`).
- The dashboard provides grievance totals, department workload, recent activity, urgent alerts, reports, grievance assignment,
  and department/manager management. Manager password changes invalidate existing manager sessions.
- "Forgot Password?" links to `/forgot-password`. The backend awaits reset-email delivery, removes a newly issued token if delivery fails, and keeps responses generic to prevent account enumeration.

## Citizen Login notes

- Calls `GET /api/auth/captcha` and submits its one-use challenge with credentials to `POST /api/auth/login`.
- CAPTCHA challenges expire after five minutes. A new challenge is fetched after each failed attempt.

## Citizen Dashboard notes

- `/citizen/dashboard` shows account-scoped grievance totals, the latest three grievances and notifications.
- Quick services link to grievance submission, reference tracking, paginated history, and profile updates. Detail pages show the current status and its history; notifications can be marked read.
- Dashboard totals come from `GET /api/grievances/dashboard`; grievance lists and details use the same citizen ownership checks as the API.
- Profile updates allow a citizen to change their name and address. The verified email address cannot be edited from this page.

## Department Manager Login notes

- Routes: `/manager/login` and `/manager/dashboard` (temporary placeholder, `roles={["manager"]}`).
- `components/auth/StaffLoginPage.jsx` is the shared page behind both staff logins; `pages/AdminLogin.jsx` and
  `pages/ManagerLogin.jsx` are thin wrappers that pass wording, role and endpoint.
- Calls `POST /api/auth/manager-login` (CAPTCHA from `GET /api/auth/captcha`). Managers sign in with their email
  (`SUPPORTS_MANAGER_ID_LOGIN` in `config/auth.config.js` is false: there is no Manager ID field yet).

## Citizen login / verification notes

- Citizen login sends `{ identifier, password }` (email only). Staff accounts are refused by the backend with the generic wrong-password answer.
- A signed-in person who opens `/login` or `/register` is sent to their own role's landing page (`homePathForRole`).
- `/verify-email` verifies the email code and signs the citizen in after the account is created. `/verify-email/:token` remains for older email verification links.
