const passwordPolicyError = (password) => {
    if (typeof password !== "string" || password.length < 8) {
        return "Password must be at least 8 characters.";
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

module.exports = { passwordPolicyError };
