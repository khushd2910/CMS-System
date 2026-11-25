const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User } = require("../models");
const { getSecret } = require("../middleware/auth");
const { sendPasswordResetEmail } = require("../utils/email");
const { createCaptcha, verifyCaptcha } = require("../utils/captcha");
const { isLocked, recordFailure, clearFailures } = require("../utils/login-throttle");

const publicUser = (user) => ({
    id: user._id,
    role: user.role,
    name: user.name,
    mobileNo: user.mobileNo,
    email: user.email,
    departmentId: user.departmentId,
});

const createToken = (user) =>
    jwt.sign({ userId: user._id.toString(), role: user.role }, getSecret(), {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    });

const GENDERS = ["male", "female", "other", "prefer_not_to_say"];
const LANGUAGES = ["en", "hi", "gu"];
const clean = (value) => (typeof value === "string" ? value.trim() : "");

// Normalises "+91 98765-43210" / "098765 43210" to 10 digits.
const normalizeMobile = (value) => {
    let digits = clean(value).replace(/[\s\-().]/g, "");
    if (digits.startsWith("+91")) digits = digits.slice(3);
    else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    return digits;
};

const authResponse = (user) => ({
    user: publicUser(user),
    token: createToken(user),
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
});

const register = async (req, res, next) => {
    try {
        const {
            name, mobileNo, email, password,
            dateOfBirth, gender, preferredLanguage, address,
        } = req.body || {};
        const normalizedName = clean(name);
        const normalizedEmail = clean(email).toLowerCase();
        if (!normalizedName || !normalizedEmail || typeof password !== "string") {
            return res.status(400).json({ message: "name, email, and password are required." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ message: "A valid email address is required." });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters." });
        }

        // Optional profile fields: only validated when they are sent, so older clients still work.
        const profile = {};
        if (mobileNo !== undefined && clean(mobileNo)) {
            const mobile = normalizeMobile(mobileNo);
            if (!/^[6-9]\d{9}$/.test(mobile)) {
                return res.status(400).json({ message: "A valid 10-digit Indian mobile number is required." });
            }
            profile.mobileNo = mobile;
        }
        if (clean(dateOfBirth)) {
            const dob = new Date(dateOfBirth);
            if (Number.isNaN(dob.getTime()) || dob > new Date()) {
                return res.status(400).json({ message: "Date of birth is not valid." });
            }
            profile.dateOfBirth = dob;
        }
        if (clean(gender)) {
            if (!GENDERS.includes(gender)) return res.status(400).json({ message: "Gender is not valid." });
            profile.gender = gender;
        }
        if (clean(preferredLanguage)) {
            if (!LANGUAGES.includes(preferredLanguage)) {
                return res.status(400).json({ message: "Preferred language is not valid." });
            }
            profile.preferredLanguage = preferredLanguage;
        }
        if (address && typeof address === "object") {
            const pinCode = clean(address.pinCode);
            if (pinCode && !/^[1-9]\d{5}$/.test(pinCode)) {
                return res.status(400).json({ message: "PIN code must be 6 digits." });
            }
            profile.address = {
                state: clean(address.state),
                district: clean(address.district),
                cityOrTaluka: clean(address.cityOrTaluka),
                villageOrWard: clean(address.villageOrWard),
                line: clean(address.line),
                landmark: clean(address.landmark),
                pinCode,
            };
        }

        const user = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 12),
            role: "citizen",
            ...profile,
        });
        return res.status(201).json(authResponse(user));
    } catch (error) {
        return next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (!normalizedEmail || typeof password !== "string") {
            return res.status(400).json({ message: "email and password are required." });
        }

        const user = await User.findOne({ email: normalizedEmail }).select("+password");
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid email or password." });
        }
        return res.json(authResponse(user));
    } catch (error) {
        return next(error);
    }
};

const getMe = (req, res) => res.json({ user: publicUser(req.user) });

const logout = (req, res) =>
    res.json({ message: "Logged out successfully. Remove the token from the client." });

const forgotPassword = async (req, res, next) => {
    try {
        const email = typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";
        if (email) {
            const user = await User.findOne({ email }).select("+passwordResetTokenHash +passwordResetExpires");
            if (user) {
                const resetToken = crypto.randomBytes(32).toString("hex");
                user.passwordResetTokenHash = crypto
                    .createHash("sha256")
                    .update(resetToken)
                    .digest("hex");
                user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
                await user.save();

                const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
                const resetUrl = `${clientUrl}/reset-password/${resetToken}`;
                if (process.env.SMTP_HOST) {
                    sendPasswordResetEmail({ email: user.email, name: user.name, resetUrl })
                        .catch((error) => console.error(`Password reset email failed: ${error.message}`));
                }
            }
        }

        return res.json({
            message: "If an account exists for that email, password reset instructions have been sent.",
        });
    } catch (error) {
        return next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const token = typeof req.params.token === "string" ? req.params.token : "";
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        if (!token) {
            return res.status(400).json({ message: "Password reset token is required." });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters." });
        }

        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const user = await User.findOne({
            passwordResetTokenHash: tokenHash,
            passwordResetExpires: { $gt: new Date() },
        }).select("+password +passwordResetTokenHash +passwordResetExpires");
        if (!user) {
            return res.status(400).json({ message: "Password reset token is invalid or expired." });
        }

        user.password = await bcrypt.hash(password, 12);
        user.passwordResetTokenHash = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        return res.json({ message: "Password has been reset successfully." });
    } catch (error) {
        return next(error);
    }
};

// ---------- Admin login (CAPTCHA + admin-only) ----------

// A real bcrypt hash compared against when the account does not exist, so a missing account
// takes as long to reject as a wrong password (no account-enumeration through timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const getCaptcha = (req, res) => {
    res.set("Cache-Control", "no-store");
    return res.json(createCaptcha());
};

// One login handler for every staff role (admin, manager). Each role gets its own endpoint, its own
// lock-out counter and its own generic error text, and an account of any other role is rejected
// with exactly the same answer as a wrong password.
const createStaffLogin = (role, invalidMessage) => async (req, res, next) => {
    try {
        const { email, password, captchaId, captchaAnswer } = req.body || {};
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (!normalizedEmail || typeof password !== "string" || !password) {
            return res.status(400).json({ message: "Email and password are required.", code: "MISSING_FIELDS" });
        }
        const throttleKey = `${role}:${normalizedEmail}`;

        if (isLocked(req.ip, throttleKey)) {
            console.warn(`[${role}-login] locked out ip=${req.ip}`);
            return res.status(429).json({
                message: "Too many failed attempts. Try again later.",
                code: "TOO_MANY_ATTEMPTS",
            });
        }

        // CAPTCHA is checked first and is used up whether or not it was right.
        if (!verifyCaptcha(captchaId, captchaAnswer)) {
            recordFailure(req.ip, throttleKey);
            return res.status(400).json({ message: "CAPTCHA verification failed.", code: "CAPTCHA_INVALID" });
        }

        const user = await User.findOne({ email: normalizedEmail }).select("+password");
        const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

        // Same answer for "no such account", "wrong password" and "wrong role":
        // the page must not reveal which accounts exist or what role an account has.
        if (!user || !passwordOk || user.role !== role) {
            recordFailure(req.ip, throttleKey);
            console.warn(`[${role}-login] failed ip=${req.ip}`);
            return res.status(401).json({ message: invalidMessage, code: "INVALID_CREDENTIALS" });
        }

        clearFailures(req.ip, throttleKey);
        console.info(`[${role}-login] success userId=${user._id} ip=${req.ip}`);
        return res.json(authResponse(user));
    } catch (error) {
        return next(error);
    }
};

const adminLogin = createStaffLogin("admin", "Invalid Admin ID or Password.");
const managerLogin = createStaffLogin("manager", "Invalid Manager ID or Password.");

module.exports = {
    register, login, getMe, logout, forgotPassword, resetPassword, getCaptcha, adminLogin, managerLogin,
};
