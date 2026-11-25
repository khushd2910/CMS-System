// Small switches that describe what the backend currently supports.
// Change them here instead of hunting through components.

// POST /api/auth/login currently accepts { email, password } only.
// Set this to true once the backend can also sign in with a mobile number.
export const SUPPORTS_MOBILE_LOGIN = false;

// Roles allowed to sign in on the Citizen Login page.
// (admin and manager will get their own sign-in later.)
export const CITIZEN_PORTAL_ROLES = ["citizen"];

// Where a citizen goes after a successful login.
export const CITIZEN_HOME_PATH = "/citizen/dashboard";

// Mobile OTP verification during registration.
// The backend has no OTP endpoints or SMS provider yet, so this stays false and the
// registration page does not show an OTP step. See README for what is required.
export const SUPPORTS_MOBILE_OTP = false;
