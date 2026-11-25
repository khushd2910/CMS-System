const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User } = require("../models");
const { getSecret } = require("../middleware/auth");
const { sendPasswordResetEmail, sendVerificationEmail } = require("../utils/email");
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

// A real bcrypt hash compared against when the account does not exist, so a missing account
// takes as long to reject as a wrong password (no account-enumeration through timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const requireEmailVerification = () => process.env.REQUIRE_EMAIL_VERIFICATION === "true";
const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

// Email = contains "@"; otherwise a 10-digit Indian mobile number. Returns a MongoDB filter, or null.
const identifierQuery = (identifier) => {
    if (identifier.includes("@")) return { email: identifier.toLowerCase() };
    const mobile = normalizeMobile(identifier);
    return /^[6-9]\d{9}$/.test(mobile) ? { mobileNo: mobile } : null;
};

const newVerificationToken = () => {
    const token = crypto.randomBytes(32).toString("hex");
    return {
        token,
        hash: crypto.createHash("sha256").update(token).digest("hex"),
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
};

// Sends the verification link. Without SMTP it is only printed to the server console, and only outside production.
const deliverVerification = ({ email, name, token }) => {
    const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
    const verifyUrl = `${clientUrl}/verify-email/${token}`;
    if (smtpConfigured()) {
        sendVerificationEmail({ email, name, verifyUrl })
            .catch((error) => console.error(`Verification email failed: ${error.message}`));
    } else if (process.env.NODE_ENV !== "production") {
        console.info(`[dev] SMTP not configured. Verification link for ${email}: ${verifyUrl}`);
    }
};

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

        const duplicate = await User.findOne({
            $or: [{ email: normalizedEmail }, ...(profile.mobileNo ? [{ mobileNo: profile.mobileNo }] : [])],
        }).select("email");
        if (duplicate) {
            const sameEmail = duplicate.email === normalizedEmail;
            return res.status(409).json({
                message: sameEmail
                    ? "An account with this email address already exists."
                    : "An account with this mobile number already exists.",
                code: sameEmail ? "EMAIL_EXISTS" : "MOBILE_EXISTS",
            });
        }

        const mustVerify = requireEmailVerification();
        if (mustVerify && !smtpConfigured() && process.env.NODE_ENV === "production") {
            return res.status(503).json({
                message: "Email service is not available. Please try again later.",
                code: "EMAIL_UNAVAILABLE",
            });
        }
        const verification = mustVerify ? newVerificationToken() : null;

        const user = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 12),
            role: "citizen",
            ...profile,
            ...(verification && {
                emailVerified: false,
                emailVerificationTokenHash: verification.hash,
                emailVerificationExpires: verification.expires,
            }),
        });

        if (verification) {
            // No token is issued yet: the citizen signs in after confirming their email.
            deliverVerification({ email: user.email, name: user.name, token: verification.token });
            return res.status(201).json({
                message: "Registration successful. Check your email to verify your address before signing in.",
                requiresVerification: true,
                user: publicUser(user),
            });
        }
        return res.status(201).json(authResponse(user));
    } catch (error) {
        return next(error);
    }
};

const login = async (req, res, next) => {
    try {
        // "identifier" is an email address or a 10-digit mobile number. "email" is still accepted
        // so older clients keep working.
        const raw = req.body?.identifier ?? req.body?.email;
        const identifier = typeof raw === "string" ? raw.trim() : "";
        const { password } = req.body || {};
        if (!identifier || typeof password !== "string" || !password) {
            return res.status(400).json({ message: "Email or mobile number and password are required." });
        }

        const query = identifierQuery(identifier);
        const user = query ? await User.findOne(query).select("+password") : null;
        const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

        // This is the CITIZEN sign-in. Admin and manager accounts have their own endpoints (with CAPTCHA),
        // so here they get exactly the same answer as a wrong password: nothing reveals that the account
        // exists or what role it has.
        if (!user || !passwordOk || user.role !== "citizen") {
            return res.status(401).json({ message: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
        }

        // Only said AFTER the correct password, so it does not reveal accounts to a stranger.
        if (user.emailVerified === false) {
            return res.status(403).json({
                message: "Please verify your email address before signing in.",
                code: "EMAIL_NOT_VERIFIED",
            });
        }
        return res.json(authResponse(user));
    } catch (error) {
        return next(error);
    }
};

const verifyEmail = async (req, res, next) => {
    try {
        const token = typeof req.params.token === "string" ? req.params.token : "";
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const user = await User.findOne({
            emailVerificationTokenHash: tokenHash,
            emailVerificationExpires: { $gt: new Date() },
        }).select("+emailVerificationTokenHash +emailVerificationExpires");
        if (!token || !user) {
            return res.status(400).json({ message: "Verification link is invalid or has expired." });
        }
        // Safe to repeat: opening the same link twice (or a browser pre-loading it) still ends "verified".
        user.emailVerified = true;
        await user.save();
        return res.json({ message: "Your email address has been verified. You can now sign in." });
    } catch (error) {
        return next(error);
    }
};

const resendVerification = async (req, res, next) => {
    const generic = {
        message: "If this account is waiting for email verification, a new verification email has been sent.",
    };
    try {
        const raw = req.body?.identifier;
        const identifier = typeof raw === "string" ? raw.trim() : "";
        const query = identifier ? identifierQuery(identifier) : null;
        const throttleKey = `resend:${identifier.toLowerCase()}`;
        if (!query || isLocked(req.ip, throttleKey)) return res.json(generic);
        recordFailure(req.ip, throttleKey); // every request counts: at most 5 per 15 minutes

        const user = await User.findOne(query).select("+emailVerificationTokenHash +emailVerificationExpires");
        if (user && user.role === "citizen" && user.emailVerified === false && requireEmailVerification()) {
            const verification = newVerificationToken();
            user.emailVerificationTokenHash = verification.hash;
            user.emailVerificationExpires = verification.expires;
            await user.save();
            deliverVerification({ email: user.email, name: user.name, token: verification.token });
        }
        return res.json(generic); // same answer whether or not the account exists
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
    verifyEmail, resendVerification,
};
