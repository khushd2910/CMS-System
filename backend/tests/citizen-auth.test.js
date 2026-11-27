// Checks email-only citizen sign-in and that a citizen User is created only after email verification.
// Run with: MONGO_URI=mongodb://127.0.0.1:27017 MONGO_DB_NAME=cms_test JWT_SECRET=test node tests/citizen-auth.test.js
// It WIPES the database it connects to, so it only runs when MONGO_DB_NAME contains "test".
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.MONGO_DB_NAME = process.env.MONGO_DB_NAME || "cms_test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
process.env.NODE_ENV = "test";
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_USER = "sender@test.invalid";
process.env.SMTP_PASS = "test-only-password";
if (!/test/i.test(process.env.MONGO_DB_NAME)) {
    console.error(`Refusing to run: MONGO_DB_NAME "${process.env.MONGO_DB_NAME}" does not contain "test".`);
    process.exit(1);
}

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const emailService = require("../utils/email");
const sentVerificationCodes = [];
let deliverVerificationCode = async (message) => sentVerificationCodes.push(message);
emailService.sendVerificationEmail = (message) => deliverVerificationCode(message);
const { app } = require("../index");
const { User, PendingRegistration, Department } = require("../models");
const { _createForTests } = require("../utils/captcha");

let server, base;
const call = async (method, path, body) => {
    const res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const citizenLogin = (credentials) => {
    const captcha = _createForTests("TEST");
    return call("POST", "/api/auth/login", {
        ...credentials,
        captchaId: captcha.id,
        captchaAnswer: "TEST",
    });
};
const registration = (overrides = {}) => ({
    name: "New Citizen",
    email: "new@t.in",
    password: "Passw0rd1!",
    address: {
        state: "Gujarat",
        district: "Ahmedabad",
        cityOrTaluka: "Bavla",
        line: "10 Main Road",
        pinCode: "380001",
    },
    termsAccepted: true,
    ...overrides,
});
let passed = 0;
const check = async (name, fn) => {
    try { await fn(); passed++; console.log(`  ok   ${name}`); }
    catch (error) { console.log(`  FAIL ${name}\n       ${error.message}`); process.exitCode = 1; }
};

(async () => {
    await connectDB();
    await mongoose.connection.dropDatabase();
    await User.init();
    await PendingRegistration.init();
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;

    const passwordHash = await bcrypt.hash("Passw0rd!", 4);
    const department = await Department.create({ name: "Water Supply" });
    await User.create([
        { name: "Admin", email: "admin@t.in", password: passwordHash, role: "admin" },
        { name: "Manager", email: "manager@t.in", password: passwordHash, role: "manager", departmentId: department._id },
        { name: "Citizen", email: "citizen@t.in", password: passwordHash, role: "citizen" },
    ]);

    await check("citizen sign-in accepts email and rejects mobile-number identifiers", async () => {
        const signedIn = await citizenLogin({ identifier: "citizen@t.in", password: "Passw0rd!" });
        assert.equal(signedIn.status, 200);
        assert.equal(signedIn.body.user.role, "citizen");
        const mobileIdentifier = await citizenLogin({ identifier: "9876543210", password: "Passw0rd!" });
        assert.equal(mobileIdentifier.status, 401);
    });
    await check("staff accounts are refused on the citizen login endpoint", async () => {
        const wrong = await citizenLogin({ identifier: "citizen@t.in", password: "incorrect" });
        for (const email of ["admin@t.in", "manager@t.in", "unknown@t.in"]) {
            const response = await citizenLogin({ identifier: email, password: "Passw0rd!" });
            assert.equal(response.status, 401);
            assert.deepEqual(response.body, wrong.body);
        }
    });
    await check("registration validates email, address, consent, and password", async () => {
        for (const body of [
            registration({ name: "A", email: "short-name@t.in" }),
            registration({ email: "bad-email" }),
            registration({ address: undefined }),
            registration({ address: { state: "Gujarat", district: "Ahmedabad", cityOrTaluka: "Bavla", line: "Road" } }),
            registration({ termsAccepted: false }),
            registration({ password: "weak" }),
        ]) {
            assert.equal((await call("POST", "/api/auth/register", body)).status, 400);
        }
    });
    await check("registration stores only a pending record before a valid email code", async () => {
        sentVerificationCodes.length = 0;
        const response = await call("POST", "/api/auth/register", registration({
            name: "Verified Citizen",
            email: "verified@t.in",
            mobileNo: "9876543210",
        }));
        assert.equal(response.status, 202);
        assert.equal(response.body.requiresVerification, true);
        assert.equal(response.body.token, undefined);
        assert.equal(await User.exists({ email: "verified@t.in" }), null);
        const repeated = await call("POST", "/api/auth/register", registration({
            name: "Changed Details",
            email: "verified@t.in",
            password: "ChangedPass2!",
        }));
        assert.equal(repeated.status, 202);
        assert.equal(await User.exists({ email: "verified@t.in" }), null);

        const pending = await PendingRegistration.findOne({ email: "verified@t.in" })
            .select("+password +verificationCodeHash +verificationExpires +verificationAttempts");
        assert.ok(pending);
        assert.equal(pending.name, "Verified Citizen");
        assert.equal(await bcrypt.compare("Passw0rd1!", pending.password), true);
        assert.equal(await bcrypt.compare("ChangedPass2!", pending.password), false);
        assert.equal(pending.mobileNo, undefined);
        assert.equal(pending.termsAccepted, true);
        assert.ok(pending.termsAcceptedAt instanceof Date);
        assert.match(sentVerificationCodes[0].code, /^\d{6}$/);
        assert.notEqual(pending.verificationCodeHash, sentVerificationCodes[0].code);

        const invalidPassword = await citizenLogin({ identifier: "verified@t.in", password: "wrong" });
        assert.equal(invalidPassword.status, 401);
        const pendingLogin = await citizenLogin({ identifier: "verified@t.in", password: "Passw0rd1!" });
        assert.equal(pendingLogin.status, 403);
        assert.equal(pendingLogin.body.code, "EMAIL_NOT_VERIFIED");
    });
    await check("email code verification creates the account and returns a session", async () => {
        const issuedCode = sentVerificationCodes[sentVerificationCodes.length - 1].code;
        const wrongCode = issuedCode === "000000" ? "000001" : "000000";
        for (let attempt = 0; attempt < 5; attempt++) {
            const invalid = await call("POST", "/api/auth/verify-email", {
                email: "verified@t.in",
                code: wrongCode,
            });
            assert.equal(invalid.status, 400);
        }
        const pending = await PendingRegistration.findOne({ email: "verified@t.in" })
            .select("+verificationAttempts");
        assert.equal(pending.verificationAttempts, 5);
        assert.equal(await User.exists({ email: "verified@t.in" }), null);

        const blocked = await call("POST", "/api/auth/verify-email", {
            email: "verified@t.in",
            code: issuedCode,
        });
        assert.equal(blocked.status, 400);
        assert.equal((await call("POST", "/api/auth/resend-verification", {
            identifier: "verified@t.in",
        })).status, 200);
        const resentCode = sentVerificationCodes[sentVerificationCodes.length - 1].code;
        const verified = await call("POST", "/api/auth/verify-email", {
            email: "verified@t.in",
            code: resentCode,
        });
        assert.equal(verified.status, 200);
        assert.ok(verified.body.token);
        assert.equal(verified.body.user.email, "verified@t.in");
        assert.equal(verified.body.user.mobileNo, undefined);
        assert.equal(await PendingRegistration.exists({ email: "verified@t.in" }), null);
        const user = await User.findOne({ email: "verified@t.in" });
        assert.equal(user.emailVerified, true);
        assert.equal(user.mobileNo, undefined);
        assert.equal((await citizenLogin({ identifier: "verified@t.in", password: "Passw0rd1!" })).status, 200);
    });
    await check("duplicate verified emails are rejected", async () => {
        const response = await call("POST", "/api/auth/register", registration({ email: "citizen@t.in" }));
        assert.equal(response.status, 409);
        assert.equal(response.body.code, "EMAIL_EXISTS");
    });
    await check("email delivery failure leaves no User account and pending registration can be resent", async () => {
        deliverVerificationCode = async () => {
            throw Object.assign(new Error("test SMTP failure"), { code: "ETEST" });
        };
        const failed = await call("POST", "/api/auth/register", registration({ email: "retry@t.in" }));
        assert.equal(failed.status, 503);
        assert.equal(failed.body.code, "EMAIL_DELIVERY_FAILED");
        assert.equal(await User.exists({ email: "retry@t.in" }), null);
        assert.ok(await PendingRegistration.exists({ email: "retry@t.in" }));

        deliverVerificationCode = async (message) => sentVerificationCodes.push(message);
        assert.equal((await call("POST", "/api/auth/resend-verification", { identifier: "retry@t.in" })).status, 200);
        const code = sentVerificationCodes[sentVerificationCodes.length - 1].code;
        const verified = await call("POST", "/api/auth/verify-email", { email: "retry@t.in", code });
        assert.equal(verified.status, 200);
        assert.ok(await User.exists({ email: "retry@t.in" }));
    });
    await check("missing SMTP settings do not persist a pending registration or a User", async () => {
        delete process.env.SMTP_HOST;
        const response = await call("POST", "/api/auth/register", registration({ email: "no-smtp@t.in" }));
        process.env.SMTP_HOST = "smtp.test";
        assert.equal(response.status, 503);
        assert.equal(response.body.code, "EMAIL_UNAVAILABLE");
        assert.equal(await PendingRegistration.exists({ email: "no-smtp@t.in" }), null);
        assert.equal(await User.exists({ email: "no-smtp@t.in" }), null);
    });
    await check("resend verification says so when the request limit is reached", async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
            assert.equal((await call("POST", "/api/auth/resend-verification", { identifier: "limit@t.in" })).status, 200);
        }
        const limited = await call("POST", "/api/auth/resend-verification", { identifier: "limit@t.in" });
        assert.equal(limited.status, 429);
        assert.equal(limited.body.code, "EMAIL_RATE_LIMITED");
        assert.ok(limited.body.retryAfterSeconds > 0);
    });
    await check("legacy email verification links remain accepted", async () => {
        const crypto = require("node:crypto");
        const token = "t".repeat(64);
        await User.updateOne({ email: "citizen@t.in" }, {
            emailVerificationTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
            emailVerificationExpires: new Date(Date.now() + 60000),
            emailVerified: false,
        });
        assert.equal((await call("POST", `/api/auth/verify-email/${token}`)).status, 200);
    });

    console.log(`\n${passed} checks passed`);
    server.close();
    await mongoose.disconnect();
})().catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    await mongoose.disconnect();
});
