// Password length limit, "password reset signs out old sessions", and "re-running the seed keeps the admin password".
//   MONGO_URI=mongodb://127.0.0.1:27017 MONGO_DB_NAME=cms_test node tests/session-security.test.js
// It WIPES the database it connects to, so it only runs when MONGO_DB_NAME contains "test".
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.MONGO_DB_NAME = process.env.MONGO_DB_NAME || "cms_test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
process.env.NODE_ENV = "test";
process.env.TRUST_PROXY = "1";
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_USER = "test@example.test";
process.env.SMTP_PASS = "test-password";
if (!/test/i.test(process.env.MONGO_DB_NAME)) {
    console.error(`Refusing to run: MONGO_DB_NAME "${process.env.MONGO_DB_NAME}" does not contain "test".`);
    process.exit(1);
}

const assert = require("node:assert/strict");
const crypto = require("crypto");
const path = require("path");
const { spawnSync } = require("child_process");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");

const captchaModule = require("../utils/captcha");
captchaModule.verifyCaptcha = (id, answer) => answer === "GOOD";
const otpCodes = new Map();
const sentPasswordResetEmails = [];
let deliverPasswordResetEmail = async (message) => sentPasswordResetEmails.push(message);
const emailModule = require("../utils/email");
emailModule.sendAdminLoginOtpEmail = async ({ email, code }) => {
    otpCodes.set(email.toLowerCase(), code);
    return { accepted: [email] };
};
emailModule.sendPasswordResetEmail = (message) => deliverPasswordResetEmail(message);

const connectDB = require("../config/db");
const { app } = require("../index");
const { User } = require("../models");
const { passwordPolicyError, MAX_PASSWORD_BYTES } = require("../utils/password");

let server, base;
const call = async (method, p, { token, body } = {}) => {
    const res = await fetch(base + p, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const adminLogin = async (email, password) => {
    const started = await call("POST", "/api/auth/admin-login", {
        body: { email, password, captchaId: "x", captchaAnswer: "GOOD" },
    });
    if (started.status !== 202) return started;
    return call("POST", "/api/auth/admin-login/verify-otp", {
        body: { challengeId: started.body.challengeId, code: otpCodes.get(email.toLowerCase()) },
    });
};

let passed = 0;
const check = async (name, fn) => {
    try { await fn(); passed += 1; console.log(`  ok   ${name}`); }
    catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

const runSeed = (extraEnv) =>
    spawnSync(process.execPath, [path.join(__dirname, "../scripts/seed.js")], {
        env: { ...process.env, ADMIN_EMAIL: "seed-admin@t.in", ADMIN_NAME: "Seed Admin", ...extraEnv },
        encoding: "utf8",
    });

(async () => {
    await connectDB();
    await mongoose.connection.dropDatabase();
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;

    console.log("Password length limit");
    await check("72 bytes is fine, 73 is refused (bytes, not characters)", () => {
        const ok = "Aa1!" + "x".repeat(MAX_PASSWORD_BYTES - 4);
        assert.equal(passwordPolicyError(ok), "");
        assert.match(passwordPolicyError(ok + "x"), /too long/i);
        // 40 emoji are 40 characters but 160 bytes.
        assert.match(passwordPolicyError("Aa1!" + "😀".repeat(40)), /too long/i);
    });
    await check("the API refuses an over-long password when an admin creates a user", async () => {
        await User.create({ name: "A", email: "boss@t.in", role: "admin", password: await bcrypt.hash("Passw0rd1!", 4) });
        const { body: login } = await adminLogin("boss@t.in", "Passw0rd1!");
        const r = await call("POST", "/api/admin/users", {
            token: login.token,
            body: { name: "Long", email: "long@t.in", role: "admin", password: "Aa1!" + "x".repeat(200) },
        });
        assert.equal(r.status, 400);
        assert.match(r.body.message, /too long/i);
    });

    console.log("Password reset signs everyone out");
    await check("forgot-password waits for email delivery and removes tokens when delivery fails", async () => {
        const password = await bcrypt.hash("Passw0rd1!", 4);
        await User.create({ name: "Reset", email: "forgot@t.in", role: "admin", password });

        const originalHost = process.env.SMTP_HOST;
        delete process.env.SMTP_HOST;
        const unavailable = await call("POST", "/api/auth/forgot-password", { body: { email: "forgot@t.in" } });
        const unavailableUnknown = await call("POST", "/api/auth/forgot-password", { body: { email: "unknown@t.in" } });
        process.env.SMTP_HOST = originalHost;
        assert.equal(unavailable.status, 503);
        assert.equal(unavailable.body.code, "EMAIL_UNAVAILABLE");
        assert.deepEqual(unavailableUnknown, unavailable, "missing SMTP configuration must not reveal account existence");
        assert.equal((await User.findOne({ email: "forgot@t.in" }).select("+passwordResetTokenHash")).passwordResetTokenHash, undefined);

        sentPasswordResetEmails.length = 0;
        const sent = await call("POST", "/api/auth/forgot-password", { body: { email: "forgot@t.in" } });
        assert.equal(sent.status, 202);
        assert.equal(sentPasswordResetEmails.length, 1, "the email sender finished before the response");
        assert.match(sentPasswordResetEmails[0].resetUrl, /\/reset-password\/[a-f0-9]{64}$/);
        const unknown = await call("POST", "/api/auth/forgot-password", { body: { email: "unknown@t.in" } });
        assert.deepEqual(unknown, sent, "successful and unknown-address responses must match");

        deliverPasswordResetEmail = async () => {
            throw Object.assign(new Error("test SMTP failure"), { code: "ETEST" });
        };
        const failed = await call("POST", "/api/auth/forgot-password", { body: { email: "forgot@t.in" } });
        assert.equal(failed.status, 202);
        assert.deepEqual(failed.body, sent.body, "delivery failure must not reveal that the address belongs to an account");
        const afterFailure = await User.findOne({ email: "forgot@t.in" })
            .select("+passwordResetTokenHash +passwordResetExpires");
        assert.equal(afterFailure.passwordResetTokenHash, undefined);
        assert.equal(afterFailure.passwordResetExpires, undefined);
        deliverPasswordResetEmail = async (message) => sentPasswordResetEmails.push(message);
    });
    await check("forgot-password preserves its generic response for unknown addresses and throttles requests", async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
            assert.equal((await call("POST", "/api/auth/forgot-password", {
                body: { email: "unknown-reset@t.in" },
            })).status, 202);
        }
        const limited = await call("POST", "/api/auth/forgot-password", {
            body: { email: "unknown-reset@t.in" },
        });
        assert.equal(limited.status, 429);
        assert.equal(limited.body.code, "EMAIL_RATE_LIMITED");
        assert.ok(limited.body.retryAfterSeconds > 0);
    });
    await check("old tokens stop working after a reset; a fresh login works", async () => {
        const oldPw = "Passw0rd1!", newPw = "Brand-New-Pw9!";
        await User.create({ name: "R", email: "reset@t.in", role: "admin", password: await bcrypt.hash(oldPw, 4) });
        const first = (await adminLogin("reset@t.in", oldPw)).body.token;
        const second = (await adminLogin("reset@t.in", oldPw)).body.token; // a second device
        assert.equal((await call("GET", "/api/auth/me", { token: first })).status, 200);
        assert.equal((await call("GET", "/api/auth/me", { token: second })).status, 200);

        // Pretend the e-mailed link was requested: store the hash of a token we know.
        const raw = crypto.randomBytes(16).toString("hex");
        await User.updateOne({ email: "reset@t.in" }, {
            passwordResetTokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
            passwordResetExpires: new Date(Date.now() + 60000),
        });
        assert.equal((await call("POST", `/api/auth/reset-password/${raw}`, { body: { password: newPw } })).status, 200);

        assert.equal((await call("GET", "/api/auth/me", { token: first })).status, 401, "device 1 signed out");
        assert.equal((await call("GET", "/api/auth/me", { token: second })).status, 401, "device 2 signed out");
        assert.equal((await adminLogin("reset@t.in", oldPw)).status, 401, "old password rejected");
        const fresh = await adminLogin("reset@t.in", newPw);
        assert.equal(fresh.status, 200);
        assert.equal((await call("GET", "/api/auth/me", { token: fresh.body.token })).status, 200, "new session works");
    });
    await check("an over-long NEW password is refused on reset too", async () => {
        const raw = crypto.randomBytes(16).toString("hex");
        await User.updateOne({ email: "reset@t.in" }, {
            passwordResetTokenHash: crypto.createHash("sha256").update(raw).digest("hex"),
            passwordResetExpires: new Date(Date.now() + 60000),
        });
        const r = await call("POST", `/api/auth/reset-password/${raw}`, { body: { password: "Aa1!" + "x".repeat(100) } });
        assert.equal(r.status, 400);
    });

    console.log("Seed keeps the admin password");
    await check("first run creates the admin; second run leaves the password alone", async () => {
        const first = runSeed({ ADMIN_PASSWORD: "First-Passw0rd!" });
        assert.equal(first.status, 0, first.stderr + first.stdout);
        const before = await User.findOne({ email: "seed-admin@t.in" }).select("+password");
        assert.ok(await bcrypt.compare("First-Passw0rd!", before.password));

        const second = runSeed({ ADMIN_PASSWORD: "Second-Passw0rd!" });
        assert.equal(second.status, 0, second.stderr + second.stdout);
        assert.match(second.stdout, /left unchanged/);
        const after = await User.findOne({ email: "seed-admin@t.in" }).select("+password");
        assert.equal(after.password, before.password, "hash must be identical");
        assert.equal((await adminLogin("seed-admin@t.in", "First-Passw0rd!")).status, 200);
    });
    await check("RESET_ADMIN_PASSWORD=true changes it on purpose and signs out old sessions", async () => {
        const oldToken = (await adminLogin("seed-admin@t.in", "First-Passw0rd!")).body.token;
        const r = runSeed({ ADMIN_PASSWORD: "Second-Passw0rd!", RESET_ADMIN_PASSWORD: "true" });
        assert.equal(r.status, 0, r.stderr + r.stdout);
        assert.equal((await adminLogin("seed-admin@t.in", "First-Passw0rd!")).status, 401);
        assert.equal((await adminLogin("seed-admin@t.in", "Second-Passw0rd!")).status, 200);
        assert.equal((await call("GET", "/api/auth/me", { token: oldToken })).status, 401);
    });
    await check("the seed never turns a non-admin account into an admin", async () => {
        await User.create({ name: "C", email: "citizen-seed@t.in", role: "citizen", password: await bcrypt.hash("Passw0rd1!", 4) });
        const r = runSeed({ ADMIN_EMAIL: "citizen-seed@t.in", ADMIN_PASSWORD: "Whatever-Pw1!" });
        assert.notEqual(r.status, 0);
        assert.equal((await User.findOne({ email: "citizen-seed@t.in" })).role, "citizen");
    });

    console.log(`\n${passed} checks passed${process.exitCode ? " - SOME FAILED" : ""}`);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    server.close();
})().catch((e) => { console.error(e); process.exit(1); });
