# Grievance Redressal Portal – Frontend

React (Vite) frontend for the CMS project. Current modules include **Citizen Login and Registration**, **Admin Login and Dashboard**, and **Department Manager Login**.

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
- Admins sign in with their **email**. The User model has no separate Admin ID field (`SUPPORTS_ADMIN_ID_LOGIN` in `config/auth.config.js`).
- The dashboard provides grievance totals, department workload, recent activity, urgent alerts, reports, grievance assignment,
  and department/manager management. Manager password changes invalidate existing manager sessions.
- "Forgot Password?" links to `/forgot-password`, which is still a placeholder page. An admin-specific recovery
  page has not been built (the backend `forgot-password` / `reset-password` endpoints exist and work for any account with an email).

## Citizen Login notes

- Calls `GET /api/auth/captcha` and submits its one-use challenge with credentials to `POST /api/auth/login`.
- CAPTCHA challenges expire after five minutes. A new challenge is fetched after each failed attempt.

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
