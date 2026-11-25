import { request } from "./apiClient";

// One function per backend endpoint (see backend/routes/auth.routes.js).
export const authService = {
  // -> { user: {id, role, name, mobileNo, email, departmentId}, token, tokenType, expiresIn }
  login: ({ email, password }) => request("/auth/login", { method: "POST", body: { email, password } }),

  // -> { user }   (needs the Bearer token)
  me: (options) => request("/auth/me", { auth: true, ...options }),

  // -> { message }
  logout: () => request("/auth/logout", { method: "POST", auth: true }),
};
