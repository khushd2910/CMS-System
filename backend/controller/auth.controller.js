const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { User, PendingRegistration, AdminLoginChallenge, AuditLog } = require("../models");
const { getSecret } = require("../middleware/auth");
const {
    sendPasswordResetEmail,
    sendVerificationEmail,
    sendAdminLoginOtpEmail,
} = require("../utils/email");
const { createCaptcha, verifyCaptcha } = require("../utils/captcha");
const {
    getLockStatus,
    getCitizenLockStatus,
    recordCitizenLoginAttempt,
    recordCitizenBlocked,
    clearCitizenPairFailures,
} = require("../utils/login-throttle");
const { recordAudit, normalizeIdentifier, clientIp } = require("../utils/audit");
const { passwordPolicyError } = require("../utils/password");

const publicUser = (user) => ({
    id: user._id,
    role: user.role,
    name: user.name,
    email: user.email,
    departmentId: user.departmentId,
});

const createToken = (user) =>
    jwt.sign({ userId: user._id.toString(), role: user.role, tv: user.tokenVersion || 0 }, getSecret(), {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    });

// A real bcrypt hash compared against when the account does not exist, so a missing account
// takes as long to reject as a wrong password (no account-enumeration through timing).
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 12);

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

// The citizen sign-in accepts email addresses only.
const identifierQuery = (identifier) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
        ? { email: identifier.toLowerCase() }
        : null;
};

const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;
const PENDING_REGISTRATION_TTL_MS = 24 * 60 * 60 * 1000;

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

const authResponse = (user) => ({
    user: publicUser(user),
    token: createToken(user),
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
});

// At most 5 registration/resend requests per IP + email every 15 minutes.
const RESEND_WINDOW_MS = 15 * 60 * 1000;
const RESEND_MAX = 5;
const resendRequests = new Map();
// Counts one request for this key. Returns 0 when the request is allowed, otherwise the number of
// seconds until the window ends (so the client can tell the person how long to wait).
const resendWaitSeconds = (key) => {
    const now = Date.now();
    const entry = resendRequests.get(key);
    if (!entry || now - entry.first > RESEND_WINDOW_MS) {
        resendRequests.set(key, { count: 1, first: now });
        if (resendRequests.size > 10000) resendRequests.delete(resendRequests.keys().next().value);
        return 0;
    }
    entry.count += 1;
    if (entry.count <= RESEND_MAX) return 0;
    return Math.max(1, Math.ceil((entry.first + RESEND_WINDOW_MS - now) / 1000));
};
const resendAllowed = (key) => resendWaitSeconds(key) === 0;

const register = async (req, res, next) => {
    try {
        const {
            name, email, password,
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

        const profile = { address: normalizedAddress, termsAccepted: true, termsAcceptedAt: new Date() };
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

        if (await User.exists({ email: normalizedEmail })) {
            return res.status(409).json({
                message: "An account with this email address already exists.",
                code: "EMAIL_EXISTS",
            });
        }
        if (!smtpConfigured()) {
            return res.status(503).json({
                message: "Email service is not available. Please try again later.",
                code: "EMAIL_UNAVAILABLE",
            });
        }
        if (!resendAllowed(`${clientIp(req)}|registration|${normalizedEmail}`)) {
            return res.status(429).json({
                message: "Too many verification requests. Please try again later.",
                code: "EMAIL_RATE_LIMITED",
            });
        }
        const emailVerification = newVerificationCode();
        const registrationDetails = {
            email: normalizedEmail,
            name: normalizedName,
            password: await bcrypt.hash(password, 12),
            ...profile,
        };
        if (clean(dateOfBirth)) registrationDetails.dateOfBirth = new Date(dateOfBirth);
        if (clean(gender)) registrationDetails.gender = gender;
        const update = {
            $set: {
                verificationCodeHash: emailVerification.hash,
                verificationExpires: emailVerification.expires,
                verificationAttempts: 0,
                expiresAt: new Date(Date.now() + PENDING_REGISTRATION_TTL_MS),
            },
            $setOnInsert: registrationDetails,
            $unset: { verifiedAt: "" },
        };
        let pending;
        try {
            pending = await PendingRegistration.findOneAndUpdate(
                { email: normalizedEmail },
                update,
                { upsert: true, returnDocument: "after", runValidators: true, setDefaultsOnInsert: true }
            );
        } catch (error) {
            if (error.code !== 11000) throw error;
            pending = await PendingRegistration.findOneAndUpdate(
                { email: normalizedEmail },
                update,
                { returnDocument: "after", runValidators: true }
            );
            if (!pending) throw error;
        }

        try {
            await deliverVerification({
                email: pending.email,
                name: pending.name,
                code: emailVerification.code,
            });
        } catch (error) {
            console.error(`Verification email delivery failed (${error.code || "SMTP_ERROR"}).`);
            return res.status(503).json({
                message: "Registration is not complete because the verification email could not be sent. Request a new code to continue.",
                code: "EMAIL_DELIVERY_FAILED",
                requiresEmailVerification: true,
            });
        }
        return res.status(202).json({
            message: "Enter the code sent to your email to finish creating your account.",
            requiresVerification: true,
            requiresEmailVerification: true,
        });
    } catch (error) {
        return next(error);
    }
};

const login = async (req, res, next) => {
    try {
        // "email" remains accepted for clients predating the identifier field.
        const raw = req.body?.identifier ?? req.body?.email;
        const identifier = typeof raw === "string" ? raw.trim().toLowerCase() : "";
        const { password, captchaId, captchaAnswer } = req.body || {};
        if (!identifier || typeof password !== "string" || !password) {
            return res.status(400).json({ message: "Email and password are required." });
        }
        const ip = clientIp(req);
        const lock = await getCitizenLockStatus({ ip, identifier });
        if (lock.locked) {
            await recordCitizenBlocked({ ip, identifier });
            res.set("Retry-After", String(lock.retryAfterSeconds));
            return res.status(429).json({
                message: "Too many failed sign-in attempts. Please try again later.",
                code: "LOGIN_RATE_LIMITED",
                retryAfterSeconds: lock.retryAfterSeconds,
            });
        }
        if (!verifyCaptcha(captchaId, captchaAnswer)) {
            await recordCitizenLoginAttempt({ ip, identifier, reason: "captcha_failed" });
            return res.status(400).json({ message: "CAPTCHA verification failed.", code: "CAPTCHA_INVALID" });
        }

        const query = identifierQuery(identifier);
        const user = query ? await User.findOne(query).select("+password") : null;
        const pending = !user && query
            ? await PendingRegistration.findOne({ ...query, expiresAt: { $gt: new Date() } }).select("+password")
            : null;
        const passwordOk = await bcrypt.compare(password, user?.password || pending?.password || DUMMY_HASH);

        // This is the CITIZEN sign-in. Admin and manager accounts have their own endpoints (with CAPTCHA),
        // so here they get exactly the same answer as a wrong password: nothing reveals that the account
        // exists or what role it has.
        if (pending && passwordOk) {
            await clearCitizenPairFailures({ ip, identifier });
            return res.status(403).json({
                message: "Please verify your email address to finish creating your account.",
                code: "EMAIL_NOT_VERIFIED",
            });
        }
        if (!user || !passwordOk || user.role !== "citizen") {
            await recordCitizenLoginAttempt({ ip, identifier, reason: "invalid_credentials" });
            return res.status(401).json({ message: "Invalid email or password.", code: "INVALID_CREDENTIALS" });
        }

        // Only said AFTER the correct password, so it does not reveal accounts to a stranger.
        if (user.emailVerified === false) {
            await clearCitizenPairFailures({ ip, identifier });
            return res.status(403).json({
                message: "Please verify your email address before signing in.",
                code: "EMAIL_NOT_VERIFIED",
            });
        }
        await clearCitizenPairFailures({ ip, identifier });
        return res.json(authResponse(user));
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

        const pending = await PendingRegistration.findOne({ email, expiresAt: { $gt: new Date() } })
            .select("+password +verificationCodeHash +verificationExpires +verificationAttempts");
        if (pending) {
            const storedHash = pending.verificationCodeHash;
            const attempts = Number.isInteger(pending.verificationAttempts) ? pending.verificationAttempts : 0;
            const expires = pending.verificationExpires;
            if (
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
                verificationAttempts: { $lt: EMAIL_CODE_MAX_ATTEMPTS },
            };
            const claim = {
                _id: pending._id,
                verificationCodeHash: storedHash,
                verificationExpires: { $gt: new Date() },
                expiresAt: { $gt: new Date() },
                ...attemptLimit,
            };
            if (!sameCode) {
                await PendingRegistration.updateOne(claim, { $inc: { verificationAttempts: 1 } });
                return res.status(400).json(invalidResponse);
            }

            if (!pending.verifiedAt) {
                const markedVerified = await PendingRegistration.findOneAndUpdate(
                    { ...claim, verifiedAt: { $exists: false } },
                    { $set: { verifiedAt: new Date() } },
                    { returnDocument: "after" }
                );
                if (!markedVerified) {
                    const latest = await PendingRegistration.findById(pending._id);
                    if (!latest?.verifiedAt) return res.status(400).json(invalidResponse);
                }
            }

            let user;
            try {
                user = await User.create({
                    name: pending.name,
                    email: pending.email,
                    password: pending.password,
                    role: "citizen",
                    dateOfBirth: pending.dateOfBirth,
                    gender: pending.gender,
                    address: pending.address,
                    termsAccepted: pending.termsAccepted,
                    termsAcceptedAt: pending.termsAcceptedAt,
                    emailVerified: true,
                });
            } catch (error) {
                if (error.code === 11000) {
                    await PendingRegistration.deleteOne({ _id: pending._id });
                    return res.status(409).json({
                        message: "An account with this email address already exists.",
                        code: "EMAIL_EXISTS",
                    });
                }
                throw error;
            }
            await PendingRegistration.deleteOne({ _id: pending._id });
            return res.json(authResponse(user));
        }

        // Existing accounts created before verification was required may still finish their legacy flow.
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

const resendVerification = async (req, res, next) => {
    const generic = {
        message: "If this account is waiting for email verification, a new code has been sent.",
    };
    try {
        if (!smtpConfigured()) {
            return res.status(503).json({
                message: "Email service is not available. Please try again later.",
                code: "EMAIL_UNAVAILABLE",
            });
        }
        const raw = req.body?.identifier;
        const identifier = typeof raw === "string" ? raw.trim() : "";
        const query = identifier ? identifierQuery(identifier) : null;
        if (!query) return res.json(generic);
        // The limit is counted per IP + email text whether or not an account exists, so saying "too many
        // requests" reveals nothing about accounts. It stops the page from claiming a code was sent when
        // it was not.
        const waitSeconds = resendWaitSeconds(`${clientIp(req)}|${identifier.toLowerCase()}`);
        if (waitSeconds > 0) {
            res.set("Retry-After", String(waitSeconds));
            return res.status(429).json({
                message: "Too many verification requests. Please try again later.",
                code: "EMAIL_RATE_LIMITED",
                retryAfterSeconds: waitSeconds,
            });
        }

        const verification = newVerificationCode();
        const pending = await PendingRegistration.findOneAndUpdate(
            { ...query, expiresAt: { $gt: new Date() } },
            {
                $set: {
                    verificationCodeHash: verification.hash,
                    verificationExpires: verification.expires,
                    verificationAttempts: 0,
                },
                $unset: { verifiedAt: "" },
            },
            { returnDocument: "after" }
        );
        if (pending) {
            try {
                await deliverVerification({ email: pending.email, name: pending.name, code: verification.code });
            } catch (error) {
                console.error(`Verification email delivery failed (${error.code || "SMTP_ERROR"}).`);
                return res.status(503).json({
                    message: "We could not send your verification code. Please try again later.",
                    code: "EMAIL_DELIVERY_FAILED",
                });
            }
        } else {
            const user = await User.findOne(query)
                .select("+emailVerificationTokenHash +emailVerificationExpires +emailVerificationAttempts");
            if (user && user.role === "citizen" && user.emailVerified === false) {
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
        }
        return res.json(generic); // same answer whether or not the account exists
    } catch (error) {
        return next(error);
    }
};

const getMe = (req, res) => res.json({
    user: {
        ...publicUser(req.user),
        ...(req.user.role === "citizen" ? { address: req.user.address || {} } : {}),
    },
});

const updateCitizenProfile = async (req, res, next) => {
    try {
        const body = req.body;
        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return res.status(400).json({ message: "Profile details are required." });
        }

        const updates = {};
        if (body.name !== undefined) {
            const name = clean(body.name);
            if (name.length < 2 || name.length > 120) {
                return res.status(400).json({ message: "Name must be between 2 and 120 characters." });
            }
            updates.name = name;
        }
        if (body.address !== undefined) {
            if (!body.address || typeof body.address !== "object" || Array.isArray(body.address)) {
                return res.status(400).json({ message: "Address details are invalid." });
            }
            const address = {
                state: clean(body.address.state),
                district: clean(body.address.district),
                cityOrTaluka: clean(body.address.cityOrTaluka),
                villageOrWard: clean(body.address.villageOrWard),
                line: clean(body.address.line),
                landmark: clean(body.address.landmark),
                pinCode: clean(body.address.pinCode),
            };
            if (!address.state || !address.district || !address.cityOrTaluka || !address.line) {
                return res.status(400).json({
                    message: "State, district, city or taluka, and complete address are required.",
                });
            }
            if (!/^[1-9]\d{5}$/.test(address.pinCode)) {
                return res.status(400).json({ message: "PIN code must be 6 digits." });
            }
            if (Object.values(address).some((value) => value.length > 250)) {
                return res.status(400).json({ message: "Address fields must be 250 characters or fewer." });
            }
            updates.address = address;
        }
        if (!Object.keys(updates).length) {
            return res.status(400).json({ message: "Provide a name or address to update." });
        }

        const user = await User.findOne({ _id: req.user._id, role: "citizen" });
        if (!user) return res.status(404).json({ message: "Citizen account not found." });
        if (updates.name !== undefined) user.name = updates.name;
        if (updates.address !== undefined) user.address = updates.address;
        await user.save();
        return res.json({
            message: "Profile updated successfully.",
            user: { ...publicUser(user), address: user.address || {} },
        });
    } catch (error) {
        return next(error);
    }
};

const logout = async (req, res) => {
    if (req.user && req.user.role !== "citizen") await recordAudit(req, { event: "staff_logout" });
    return res.json({ message: "Logged out successfully. Remove the token from the client." });
};

const forgotPassword = async (req, res, next) => {
    try {
        const email = typeof req.body?.email === "string"
            ? req.body.email.trim().toLowerCase()
            : "";
        const genericResponse = {
            message: "If an account exists for that email, reset instructions will be sent. If no email arrives shortly, check your spam folder or try again later.",
        };
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(202).json(genericResponse);
        if (!smtpConfigured()) {
            return res.status(503).json({
                message: "Password reset email is temporarily unavailable. Please try again later.",
                code: "EMAIL_UNAVAILABLE",
            });
        }
        const retryAfterSeconds = resendWaitSeconds(`${clientIp(req)}|password-reset|${email}`);
        if (retryAfterSeconds) {
            res.set("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({
                message: "Too many password reset requests. Please try again later.",
                code: "EMAIL_RATE_LIMITED",
                retryAfterSeconds,
            });
        }

        const user = await User.findOne({ email }).select("+passwordResetTokenHash +passwordResetExpires");
        if (!user) return res.status(202).json(genericResponse);

        const resetToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
        user.passwordResetTokenHash = tokenHash;
        user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();

        const clientUrl = (process.env.CLIENT_URL || "http://localhost:5173").replace(/\/$/, "");
        const resetUrl = `${clientUrl}/reset-password/${resetToken}`;
        try {
            await sendPasswordResetEmail({ email: user.email, name: user.name, resetUrl });
        } catch (error) {
            await User.updateOne(
                { _id: user._id, passwordResetTokenHash: tokenHash },
                { $unset: { passwordResetTokenHash: 1, passwordResetExpires: 1 } }
            );
            console.error(`Password reset email failed (${error.code || "SMTP_ERROR"}).`);
            return res.status(202).json(genericResponse);
        }

        return res.status(202).json(genericResponse);
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
        // Signs out every device: tokens issued before this carry the old number (see middleware/auth.js).
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.passwordResetTokenHash = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        await recordAudit(req, { event: "password_reset", user, details: "Password changed with an emailed reset link. All existing sessions were signed out." });
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

const ADMIN_OTP_TTL_MS = 5 * 60 * 1000;
const ADMIN_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const ADMIN_OTP_MAX_ATTEMPTS = 5;
const ADMIN_OTP_MAX_RESENDS = 3;

const createAdminOtp = () => {
    const code = crypto.randomInt(0, 1000000).toString().padStart(6, "0");
    return {
        code,
        hash: crypto.createHash("sha256").update(code).digest("hex"),
    };
};

const sendAdminOtp = async (user, code) => sendAdminLoginOtpEmail({
    email: user.email,
    name: user.name,
    code,
});

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
        if (!user || !passwordOk || user.role !== role || user.isActive === false) {
            await recordAudit(req, { event: "staff_login", outcome: "failure", reason: "invalid_credentials", role, identifier });
            return res.status(401).json({ message: invalidMessage, code: "INVALID_CREDENTIALS" });
        }

        if (role === "admin") {
            if (!smtpConfigured()) {
                await recordAudit(req, { event: "staff_login", outcome: "failure", reason: "otp_email_unavailable", role, identifier, user });
                return res.status(503).json({
                    message: "Administrator verification email is unavailable. Please try again later.",
                    code: "OTP_EMAIL_UNAVAILABLE",
                });
            }
            if (!resendAllowed(`${clientIp(req)}|admin-login|${identifier}`)) {
                const retryAfterSeconds = RESEND_WINDOW_MS / 1000;
                res.set("Retry-After", String(retryAfterSeconds));
                await recordAudit(req, { event: "staff_login", outcome: "blocked", reason: "admin_otp_rate_limited", role, identifier });
                return res.status(429).json({
                    message: "Too many verification requests. Please try again later.",
                    code: "ADMIN_OTP_RATE_LIMITED",
                    retryAfterSeconds,
                });
            }

            const otp = createAdminOtp();
            const now = new Date();
            const challenge = await AdminLoginChallenge.create({
                userId: user._id,
                tokenVersion: user.tokenVersion || 0,
                codeHash: otp.hash,
                expiresAt: new Date(now.getTime() + ADMIN_OTP_TTL_MS),
                attempts: 0,
                resendCount: 0,
                resendAfter: new Date(now.getTime() + ADMIN_OTP_RESEND_COOLDOWN_MS),
            });
            try {
                await sendAdminOtp(user, otp.code);
            } catch (error) {
                await AdminLoginChallenge.deleteOne({ _id: challenge._id });
                console.error(`Admin login OTP delivery failed (${error.code || "SMTP_ERROR"}).`);
                await recordAudit(req, { event: "staff_login", outcome: "failure", reason: "otp_delivery_failed", role, identifier, user });
                return res.status(503).json({
                    message: "We could not send the administrator verification code. Please try again.",
                    code: "OTP_DELIVERY_FAILED",
                });
            }
            return res.status(202).json({
                requiresOtp: true,
                challengeId: challenge._id,
                expiresInSeconds: ADMIN_OTP_TTL_MS / 1000,
                resendAfterSeconds: ADMIN_OTP_RESEND_COOLDOWN_MS / 1000,
            });
        }

        await recordAudit(req, { event: "staff_login", outcome: "success", role, identifier, user });
        return res.json(authResponse(user));
    } catch (error) {
        return next(error);
    }
};

const verifyAdminLoginOtp = async (req, res, next) => {
    try {
        const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId.trim() : "";
        const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
        const invalidResponse = {
            message: "The verification code is invalid, expired, or has reached its attempt limit.",
            code: "ADMIN_OTP_INVALID",
        };
        if (!/^[a-f\d]{24}$/i.test(challengeId) || !/^\d{6}$/.test(code)) {
            return res.status(400).json(invalidResponse);
        }

        const challenge = await AdminLoginChallenge.findOne({
            _id: challengeId,
            expiresAt: { $gt: new Date() },
        }).select("+codeHash +attempts");
        if (
            !challenge ||
            !/^[a-f\d]{64}$/i.test(challenge.codeHash || "") ||
            challenge.attempts >= ADMIN_OTP_MAX_ATTEMPTS
        ) {
            return res.status(400).json(invalidResponse);
        }

        const user = await User.findOne({
            _id: challenge.userId,
            role: "admin",
            isActive: { $ne: false },
        });
        if (!user || (user.tokenVersion || 0) !== challenge.tokenVersion) {
            await AdminLoginChallenge.deleteOne({ _id: challenge._id });
            return res.status(400).json(invalidResponse);
        }

        const codeHash = crypto.createHash("sha256").update(code).digest("hex");
        const sameCode = crypto.timingSafeEqual(Buffer.from(codeHash, "hex"), Buffer.from(challenge.codeHash, "hex"));
        const claim = {
            _id: challenge._id,
            codeHash: challenge.codeHash,
            expiresAt: { $gt: new Date() },
            attempts: { $lt: ADMIN_OTP_MAX_ATTEMPTS },
        };
        if (!sameCode) {
            await AdminLoginChallenge.updateOne(claim, { $inc: { attempts: 1 } });
            await recordAudit(req, {
                event: "staff_login",
                outcome: "failure",
                reason: "otp_invalid",
                role: "admin",
                identifier: user.email,
                user,
            });
            return res.status(400).json(invalidResponse);
        }

        const consumed = await AdminLoginChallenge.findOneAndDelete(claim);
        if (!consumed) return res.status(400).json(invalidResponse);

        const currentUser = await User.findOne({
            _id: user._id,
            role: "admin",
            isActive: { $ne: false },
        });
        if (!currentUser || (currentUser.tokenVersion || 0) !== challenge.tokenVersion) {
            return res.status(400).json(invalidResponse);
        }
        await recordAudit(req, {
            event: "staff_login",
            outcome: "success",
            role: "admin",
            identifier: currentUser.email,
            user: currentUser,
        });
        return res.json(authResponse(currentUser));
    } catch (error) {
        return next(error);
    }
};

const resendAdminLoginOtp = async (req, res, next) => {
    try {
        const challengeId = typeof req.body?.challengeId === "string" ? req.body.challengeId.trim() : "";
        const invalidResponse = {
            message: "The verification request is invalid or has expired.",
            code: "ADMIN_OTP_INVALID",
        };
        if (!/^[a-f\d]{24}$/i.test(challengeId)) return res.status(400).json(invalidResponse);
        if (!smtpConfigured()) {
            return res.status(503).json({
                message: "Administrator verification email is unavailable. Please try again later.",
                code: "OTP_EMAIL_UNAVAILABLE",
            });
        }
        if (!resendAllowed(`${clientIp(req)}|admin-otp-resend`)) {
            const retryAfterSeconds = RESEND_WINDOW_MS / 1000;
            res.set("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({
                message: "Too many verification requests. Please try again later.",
                code: "ADMIN_OTP_RATE_LIMITED",
                retryAfterSeconds,
            });
        }

        const now = new Date();
        const challenge = await AdminLoginChallenge.findOne({
            _id: challengeId,
            expiresAt: { $gt: now },
        }).select("+resendAfter +resendCount");
        if (!challenge) return res.status(400).json(invalidResponse);
        if (challenge.resendCount >= ADMIN_OTP_MAX_RESENDS) {
            return res.status(429).json({
                message: "The verification code resend limit has been reached. Start a new login attempt.",
                code: "ADMIN_OTP_RESEND_LIMIT",
            });
        }
        if (challenge.resendAfter > now) {
            const retryAfterSeconds = Math.ceil((challenge.resendAfter.getTime() - now.getTime()) / 1000);
            res.set("Retry-After", String(retryAfterSeconds));
            return res.status(429).json({
                message: "Please wait before requesting another verification code.",
                code: "ADMIN_OTP_COOLDOWN",
                retryAfterSeconds,
            });
        }

        const user = await User.findOne({
            _id: challenge.userId,
            role: "admin",
            isActive: { $ne: false },
        });
        if (!user || (user.tokenVersion || 0) !== challenge.tokenVersion) {
            await AdminLoginChallenge.deleteOne({ _id: challenge._id });
            return res.status(400).json(invalidResponse);
        }

        const otp = createAdminOtp();
        const expiresAt = new Date(now.getTime() + ADMIN_OTP_TTL_MS);
        const resendAfter = new Date(now.getTime() + ADMIN_OTP_RESEND_COOLDOWN_MS);
        const refreshed = await AdminLoginChallenge.findOneAndUpdate(
            {
                _id: challenge._id,
                expiresAt: { $gt: now },
                resendAfter: { $lte: now },
                resendCount: { $lt: ADMIN_OTP_MAX_RESENDS },
            },
            {
                $set: {
                    codeHash: otp.hash,
                    expiresAt,
                    resendAfter,
                    attempts: 0,
                },
                $inc: { resendCount: 1 },
            },
            { returnDocument: "after" }
        );
        if (!refreshed) {
            return res.status(429).json({
                message: "Please wait before requesting another verification code.",
                code: "ADMIN_OTP_COOLDOWN",
                retryAfterSeconds: ADMIN_OTP_RESEND_COOLDOWN_MS / 1000,
            });
        }

        try {
            await sendAdminOtp(user, otp.code);
        } catch (error) {
            console.error(`Admin login OTP delivery failed (${error.code || "SMTP_ERROR"}).`);
            return res.status(503).json({
                message: "We could not send the administrator verification code. Please try again.",
                code: "OTP_DELIVERY_FAILED",
            });
        }
        return res.json({
            message: "A new verification code has been sent.",
            expiresInSeconds: ADMIN_OTP_TTL_MS / 1000,
            resendAfterSeconds: ADMIN_OTP_RESEND_COOLDOWN_MS / 1000,
        });
    } catch (error) {
        return next(error);
    }
};

const adminLogin = createStaffLogin("admin", "Invalid Admin ID or Password.");
const managerLogin = createStaffLogin("manager", "Invalid Manager ID or Password.");

module.exports = {
    register, login, getMe, logout, forgotPassword, resetPassword, getCaptcha, adminLogin, managerLogin,
    updateCitizenProfile, logout, forgotPassword, resetPassword, getCaptcha, adminLogin, managerLogin,
    verifyEmailCode, resendVerification, verifyAdminLoginOtp, resendAdminLoginOtp,
};
