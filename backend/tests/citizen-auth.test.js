// Checks for citizen sign-in (email OR mobile), staff being refused on /api/auth/login,
// duplicate email/mobile at registration, and email verification.
// Run with:  MONGO_URI=mongodb://127.0.0.1:27017 MONGO_DB_NAME=cms_test JWT_SECRET=test node tests/citizen-auth.test.js
// It WIPES the database it connects to, so it only runs when MONGO_DB_NAME contains "test".
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.MONGO_DB_NAME = process.env.MONGO_DB_NAME || "cms_test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
delete process.env.SMTP_HOST;
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
const { app } = require("../index");
const { User, Department } = require("../models");

let server, base;
const call = async (method, path, body) => {
    const res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
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
    await check("signs in with email", async () => {
        const r = await call("POST", "/api/auth/login", { identifier: "c@t.in", password: "Passw0rd!" });
        assert.equal(r.status, 200);
        assert.equal(r.body.user.role, "citizen");
    });
    await check("signs in with mobile number, with or without +91", async () => {
        for (const id of ["9876543210", "+91 98765 43210"]) {
            const r = await call("POST", "/api/auth/login", { identifier: id, password: "Passw0rd!" });
            assert.equal(r.status, 200, id);
        }
    });
    await check("old clients sending { email } still work", async () => {
        assert.equal((await call("POST", "/api/auth/login", { email: "c@t.in", password: "Passw0rd!" })).status, 200);
    });
    await check("admin and manager are refused here with the same answer as a wrong password", async () => {
        const wrong = await call("POST", "/api/auth/login", { identifier: "c@t.in", password: "nope-nope" });
        for (const email of ["admin@t.in", "mgr@t.in", "nobody@t.in"]) {
            const r = await call("POST", "/api/auth/login", { identifier: email, password: "Passw0rd!" });
            assert.equal(r.status, 401, email);
            assert.deepEqual(r.body, wrong.body, email);
        }
    });

    console.log("Registration duplicates");
    await check("duplicate email and duplicate mobile are rejected with a clear code", async () => {
        const base1 = { name: "New", password: "Passw0rd1", email: "new@t.in", mobileNo: "9123456780" };
        assert.equal((await call("POST", "/api/auth/register", base1)).status, 201);
        const dupEmail = await call("POST", "/api/auth/register", { ...base1, mobileNo: "9123456781" });
        assert.equal(dupEmail.status, 409);
        assert.equal(dupEmail.body.code, "EMAIL_EXISTS");
        const dupMobile = await call("POST", "/api/auth/register", { ...base1, email: "other@t.in" });
        assert.equal(dupMobile.status, 409);
        assert.equal(dupMobile.body.code, "MOBILE_EXISTS");
    });

    console.log("Email verification (REQUIRE_EMAIL_VERIFICATION=true)");
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    await check("new citizen gets no token and cannot sign in until verified", async () => {
        const r = await call("POST", "/api/auth/register", { name: "V", password: "Passw0rd1", email: "v@t.in", mobileNo: "9000000001" });
        assert.equal(r.status, 201);
        assert.equal(r.body.requiresVerification, true);
        assert.equal(r.body.token, undefined);
        const bad = await call("POST", "/api/auth/login", { identifier: "v@t.in", password: "wrong-pass1" });
        assert.equal(bad.status, 401, "wrong password must not reveal the unverified state");
        const blocked = await call("POST", "/api/auth/login", { identifier: "v@t.in", password: "Passw0rd1" });
        assert.equal(blocked.status, 403);
        assert.equal(blocked.body.code, "EMAIL_NOT_VERIFIED");
    });
    await check("a valid link verifies the email (and can be opened twice); a bad link fails", async () => {
        const token = "t".repeat(64);
        await User.updateOne({ email: "v@t.in" }, {
            emailVerificationTokenHash: crypto.createHash("sha256").update(token).digest("hex"),
            emailVerificationExpires: new Date(Date.now() + 60000),
        });
        assert.equal((await call("POST", `/api/auth/verify-email/${token}`)).status, 200);
        assert.equal((await call("POST", `/api/auth/verify-email/${token}`)).status, 200);
        assert.equal((await call("POST", "/api/auth/verify-email/not-a-real-token")).status, 400);
        const ok = await call("POST", "/api/auth/login", { identifier: "9000000001", password: "Passw0rd1" });
        assert.equal(ok.status, 200);
    });
    await check("resend answers the same for existing and unknown accounts", async () => {
        const a = await call("POST", "/api/auth/resend-verification", { identifier: "v@t.in" });
        const b = await call("POST", "/api/auth/resend-verification", { identifier: "ghost@t.in" });
        assert.equal(a.status, 200);
        assert.deepEqual(a.body, b.body);
    });
    await check("accounts created before verification existed can still sign in", async () => {
        assert.equal((await call("POST", "/api/auth/login", { identifier: "c@t.in", password: "Passw0rd!" })).status, 200);
    });
    delete process.env.REQUIRE_EMAIL_VERIFICATION;

    console.log(`\n${passed} checks passed`);
    server.close();
    await mongoose.disconnect();
})().catch(async (e) => { console.error(e); process.exitCode = 1; await mongoose.disconnect(); });
