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
