// The server (bcrypt) only reads the first 72 BYTES of a password, so longer ones are refused.
// Same number as backend/utils/password.js. Bytes, not characters: an emoji is 4 bytes.
export const MAX_PASSWORD_BYTES = 72;
export const passwordBytes = (value) => new TextEncoder().encode(value).length;

// Registration password policy: 8 to 72 characters, with a letter, a number, and a symbol.
export function validateNewPassword(value) {
  if (!value) return "Create a password.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (passwordBytes(value) > MAX_PASSWORD_BYTES) {
    return `Password is too long. Use at most ${MAX_PASSWORD_BYTES} characters (emoji and accented letters count as more than one).`;
  }
  if (!/[A-Za-z]/.test(value)) return "Password must include at least one letter.";
  if (!/\d/.test(value)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9\s]/.test(value)) return "Password must include at least one symbol.";
  return "";
}
