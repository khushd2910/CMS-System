# National Grievance Redressal Portal – Frontend

React (Vite) frontend for the CMS project. Current module: **Citizen Login**.

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
  pages/                   CitizenLogin (done), CitizenDashboard + ComingSoon (temporary placeholders)
  styles/                  tokens.css (colours/fonts), base, layout, form, login
```
