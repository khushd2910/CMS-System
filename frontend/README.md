# National Grievance Redressal Portal – Frontend

React (Vite) frontend for the CMS project. Current modules: **Citizen Login**, **Citizen Registration**, **Admin Login** and **Department Manager Login**.

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
  config/auth.config.js    switches: mobile login on/off, allowed roles, post-login page
  services/                apiClient (fetch wrapper), authService (one function per endpoint), tokenStorage
  context/AuthContext.jsx  who is signed in (login / logout / restore session)
  utils/validators.js      email + mobile + password validation
  components/ui/           TextField, PasswordField, Button, Alert
  components/layout/       PortalHeader, NavBar, Breadcrumb, PortalFooter, PortalLayout, PortalEmblem
  components/ProtectedRoute.jsx
  pages/                   CitizenLogin, CitizenRegister (done), CitizenDashboard + ComingSoon (temporary placeholders)
  data/locations.js        SAMPLE State/District/City list for the registration dropdowns (replace with full data)
  styles/                  tokens.css (colours/fonts), base, layout, form, login
```

## Citizen Registration notes

- Route: `/register`. Posts to `POST /api/auth/register`; the backend signs the citizen in, so the page shows a
  success message and then offers "Go to Dashboard" (same behaviour as before).
- Mobile OTP is **not implemented**: the backend has no OTP endpoints or SMS provider. `SUPPORTS_MOBILE_OTP` in
  `config/auth.config.js` is `false`. To add it you need an SMS/OTP provider (e.g. MSG91, Twilio, or an
  NIC/government gateway), endpoints to send and verify an OTP (hashed, short expiry, attempt limit, rate limit),
  and a `mobileVerified` flag on the user.

## Admin Login notes

- Routes: `/admin/login` (page) and `/admin/dashboard` (temporary placeholder, `ProtectedRoute roles={["admin"]}`).
- Calls `GET /api/auth/captcha` and `POST /api/auth/admin-login`. The admin token is kept in `sessionStorage` only
  (no "remember me"); credentials are never stored.
- Admins sign in with their **email**. The User model has no separate Admin ID field (`SUPPORTS_ADMIN_ID_LOGIN` in `config/auth.config.js`).
- "Forgot Password?" links to `/forgot-password`, which is still a placeholder page. An admin-specific recovery
  page has not been built (the backend `forgot-password` / `reset-password` endpoints exist and work for any account with an email).

## Department Manager Login notes

- Routes: `/manager/login` and `/manager/dashboard` (temporary placeholder, `roles={["manager"]}`).
- `components/auth/StaffLoginPage.jsx` is the shared page behind both staff logins; `pages/AdminLogin.jsx` and
  `pages/ManagerLogin.jsx` are thin wrappers that pass wording, role and endpoint.
- Calls `POST /api/auth/manager-login` (CAPTCHA from `GET /api/auth/captcha`). Managers sign in with their email
  (`SUPPORTS_MANAGER_ID_LOGIN` in `config/auth.config.js` is false: there is no Manager ID field yet).
