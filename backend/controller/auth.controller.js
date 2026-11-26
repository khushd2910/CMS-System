const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User, AuditLog } = require("../models");
const { getSecret } = require("../middleware/auth");
const { sendPasswordResetEmail, sendVerificationEmail } = require("../utils/email");
const { createCaptcha, verifyCaptcha } = require("../utils/captcha");
const { getLockStatus } = require("../utils/login-throttle");
const { recordAudit, normalizeIdentifier, clientIp } = require("../utils/audit");
const { passwordPolicyError } = require("../utils/password");

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

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;

const newVerificationCode = () => {
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
    return {
        code,
        hash: crypto.createHash("sha256").update(code).digest("hex"),
        expires: new Date(Date.now() + EMAIL_CODE_TTL_MS),
    };
};

const deliverVerification = ({ email, name, code }) =>
    sendVerificationEmail({ email, name, code });

const GENDERS = ["male", "female", "other", "prefer_not_to_say"];
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
            dateOfBirth, gender, address, termsAccepted,
        } = req.body || {};
        const normalizedName = clean(name);
        const normalizedEmail = clean(email).toLowerCase();
        if (normalizedName.length < 2) {
            return res.status(400).json({ message: "Name must be at least 2 characters." });
        }
        if (!normalizedEmail) {
            return res.status(400).json({ message: "Email address is required." });
        }
        if (typeof password !== "string") {
            return res.status(400).json({ message: "Password is required." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ message: "A valid email address is required." });
        }
        const passwordError = passwordPolicyError(password);
        if (passwordError) {
            return res.status(400).json({ message: passwordError });
        }

        const mobile = normalizeMobile(mobileNo);
        if (!/^[6-9]\d{9}$/.test(mobile)) {
            return res.status(400).json({ message: "A valid 10-digit Indian mobile number is required." });
        }
        if (!address || typeof address !== "object" || Array.isArray(address)) {
            return res.status(400).json({ message: "Address is required." });
        }
        const normalizedAddress = {
            state: clean(address.state),
            district: clean(address.district),
            cityOrTaluka: clean(address.cityOrTaluka),
            villageOrWard: clean(address.villageOrWard),
            line: clean(address.line),
            landmark: clean(address.landmark),
            pinCode: clean(address.pinCode),
        };
        if (
            !normalizedAddress.state ||
            !normalizedAddress.district ||
            !normalizedAddress.cityOrTaluka ||
            !normalizedAddress.line
        ) {
            return res.status(400).json({
                message: "State, district, city or taluka, and complete address are required.",
            });
        }
        if (!/^[1-9]\d{5}$/.test(normalizedAddress.pinCode)) {
            return res.status(400).json({ message: "PIN code must be 6 digits." });
        }
        if (termsAccepted !== true) {
            return res.status(400).json({
                message: "You must accept the Terms and Conditions and Privacy Policy to register.",
            });
        }

        const profile = {
            mobileNo: mobile,
            address: normalizedAddress,
            termsAccepted: true,
            termsAcceptedAt: new Date(),
        };
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
        if (mustVerify && !smtpConfigured()) {
            return res.status(503).json({
                message: "Email service is not available. Please try again later.",
                code: "EMAIL_UNAVAILABLE",
            });
        }
        const verification = mustVerify ? newVerificationCode() : null;

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
                emailVerificationAttempts: 0,
            }),
        });

        if (verification) {
            try {
                await deliverVerification({ email: user.email, name: user.name, code: verification.code });
            } catch (error) {
                console.error(`Verification email delivery failed (${error.code || "SMTP_ERROR"}).`);
                return res.status(503).json({
                    message: "We could not send your verification code. Please try again later.",
                    code: "EMAIL_DELIVERY_FAILED",
                });
            }
            return res.status(201).json({
                message: "Registration successful. Enter the verification code sent to your email before signing in.",
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
        const { password, captchaId, captchaAnswer } = req.body || {};
        if (!identifier || typeof password !== "string" || !password) {
            return res.status(400).json({ message: "Email or mobile number and password are required." });
        }
        if (!verifyCaptcha(captchaId, captchaAnswer)) {
            return res.status(400).json({ message: "CAPTCHA verification failed.", code: "CAPTCHA_INVALID" });
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

const verifyEmailCode = async (req, res, next) => {
    try {
        const email = clean(req.body?.email).toLowerCase();
        const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
        const invalidResponse = {
            message: "The verification code is invalid, expired, or has reached its attempt limit.",
            code: "EMAIL_CODE_INVALID",
        };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
            return res.status(400).json(invalidResponse);
        }

        const user = await User.findOne({ email, role: "citizen", emailVerified: false })
            .select("+emailVerificationTokenHash +emailVerificationExpires +emailVerificationAttempts");
        const storedHash = user?.emailVerificationTokenHash;
        const expires = user?.emailVerificationExpires;
        const attempts = Number.isInteger(user?.emailVerificationAttempts) ? user.emailVerificationAttempts : 0;
        if (
            !user ||
            !/^[a-f\d]{64}$/i.test(storedHash || "") ||
            !(expires instanceof Date) ||
            expires <= new Date() ||
            attempts >= EMAIL_CODE_MAX_ATTEMPTS
        ) {
            return res.status(400).json(invalidResponse);
        }

        const codeHash = crypto.createHash("sha256").update(code).digest("hex");
        const sameCode = crypto.timingSafeEqual(Buffer.from(codeHash, "hex"), Buffer.from(storedHash, "hex"));
        const attemptLimit = {
            $or: [
                { emailVerificationAttempts: { $lt: EMAIL_CODE_MAX_ATTEMPTS } },
                { emailVerificationAttempts: { $exists: false } },
            ],
        };
        if (!sameCode) {
            await User.updateOne(
                {
                    _id: user._id,
                    emailVerified: false,
                    emailVerificationTokenHash: storedHash,
                    emailVerificationExpires: { $gt: new Date() },
                    ...attemptLimit,
                },
                { $inc: { emailVerificationAttempts: 1 } }
            );
            return res.status(400).json(invalidResponse);
        }

        const verified = await User.findOneAndUpdate(
            {
                _id: user._id,
                emailVerified: false,
                emailVerificationTokenHash: storedHash,
                emailVerificationExpires: { $gt: new Date() },
                ...attemptLimit,
            },
            {
                $set: { emailVerified: true, emailVerificationAttempts: 0 },
                $unset: { emailVerificationTokenHash: "", emailVerificationExpires: "" },
            },
            { returnDocument: "after" }
        );
        if (!verified) return res.status(400).json(invalidResponse);
        return res.json(authResponse(verified));
    } catch (error) {
        return next(error);
    }
};

// At most 5 resend requests per IP + account every 15 minutes (kept in memory: it only protects the
// mailbox from being flooded, it does not guard a password).
const RESEND_WINDOW_MS = 15 * 60 * 1000;
const RESEND_MAX = 5;
const resendRequests = new Map(); // key -> { count, first }
const resendAllowed = (key) => {
    const now = Date.now();
    const entry = resendRequests.get(key);
    if (!entry || now - entry.first > RESEND_WINDOW_MS) {
        resendRequests.set(key, { count: 1, first: now });
        if (resendRequests.size > 10000) resendRequests.delete(resendRequests.keys().next().value);
        return true;
    }
    entry.count += 1;
    return entry.count <= RESEND_MAX;
};

const resendVerification = async (req, res, next) => {
    const generic = {
        message: "If this account is waiting for email verification, a new code has been sent.",
    };
    try {
        if (requireEmailVerification() && !smtpConfigured()) {
            return res.status(503).json({
                message: "Email service is not available. Please try again later.",
                code: "EMAIL_UNAVAILABLE",
            });
        }
        const raw = req.body?.identifier;
        const identifier = typeof raw === "string" ? raw.trim() : "";
        const query = identifier ? identifierQuery(identifier) : null;
        if (!query || !resendAllowed(`${clientIp(req)}|${identifier.toLowerCase()}`)) return res.json(generic);

        const user = await User.findOne(query)
            .select("+emailVerificationTokenHash +emailVerificationExpires +emailVerificationAttempts");
        if (user && user.role === "citizen" && user.emailVerified === false && requireEmailVerification()) {
            const verification = newVerificationCode();
            user.emailVerificationTokenHash = verification.hash;
            user.emailVerificationExpires = verification.expires;
            user.emailVerificationAttempts = 0;
            await user.save();
            try {
                await deliverVerification({ email: user.email, name: user.name, code: verification.code });
            } catch (error) {
                console.error(`Verification email delivery failed (${error.code || "SMTP_ERROR"}).`);
                return res.status(503).json({
                    message: "We could not send your verification code. Please try again later.",
                    code: "EMAIL_DELIVERY_FAILED",
                });
            }
        }
        return res.json(generic); // same answer whether or not the account exists
    } catch (error) {
        return next(error);
    }
};

const getMe = (req, res) => res.json({ user: publicUser(req.user) });

const logout = async (req, res) => {
    if (req.user && req.user.role !== "citizen") await recordAudit(req, { event: "staff_logout" });
    return res.json({ message: "Logged out successfully. Remove the token from the client." });
};

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
        const passwordError = passwordPolicyError(password);
        if (passwordError) {
            return res.status(400).json({ message: passwordError });
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
        await recordAudit(req, { event: "password_reset", user, details: "Password changed with an emailed reset link." });
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

// Writes ONE "blocked" row per IP + account per minute, so someone hammering a locked account
// cannot fill the database with log entries.
const recordBlocked = async (req, role, identifier, scope) => {
    const recent = await AuditLog.exists({
        event: "staff_login", outcome: "blocked", role, identifier, ip: clientIp(req),
        createdAt: { $gt: new Date(Date.now() - 60 * 1000) },
    });
    if (!recent) {
        await recordAudit(req, { event: "staff_login", outcome: "blocked", reason: `locked_${scope}`, role, identifier });
    }
};

// One login handler for every staff role (admin, manager). Each role gets its own endpoint, its own
// lock-out counters and its own generic error text, and an account of any other role is rejected
// with exactly the same answer as a wrong password.
//
// Order of checks: lock-out -> CAPTCHA -> credentials. Every attempt is written to the audit trail
// (utils/audit.js); the lock-out rules (utils/login-throttle.js) are calculated from those entries.
const createStaffLogin = (role, invalidMessage) => async (req, res, next) => {
    try {
        const { email, password, captchaId, captchaAnswer } = req.body || {};
        const identifier = normalizeIdentifier(email);
        if (!identifier || typeof password !== "string" || !password) {
            return res.status(400).json({ message: "Email and password are required.", code: "MISSING_FIELDS" });
        }

        const lock = await getLockStatus({ ip: clientIp(req), role, identifier });
        if (lock.locked) {
            await recordBlocked(req, role, identifier, lock.scope);
            res.set("Retry-After", String(lock.retryAfterSeconds));
            return res.status(429).json({
                message: "Too many failed attempts. Try again later.",
                code: "TOO_MANY_ATTEMPTS",
                retryAfterSeconds: lock.retryAfterSeconds,
            });
        }

        // The CAPTCHA is checked first and is used up whether or not it was right.
        // A wrong CAPTCHA is logged but never counts against the ACCOUNT.
        if (!verifyCaptcha(captchaId, captchaAnswer)) {
            await recordAudit(req, { event: "staff_login", outcome: "failure", reason: "captcha_failed", role, identifier });
            return res.status(400).json({ message: "CAPTCHA verification failed.", code: "CAPTCHA_INVALID" });
        }

        const user = await User.findOne({ email: identifier }).select("+password");
        const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);

        // Same answer for "no such account", "wrong password" and "wrong role":
        // the page must not reveal which accounts exist or what role an account has.
        if (!user || !passwordOk || user.role !== role) {
            await recordAudit(req, { event: "staff_login", outcome: "failure", reason: "invalid_credentials", role, identifier });
            return res.status(401).json({ message: invalidMessage, code: "INVALID_CREDENTIALS" });
        }

        await recordAudit(req, { event: "staff_login", outcome: "success", role, identifier, user });
        return res.json(authResponse(user));
    } catch (error) {
        return next(error);
    }
};

const adminLogin = createStaffLogin("admin", "Invalid Admin ID or Password.");
const managerLogin = createStaffLogin("manager", "Invalid Manager ID or Password.");

module.exports = {
    register, login, getMe, logout, forgotPassword, resetPassword, getCaptcha, adminLogin, managerLogin,
    verifyEmail, verifyEmailCode, resendVerification,
};
