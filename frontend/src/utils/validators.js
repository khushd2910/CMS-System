import { SUPPORTS_ADMIN_ID_LOGIN, SUPPORTS_MANAGER_ID_LOGIN } from "../config/auth.config";

// Same rule the backend uses for email (backend/controller/auth.controller.js).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Returns an error message, or "" when the value is fine. */
export function validateIdentifier(raw) {
  const value = raw.trim();
  if (!value) return "Enter your email address.";
  return EMAIL_PATTERN.test(value) ? "" : "Enter a valid email address, for example name@example.com.";
}

/** Returns an error message, or "" when the value is fine. */
export function validatePassword(raw) {
  // Only "required" is checked on login: the backend checks the real password,
  // and older accounts may follow different password rules than new ones.
  return raw ? "" : "Enter your password.";
}

/* ---------- Registration ---------- */

export function validateFullName(raw) {
  const value = raw.trim();
  if (!value) return "Enter your full name.";
  if (value.length < 2) return "Full name must be at least 2 characters.";
  return "";
}

export function validateDob(value) {
  if (!value) return ""; // optional
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date > new Date()) return "Enter a valid date of birth.";
  if (date.getFullYear() < 1900) return "Enter a valid date of birth.";
  return "";
}

export function validateEmail(raw) {
  const value = raw.trim();
  if (!value) return "Enter your email address.";
  return EMAIL_PATTERN.test(value) ? "" : "Enter a valid email address, for example name@example.com.";
}

// Registration password policy: at least 8 characters, a letter, a number, and a symbol.
export function validateNewPassword(value) {
  if (!value) return "Create a password.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(value)) return "Password must include at least one letter.";
  if (!/\d/.test(value)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9\s]/.test(value)) return "Password must include at least one symbol.";
  return "";
}

export function validateConfirmPassword(password, confirm) {
  if (!confirm) return "Re-enter your password.";
  return password === confirm ? "" : "Passwords do not match.";
}

export function validateRequired(label) {
  return (value) => (value.trim() ? "" : `${label}.`);
}

export function validatePin(raw) {
  const value = raw.trim();
  if (!value) return "Enter your PIN code.";
  return /^[1-9]\d{5}$/.test(value) ? "" : "PIN code must be 6 digits.";
}

/** 0 (empty) .. 4 (strong), plus a label for the strength bar. */
export function passwordStrength(value) {
  if (!value) return { score: 0, label: "" };
  const hasRequiredCharacters =
    value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9\s]/.test(value);
  let score = hasRequiredCharacters ? 2 : 1;
  if (hasRequiredCharacters && value.length >= 12) score += 1;
  if (hasRequiredCharacters && value.length >= 16 && /[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
  const labels = ["Weak", "Weak", "Fair", "Good", "Strong"];
  return { score, label: labels[score] };
}

/* ---------- Admin login ---------- */

// The backend identifies admins by email only (there is no separate Admin ID field yet).
export function validateAdminIdentifier(raw) {
  const value = raw.trim();
  if (!value) return "Enter your Admin Email / ID.";
  if (!value.includes("@")) {
    return SUPPORTS_ADMIN_ID_LOGIN ? "" : "Enter your registered admin email address.";
  }
  return EMAIL_PATTERN.test(value) ? "" : "Enter a valid email address.";
}

export function validateCaptchaAnswer(raw) {
  return raw.trim() ? "" : "Enter the characters shown in the CAPTCHA.";
}

export function validateManagerIdentifier(raw) {
  const value = raw.trim();
  if (!value) return "Enter your registered email or Manager ID.";
  if (!value.includes("@")) {
    return SUPPORTS_MANAGER_ID_LOGIN ? "" : "Enter your registered email address.";
  }
  return EMAIL_PATTERN.test(value) ? "" : "Enter a valid email address.";
}
