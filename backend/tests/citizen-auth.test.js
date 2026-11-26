// Checks for citizen sign-in (email OR mobile), staff being refused on /api/auth/login,
// duplicate email/mobile at registration, and email verification.
// Run with:  MONGO_URI=mongodb://127.0.0.1:27017 MONGO_DB_NAME=cms_test JWT_SECRET=test node tests/citizen-auth.test.js
// It WIPES the database it connects to, so it only runs when MONGO_DB_NAME contains "test".
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.MONGO_DB_NAME = process.env.MONGO_DB_NAME || "cms_test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
delete process.env.SMTP_HOST;
delete process.env.REQUIRE_EMAIL_VERIFICATION;
process.env.NODE_ENV = "test";
if (!/test/i.test(process.env.MONGO_DB_NAME)) {
    console.error(`Refusing to run: MONGO_DB_NAME "${process.env.MONGO_DB_NAME}" does not contain "test".`);
    process.exit(1);
}

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const emailService = require("../utils/email");
const sentVerificationCodes = [];
let deliverVerificationCode = async (message) => sentVerificationCodes.push(message);
emailService.sendVerificationEmail = (message) => deliverVerificationCode(message);
const { app } = require("../index");
const { User, Department } = require("../models");
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
const citizenLogin = async (credentials) => {
    const captcha = _createForTests("TEST");
    const captchaFields = { captchaId: captcha.id, captchaAnswer: "TEST" };
    return call("POST", "/api/auth/login", { ...credentials, ...captchaFields });
};
const registration = (overrides = {}) => ({
    name: "New Citizen",
    email: "new@t.in",
    password: "Passw0rd1!",
    mobileNo: "9123456780",
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
    catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

(async () => {
    await connectDB();
    await mongoose.connection.dropDatabase();
    await User.init(); // build the unique indexes before testing duplicates
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;

    const pw = await bcrypt.hash("Passw0rd!", 4);
    const dept = await Department.create({ name: "Water Supply" });
    await User.create([
        { name: "Admin", email: "admin@t.in", password: pw, role: "admin" },
        { name: "Mgr", email: "mgr@t.in", password: pw, role: "manager", departmentId: dept._id },
        { name: "Citizen", email: "c@t.in", mobileNo: "9876543210", password: pw, role: "citizen" },
    ]);

    console.log("Citizen login");
    await check("CAPTCHA endpoint returns a fresh SVG image", async () => {
        const response = await call("GET", "/api/auth/captcha");
        assert.equal(response.status, 200);
        assert.ok(response.body.id);
        assert.match(response.body.image, /^data:image\/svg\+xml;base64,/);
        assert.equal(response.body.expiresInSeconds, 300);
    });
    await check("signs in with email", async () => {
        const r = await citizenLogin({ identifier: "c@t.in", password: "Passw0rd!" });
        assert.equal(r.status, 200);
        assert.equal(r.body.user.role, "citizen");
    });
    await check("signs in with mobile number, with or without +91", async () => {
        for (const id of ["9876543210", "+91 98765 43210"]) {
            const r = await citizenLogin({ identifier: id, password: "Passw0rd!" });
            assert.equal(r.status, 200, id);
        }
    });
    await check("old clients sending { email } still work", async () => {
        assert.equal((await citizenLogin({ email: "c@t.in", password: "Passw0rd!" })).status, 200);
    });
    await check("CAPTCHA is required and each challenge is consumed once", async () => {
        const missing = await call("POST", "/api/auth/login", { identifier: "c@t.in", password: "Passw0rd!" });
        assert.equal(missing.status, 400);
        assert.equal(missing.body.code, "CAPTCHA_INVALID");
        const captcha = _createForTests("TEST");
        const invalid = await call("POST", "/api/auth/login", {
            identifier: "c@t.in",
            password: "Passw0rd!",
            captchaId: captcha.id,
            captchaAnswer: "WRNG",
        });
        assert.equal(invalid.status, 400);
        assert.equal(invalid.body.code, "CAPTCHA_INVALID");
        const reused = await call("POST", "/api/auth/login", {
            identifier: "c@t.in",
            password: "Passw0rd!",
            captchaId: captcha.id,
            captchaAnswer: "TEST",
        });
        assert.equal(reused.status, 400);
        assert.equal(reused.body.code, "CAPTCHA_INVALID");
    });
    await check("admin and manager are refused here with the same answer as a wrong password", async () => {
        const wrong = await citizenLogin({ identifier: "c@t.in", password: "nope-nope" });
        for (const email of ["admin@t.in", "mgr@t.in", "nobody@t.in"]) {
            const r = await citizenLogin({ identifier: email, password: "Passw0rd!" });
            assert.equal(r.status, 401, email);
            assert.deepEqual(r.body, wrong.body, email);
        }
    });

    console.log("Registration duplicates");
    await check("duplicate email and duplicate mobile are rejected with a clear code", async () => {
        const base1 = registration();
        assert.equal((await call("POST", "/api/auth/register", base1)).status, 201);
        const saved = await User.findOne({ email: base1.email });
        assert.equal(saved.termsAccepted, true);
        assert.ok(saved.termsAcceptedAt instanceof Date);
        const dupEmail = await call("POST", "/api/auth/register", { ...base1, mobileNo: "9123456781" });
        assert.equal(dupEmail.status, 409);
        assert.equal(dupEmail.body.code, "EMAIL_EXISTS");
        const dupMobile = await call("POST", "/api/auth/register", { ...base1, email: "other@t.in" });
        assert.equal(dupMobile.status, 409);
        assert.equal(dupMobile.body.code, "MOBILE_EXISTS");
    });
    await check("registration requires citizen contact, address, PIN, and consent fields", async () => {
        const invalidRequests = [
            registration({ name: "A" }),
            registration({ mobileNo: undefined }),
            registration({ address: undefined }),
            registration({ address: { state: "Gujarat", district: "Ahmedabad", cityOrTaluka: "Bavla", line: "Road" } }),
            registration({ termsAccepted: false }),
        ];
        for (const body of invalidRequests) {
            const response = await call("POST", "/api/auth/register", body);
            assert.equal(response.status, 400);
        }
    });
    await check("registration enforces all four password requirements", async () => {
        for (const password of ["Short1!", "Password!", "Password1", "12345678!"]) {
            const response = await call("POST", "/api/auth/register", registration({
                email: `${password.length}${password.replace(/[^A-Za-z]/g, "")}@t.in`,
                mobileNo: `9${String(password.length).padStart(9, "0")}`,
                password,
            }));
            assert.equal(response.status, 400, password);
        }
    });

    console.log("Email verification (REQUIRE_EMAIL_VERIFICATION=true)");
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    sentVerificationCodes.length = 0;
    process.env.SMTP_HOST = "smtp.test";
    process.env.SMTP_USER = "sender@test.invalid";
    process.env.SMTP_PASS = "test-only-password";
    await check("new citizen gets a hashed one-time code and cannot sign in until verified", async () => {
        const r = await call("POST", "/api/auth/register", registration({
            name: "Verified Citizen",
            email: "v@t.in",
            mobileNo: "9000000001",
        }));
        assert.equal(r.status, 201);
        assert.equal(r.body.requiresVerification, true);
        assert.equal(r.body.token, undefined);
        assert.match(sentVerificationCodes[0].code, /^\d{6}$/);
        assert.equal(sentVerificationCodes[0].email, "v@t.in");
        const saved = await User.findOne({ email: "v@t.in" })
            .select("+emailVerificationTokenHash +emailVerificationExpires +emailVerificationAttempts");
        assert.equal(saved.emailVerified, false);
        assert.notEqual(saved.emailVerificationTokenHash, sentVerificationCodes[0].code);
        assert.equal(saved.emailVerificationAttempts, 0);
        const now = Date.now();
        assert.ok(saved.emailVerificationExpires.getTime() > now);
        assert.ok(saved.emailVerificationExpires.getTime() <= now + 10 * 60 * 1000);
        const bad = await citizenLogin({ identifier: "v@t.in", password: "wrong-pass1!" });
        assert.equal(bad.status, 401, "wrong password must not reveal the unverified state");
        const blocked = await citizenLogin({ identifier: "v@t.in", password: "Passw0rd1!" });
        assert.equal(blocked.status, 403);
        assert.equal(blocked.body.code, "EMAIL_NOT_VERIFIED");
    });
    await check("wrong codes count toward the limit and a resent code verifies once", async () => {
        const firstCode = sentVerificationCodes[sentVerificationCodes.length - 1].code;
        const wrongCode = firstCode === "000000" ? "000001" : "000000";
        const wrong = await call("POST", "/api/auth/verify-email", { email: "v@t.in", code: wrongCode });
        assert.equal(wrong.status, 400);
        const afterWrong = await User.findOne({ email: "v@t.in" }).select("+emailVerificationAttempts");
        assert.equal(afterWrong.emailVerificationAttempts, 1);

        assert.equal((await call("POST", "/api/auth/resend-verification", { identifier: "v@t.in" })).status, 200);
        const resentCode = sentVerificationCodes[sentVerificationCodes.length - 1].code;
        if (resentCode !== firstCode) {
            assert.equal((await call("POST", "/api/auth/verify-email", { email: "v@t.in", code: firstCode })).status, 400);
        }
        const verified = await call("POST", "/api/auth/verify-email", { email: "v@t.in", code: resentCode });
        assert.equal(verified.status, 200);
        assert.ok(verified.body.token);
        assert.equal(verified.body.user.role, "citizen");
        assert.equal((await call("POST", "/api/auth/verify-email", { email: "v@t.in", code: resentCode })).status, 400);
        const ok = await citizenLogin({ identifier: "9000000001", password: "Passw0rd1!" });
        assert.equal(ok.status, 200);
    });
    await check("five incorrect codes block further attempts", async () => {
        const r = await call("POST", "/api/auth/register", registration({
            name: "Limited Citizen",
            email: "limited@t.in",
            mobileNo: "9000000002",
        }));
        assert.equal(r.status, 201);
        const correctCode = sentVerificationCodes[sentVerificationCodes.length - 1].code;
        const wrongCode = correctCode === "000000" ? "000001" : "000000";
        for (let attempt = 0; attempt < 5; attempt++) {
            assert.equal((await call("POST", "/api/auth/verify-email", { email: "limited@t.in", code: wrongCode })).status, 400);
        }
        assert.equal((await call("POST", "/api/auth/verify-email", { email: "limited@t.in", code: correctCode })).status, 400);
    });
    await check("SMTP delivery errors are visible and a pending account can request a new code", async () => {
        deliverVerificationCode = async () => { throw Object.assign(new Error("test SMTP failure"), { code: "ETEST" }); };
        const failed = await call("POST", "/api/auth/register", registration({
            name: "Mail Retry",
            email: "retry@t.in",
            mobileNo: "9000000003",
        }));
        assert.equal(failed.status, 503);
        assert.equal(failed.body.code, "EMAIL_DELIVERY_FAILED");
        const pending = await User.findOne({ email: "retry@t.in" });
        assert.equal(pending.emailVerified, false);

        deliverVerificationCode = async (message) => sentVerificationCodes.push(message);
        const resend = await call("POST", "/api/auth/resend-verification", { identifier: "retry@t.in" });
        assert.equal(resend.status, 200);
        const retryCode = sentVerificationCodes[sentVerificationCodes.length - 1].code;
        assert.equal((await call("POST", "/api/auth/verify-email", { email: "retry@t.in", code: retryCode })).status, 200);
    });
    await check("missing SMTP settings fail registration instead of pretending an email was sent", async () => {
        const host = process.env.SMTP_HOST;
        delete process.env.SMTP_HOST;
        const response = await call("POST", "/api/auth/register", registration({
            name: "No SMTP",
            email: "no-smtp@t.in",
            mobileNo: "9000000004",
        }));
        if (host !== undefined) process.env.SMTP_HOST = host;
        assert.equal(response.status, 503);
        assert.equal(response.body.code, "EMAIL_UNAVAILABLE");
        assert.equal(await User.exists({ email: "no-smtp@t.in" }), null);
    });
    await check("legacy verification links already issued continue to work", async () => {
        const token = "t".repeat(64);
        await User.updateOne({ email: "v@t.in" }, {
            emailVerificationTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
            emailVerificationExpires: new Date(Date.now() + 60000),
        });
        assert.equal((await call("POST", `/api/auth/verify-email/${token}`)).status, 200);
        assert.equal((await call("POST", `/api/auth/verify-email/${token}`)).status, 200);
        assert.equal((await call("POST", "/api/auth/verify-email/not-a-real-token")).status, 400);
    });
    await check("resend answers the same for existing and unknown accounts", async () => {
        const a = await call("POST", "/api/auth/resend-verification", { identifier: "v@t.in" });
        const b = await call("POST", "/api/auth/resend-verification", { identifier: "ghost@t.in" });
        assert.equal(a.status, 200);
        assert.deepEqual(a.body, b.body);
    });
    await check("accounts created before verification existed can still sign in", async () => {
        assert.equal((await citizenLogin({ identifier: "c@t.in", password: "Passw0rd!" })).status, 200);
    });
    delete process.env.REQUIRE_EMAIL_VERIFICATION;

    console.log(`\n${passed} checks passed`);
    server.close();
    await mongoose.disconnect();
})().catch(async (e) => { console.error(e); process.exitCode = 1; await mongoose.disconnect(); });
