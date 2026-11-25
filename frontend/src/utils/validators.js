import { SUPPORTS_MOBILE_LOGIN } from "../config/auth.config";

// Same rule the backend uses for email (backend/controller/auth.controller.js).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indian mobile numbers: 10 digits starting with 6, 7, 8 or 9.
const MOBILE_PATTERN = /^[6-9]\d{9}$/;

// "+91 98765-43210", "098765 43210" and "9876543210" all become "9876543210".
export function normalizeMobile(value) {
  let digits = value.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+91")) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

const looksLikeMobile = (value) => /^[+\d\s\-().]+$/.test(value);

/** Returns an error message, or "" when the value is fine. */
export function validateIdentifier(raw) {
  const value = raw.trim();
  if (!value) return "Enter your email address or registered mobile number.";

  if (value.includes("@")) {
    return EMAIL_PATTERN.test(value) ? "" : "Enter a valid email address, for example name@example.com.";
  }
  if (looksLikeMobile(value)) {
    if (!MOBILE_PATTERN.test(normalizeMobile(value))) return "Enter a valid 10-digit mobile number.";
    return SUPPORTS_MOBILE_LOGIN
      ? ""
      : "Signing in with a mobile number is not available yet. Use your registered email address.";
  }
  return "Enter a valid email address or a 10-digit mobile number.";
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

export function validateMobile(raw) {
  if (!raw.trim()) return "Enter your mobile number.";
  return MOBILE_PATTERN.test(normalizeMobile(raw)) ? "" : "Enter a valid 10-digit mobile number.";
}

export function validateEmail(raw) {
  const value = raw.trim();
  if (!value) return "Enter your email address.";
  return EMAIL_PATTERN.test(value) ? "" : "Enter a valid email address, for example name@example.com.";
}

// Deliberately simple: at least 8 characters with a letter and a number.
export function validateNewPassword(value) {
  if (!value) return "Create a password.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return "Password must include at least one letter and one number.";
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
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Za-z]/.test(value) && /\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) score += 1;
  const labels = ["Weak", "Weak", "Fair", "Good", "Strong"];
  return { score: Math.max(score, 1), label: labels[score] };
}
