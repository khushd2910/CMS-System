// bcrypt only reads the first 72 BYTES of a password and ignores the rest. Without a limit, two very long
// passwords that start the same would both work, and a huge value wastes server time. So we refuse
// anything longer. Bytes, not characters: an emoji is 4 bytes, an accented letter is 2.
// Same number as frontend/src/utils/passwordRules.js.
const MAX_PASSWORD_BYTES = 72;

const passwordPolicyError = (password) => {
    if (typeof password !== "string" || password.length < 8) {
        return "Password must be at least 8 characters.";
    }
    if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
        return `Password is too long. Use at most ${MAX_PASSWORD_BYTES} characters (emoji and accented letters count as more than one).`;
    }
    if (!/[A-Za-z]/.test(password)) {
        return "Password must include at least one letter.";
    }
    if (!/\d/.test(password)) {
        return "Password must include at least one number.";
    }
    if (!/[^A-Za-z0-9\s]/.test(password)) {
        return "Password must include at least one symbol.";
    }
    return "";
};

module.exports = { passwordPolicyError, MAX_PASSWORD_BYTES };
