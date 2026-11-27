import { request } from "./apiClient";

// One function per backend endpoint (see backend/routes/auth.routes.js).
export const authService = {
  // Citizen sign-in. identifier is an email address.
  // -> { user: {id, role, name, email, departmentId}, token, tokenType, expiresIn }
  login: ({ identifier, password, captchaId, captchaAnswer }) =>
    request("/auth/login", { method: "POST", body: { identifier, password, captchaId, captchaAnswer } }),

  // -> signed-in citizen session. Code is single-use, expires after ten minutes, and allows five attempts.
  verifyEmail: ({ email, code }) =>
    request("/auth/verify-email", { method: "POST", body: { email, code } }),

  // Compatibility for verification links sent before the OTP flow was enabled.
  verifyEmailLink: (token, options) =>
    request(`/auth/verify-email/${encodeURIComponent(token)}`, { method: "POST", ...options }),

  // -> { message }. The answer is the same whether or not the account exists.
  resendVerification: ({ identifier }) =>
    request("/auth/resend-verification", { method: "POST", body: { identifier } }),

  // -> { requiresVerification: true }; the user is created only after email verification.
  // Status 409: serverCode EMAIL_EXISTS.
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),

  // -> { id, image (SVG data URI), expiresInSeconds }. Each CAPTCHA works once.
  captcha: (options) => request("/auth/captcha", options),

  // -> same shape as login. Admin accounts only; needs a valid CAPTCHA answer.
  adminLogin: ({ email, password, captchaId, captchaAnswer }) =>
    request("/auth/admin-login", { method: "POST", body: { email, password, captchaId, captchaAnswer } }),

  // -> same shape as login. Department managers only; needs a valid CAPTCHA answer.
  managerLogin: ({ email, password, captchaId, captchaAnswer }) =>
    request("/auth/manager-login", { method: "POST", body: { email, password, captchaId, captchaAnswer } }),

  // -> { message }. The answer is the same whether or not the account exists.
  forgotPassword: ({ email }) =>
    request("/auth/forgot-password", { method: "POST", body: { email } }),

  // -> { message }. Status 400 with "token" in the message: the link is invalid or expired.
  resetPassword: ({ token, password }) =>
    request(`/auth/reset-password/${encodeURIComponent(token)}`, { method: "POST", body: { password } }),

  // -> { user }   (needs the Bearer token)
  me: (options) => request("/auth/me", { auth: true, ...options }),

  // -> { message }
  logout: () => request("/auth/logout", { method: "POST", auth: true }),
};
