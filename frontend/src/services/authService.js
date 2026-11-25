import { request } from "./apiClient";

// One function per backend endpoint (see backend/routes/auth.routes.js).
export const authService = {
  // Citizen sign-in. identifier = email address or 10-digit mobile number.
  // -> { user: {id, role, name, mobileNo, email, departmentId}, token, tokenType, expiresIn }
  login: ({ identifier, password }) => request("/auth/login", { method: "POST", body: { identifier, password } }),

  // -> { message }. Single-use-safe: opening the same link twice still succeeds.
  verifyEmail: (token) => request(`/auth/verify-email/${encodeURIComponent(token)}`, { method: "POST" }),

  // -> { message }. The answer is the same whether or not the account exists.
  resendVerification: ({ identifier }) =>
    request("/auth/resend-verification", { method: "POST", body: { identifier } }),

  // -> same shape as login (signed in at once), OR { requiresVerification: true } with no token when the
  //    backend requires email verification. Status 409: serverCode EMAIL_EXISTS or MOBILE_EXISTS.
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),

  // -> { id, image (SVG data URI), expiresInSeconds }. Each CAPTCHA works once.
  captcha: (options) => request("/auth/captcha", options),

  // -> same shape as login. Admin accounts only; needs a valid CAPTCHA answer.
  adminLogin: ({ email, password, captchaId, captchaAnswer }) =>
    request("/auth/admin-login", { method: "POST", body: { email, password, captchaId, captchaAnswer } }),

  // -> same shape as login. Department managers only; needs a valid CAPTCHA answer.
  managerLogin: ({ email, password, captchaId, captchaAnswer }) =>
    request("/auth/manager-login", { method: "POST", body: { email, password, captchaId, captchaAnswer } }),

  // -> { user }   (needs the Bearer token)
  me: (options) => request("/auth/me", { auth: true, ...options }),

  // -> { message }
  logout: () => request("/auth/logout", { method: "POST", auth: true }),
};
