// Admin / manager login: lock-out rules, audit trail and the audit-log endpoint.
//   MONGO_URI=mongodb://127.0.0.1:27017 MONGO_DB_NAME=cms_test node tests/staff-login.test.js
// It WIPES the database it connects to, so it only runs when MONGO_DB_NAME contains "test".
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.MONGO_DB_NAME = process.env.MONGO_DB_NAME || "cms_test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
process.env.TRUST_PROXY = "1"; // lets the tests pretend to be different visitors with X-Forwarded-For
process.env.NODE_ENV = "test";
process.env.SMTP_HOST = "smtp.test";
process.env.SMTP_USER = "test@example.test";
process.env.SMTP_PASS = "test-password";
if (!/test/i.test(process.env.MONGO_DB_NAME)) {
    console.error(`Refusing to run: MONGO_DB_NAME "${process.env.MONGO_DB_NAME}" does not contain "test".`);
    process.exit(1);
}

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// The real CAPTCHA is covered by test:unit. Here the answer "GOOD" always passes so many logins are quick.
const captchaModule = require("../utils/captcha");
captchaModule.verifyCaptcha = (id, answer) => answer === "GOOD";
const otpCodes = new Map();
const emailModule = require("../utils/email");
emailModule.sendAdminLoginOtpEmail = async ({ email, code }) => {
    otpCodes.set(email.toLowerCase(), code);
    return { accepted: [email] };
};
emailModule.sendGrievanceStatusEmail = async () => ({ accepted: [] });

const connectDB = require("../config/db");
const { app } = require("../index");
const { User, Department, Grievance, AuditLog, AdminLoginChallenge } = require("../models");
const { LIMITS, WINDOW_MS } = require("../utils/login-throttle");

let server, base, nextIp = 10;
const newIp = () => `203.0.113.${nextIp++}`; // documentation range, never a real visitor
const call = async (method, path, { token, ip, body } = {}) => {
    const res = await fetch(base + path, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(ip ? { "X-Forwarded-For": ip } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
};
const startAdminLogin = (email, password, { ip, captcha = "GOOD" } = {}) =>
    call("POST", "/api/auth/admin-login", { ip, body: { email, password, captchaId: "x", captchaAnswer: captcha } });
const verifyAdminOtp = (challengeId, code, ip) =>
    call("POST", "/api/auth/admin-login/verify-otp", { ip, body: { challengeId, code } });
const staffLogin = async (role, email, password, { ip, captcha = "GOOD" } = {}) => {
    const response = role === "admin"
        ? await startAdminLogin(email, password, { ip, captcha })
        : await call("POST", `/api/auth/${role}-login`, { ip, body: { email, password, captchaId: "x", captchaAnswer: captcha } });
    if (role !== "admin" || response.status !== 202) return response;
    return verifyAdminOtp(response.body.challengeId, otpCodes.get(email.toLowerCase()), ip);
};
const GOOD = "Passw0rd1!";
const failMany = async (role, email, times, ip) => { for (let i = 0; i < times; i += 1) await staffLogin(role, email, "wrong", { ip }); };
// Pretends every log entry is `minutes` older (plain updates, so it works on any MongoDB-compatible server).
const ageAll = async (minutes) => {
    for (const row of await AuditLog.collection.find({}).toArray()) {
        await AuditLog.collection.updateOne({ _id: row._id }, { $set: { createdAt: new Date(row.createdAt.getTime() - minutes * 60 * 1000) } });
    }
};

let passed = 0;
const check = async (name, fn) => {
    try { await fn(); passed += 1; console.log(`  ok   ${name}`); }
    catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};
const reset = async () => { await AuditLog.deleteMany({}); };

(async () => {
    await connectDB();
    await mongoose.connection.dropDatabase();
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;

    const pw = await bcrypt.hash(GOOD, 4);
    const water = await Department.create({ name: "Water Supply" });
    const admin = await User.create({ name: "Alice Admin", email: "admin@t.in", password: pw, role: "admin" });
    const manager = await User.create({ name: "Mohan Manager", email: "mgr@t.in", password: pw, role: "manager", departmentId: water._id });
    await User.create({ name: "Cathy Citizen", email: "cit@t.in", password: pw, role: "citizen" });

    console.log("Administrator email verification");
    await check("admin login issues a challenge without a session until OTP verification", async () => {
        await reset();
        const ip = newIp();
        const started = await startAdminLogin("admin@t.in", GOOD, { ip });
        assert.equal(started.status, 202);
        assert.equal(started.body.requiresOtp, true);
        assert.equal(started.body.token, undefined);
        const challenge = await AdminLoginChallenge.findById(started.body.challengeId).select("+codeHash");
        assert.ok(challenge);
        assert.notEqual(challenge.codeHash, otpCodes.get("admin@t.in"));

        const verified = await verifyAdminOtp(started.body.challengeId, otpCodes.get("admin@t.in"), ip);
        assert.equal(verified.status, 200);
        assert.ok(verified.body.token);
        assert.equal(verified.body.user.role, "admin");
        assert.equal((await verifyAdminOtp(started.body.challengeId, otpCodes.get("admin@t.in"), ip)).status, 400);
    });
    await check("invalid and expired OTP challenges cannot issue a token", async () => {
        const ip = newIp();
        const started = await startAdminLogin("admin@t.in", GOOD, { ip });
        const correctCode = otpCodes.get("admin@t.in");
        const wrongCode = correctCode === "000000" ? "000001" : "000000";
        assert.equal((await verifyAdminOtp(started.body.challengeId, wrongCode, ip)).status, 400);
        assert.equal((await verifyAdminOtp(started.body.challengeId, correctCode, ip)).status, 200);

        const expiredIp = newIp();
        const expired = await startAdminLogin("admin@t.in", GOOD, { ip: expiredIp });
        await AdminLoginChallenge.updateOne(
            { _id: expired.body.challengeId },
            { $set: { expiresAt: new Date(Date.now() - 1000) } }
        );
        assert.equal((await verifyAdminOtp(expired.body.challengeId, otpCodes.get("admin@t.in"), expiredIp)).status, 400);
    });
    await check("resending an OTP replaces the previous code", async () => {
        const ip = newIp();
        const started = await startAdminLogin("admin@t.in", GOOD, { ip });
        const oldCode = otpCodes.get("admin@t.in");
        await AdminLoginChallenge.updateOne(
            { _id: started.body.challengeId },
            { $set: { resendAfter: new Date(Date.now() - 1000) } }
        );
        const resent = await call("POST", "/api/auth/admin-login/resend-otp", {
            ip,
            body: { challengeId: started.body.challengeId },
        });
        assert.equal(resent.status, 200);
        assert.equal((await verifyAdminOtp(started.body.challengeId, oldCode, ip)).status, 400);
        assert.equal((await verifyAdminOtp(started.body.challengeId, otpCodes.get("admin@t.in"), ip)).status, 200);
    });

    console.log("Audit trail for logins");
    await check("a successful login is recorded with user, role, IP and browser", async () => {
        await reset();
        const ip = newIp();
        const r = await staffLogin("admin", "ADMIN@t.in", GOOD, { ip });
        assert.equal(r.status, 200);
        const row = await AuditLog.findOne({ event: "staff_login", outcome: "success" });
        assert.equal(String(row.userId), String(admin._id));
        assert.equal(row.role, "admin");
        assert.equal(row.identifier, "admin@t.in");
        assert.equal(row.ip, ip, "TRUST_PROXY=1 -> the visitor's IP, not the proxy's");
        assert.ok(row.createdAt);
    });
    await check("failures are recorded with the typed e-mail; wrong role / unknown account look identical", async () => {
        await reset();
        const a = await staffLogin("admin", "mgr@t.in", GOOD, { ip: newIp() });
        const b = await staffLogin("admin", "Ghost@t.in", GOOD, { ip: newIp() });
        const c = await staffLogin("manager", "cit@t.in", GOOD, { ip: newIp() });
        assert.deepEqual([a.status, b.status, c.status], [401, 401, 401]);
        assert.equal(a.body.message, b.body.message);
        const rows = await AuditLog.find({ outcome: "failure" }).sort({ createdAt: 1 });
        assert.deepEqual(rows.map((x) => x.identifier), ["mgr@t.in", "ghost@t.in", "cit@t.in"]);
        assert.ok(rows.every((x) => x.reason === "invalid_credentials" && !x.userId));
    });
    await check("passwords, tokens and CAPTCHA answers never reach the log", async () => {
        await reset();
        await staffLogin("admin", "admin@t.in", "S3cret-Typed-Password!", { ip: newIp() });
        await staffLogin("admin", "admin@t.in", GOOD, { ip: newIp(), captcha: "WRONG-CAPTCHA" });
        const text = JSON.stringify(await AuditLog.find({}).lean());
        assert.ok(!text.includes("S3cret-Typed-Password!"));
        assert.ok(!text.includes(GOOD));
        assert.ok(!text.includes("WRONG-CAPTCHA"));
    });

    console.log("Lock-out: same IP + same account");
    await check("5 wrong passwords lock that IP out of that account, even for the right password", async () => {
        await reset();
        const ip = newIp();
        await failMany("admin", "admin@t.in", LIMITS.pair, ip);
        const r = await staffLogin("admin", "admin@t.in", GOOD, { ip });
        assert.equal(r.status, 429);
        assert.equal(r.body.code, "TOO_MANY_ATTEMPTS");
        const header = Number(r.headers.get("retry-after"));
        assert.ok(header > 880 && header <= 900, `Retry-After should be about 15 minutes, got ${header}`);
        assert.equal(r.body.retryAfterSeconds, header);
    });
    await check("another visitor (another IP) is not affected", async () => {
        const r = await staffLogin("admin", "admin@t.in", GOOD, { ip: newIp() });
        assert.equal(r.status, 200);
    });
    await check("the lock-out is stored in the database, not in memory", async () => {
        await reset();
        const ip = newIp();
        await AuditLog.insertMany(Array.from({ length: LIMITS.pair }, () => ({
            event: "staff_login", outcome: "failure", reason: "invalid_credentials", role: "manager", identifier: "mgr@t.in", ip,
        })));
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip })).status, 429);
    });
    await check("the lock lifts once the failures are older than 15 minutes (and not before)", async () => {
        await reset();
        const ip = newIp();
        await failMany("manager", "mgr@t.in", LIMITS.pair, ip);
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip })).status, 429);
        await ageAll(WINDOW_MS / 60000 - 2); // 13 minutes old: still locked
        const still = await staffLogin("manager", "mgr@t.in", GOOD, { ip });
        assert.equal(still.status, 429);
        assert.ok(still.body.retryAfterSeconds <= 130 && still.body.retryAfterSeconds > 0, `about 2 minutes left, got ${still.body.retryAfterSeconds}`);
        await ageAll(3); // 16 minutes old
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip })).status, 200);
    });
    await check("a successful login clears the count for that IP + account", async () => {
        await reset();
        const ip = newIp();
        await failMany("manager", "mgr@t.in", LIMITS.pair - 1, ip);
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip })).status, 200);
        await failMany("manager", "mgr@t.in", LIMITS.pair - 1, ip);
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip })).status, 200, "4 + success + 4 must not lock");
    });
    await check("admin and manager counters are separate", async () => {
        await reset();
        const ip = newIp();
        await failMany("admin", "admin@t.in", LIMITS.pair, ip);
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip })).status, 200);
    });

    console.log("Lock-out: wrong CAPTCHA");
    await check("wrong CAPTCHAs never lock the ACCOUNT", async () => {
        await reset();
        const ip = newIp();
        for (let i = 0; i < LIMITS.pair + 3; i += 1) {
            const r = await staffLogin("manager", "mgr@t.in", GOOD, { ip, captcha: "NOPE" });
            assert.equal(r.status, 400);
            assert.equal(r.body.code, "CAPTCHA_INVALID");
        }
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip })).status, 200, "same IP, right CAPTCHA + password");
    });
    await check("but one IP cannot try wrong CAPTCHAs without end", async () => {
        await reset();
        const ip = newIp();
        for (let i = 0; i < LIMITS.captcha; i += 1) await staffLogin("manager", "mgr@t.in", GOOD, { ip, captcha: "NOPE" });
        const r = await staffLogin("manager", "mgr@t.in", GOOD, { ip });
        assert.equal(r.status, 429);
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip: newIp() })).status, 200, "other IPs unaffected");
    });

    console.log("Lock-out: guessing spread over many IPs / many accounts");
    await check("many IPs against ONE account: locked for everyone after 20 failures", async () => {
        await reset();
        for (let i = 0; i < LIMITS.account / 4; i += 1) await failMany("admin", "admin@t.in", 4, newIp());
        const r = await staffLogin("admin", "admin@t.in", GOOD, { ip: newIp() });
        assert.equal(r.status, 429);
        assert.ok(Number(r.headers.get("retry-after")) > 0);
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip: newIp() })).status, 200, "other accounts keep working");
    });
    await check("one IP against MANY accounts: blocked after 30 failures", async () => {
        await reset();
        const ip = newIp();
        for (let i = 0; i < Math.ceil(LIMITS.ip / 3); i += 1) await failMany("admin", `user${i}@t.in`, 3, ip);
        assert.equal((await staffLogin("admin", "brand-new@t.in", GOOD, { ip })).status, 429);
        assert.equal((await staffLogin("admin", "admin@t.in", GOOD, { ip: newIp() })).status, 200);
    });

    console.log("Blocked attempts do not flood the log");
    await check("hammering a locked account writes one 'blocked' row per minute", async () => {
        await reset();
        const ip = newIp();
        await failMany("admin", "admin@t.in", LIMITS.pair, ip);
        for (let i = 0; i < 15; i += 1) assert.equal((await staffLogin("admin", "admin@t.in", GOOD, { ip })).status, 429);
        assert.equal(await AuditLog.countDocuments({ outcome: "blocked" }), 1);
        assert.equal(await AuditLog.countDocuments({ outcome: "failure" }), LIMITS.pair, "blocked tries are not counted as failures");
    });

    console.log("Staff actions are logged");
    const adminToken = jwt.sign({ userId: String(admin._id), role: "admin" }, process.env.JWT_SECRET);
    let managerToken = jwt.sign({ userId: String(manager._id), role: "manager" }, process.env.JWT_SECRET);
    await check("grievance assignment, status and priority changes", async () => {
        await reset();
        const g = await Grievance.create({ referenceNumber: "GRV-T-1", title: "Leak", description: "d", category: "Water", citizenId: (await User.findOne({ email: "cit@t.in" }))._id });
        const ip = newIp();
        assert.equal((await call("PATCH", `/api/grievances/${g._id}/assign-department`, { token: adminToken, ip, body: { departmentId: String(water._id) } })).status, 200);
        assert.equal((await call("PATCH", `/api/grievances/${g._id}/status`, { token: managerToken, ip, body: { status: "in_progress" } })).status, 200);
        assert.equal((await call("PATCH", `/api/grievances/${g._id}/priority`, { token: managerToken, ip, body: { priority: "high" } })).status, 200);
        const rows = await AuditLog.find({ targetType: "Grievance" }).sort({ createdAt: 1 });
        assert.deepEqual(rows.map((x) => x.event), ["grievance_assigned", "grievance_status_changed", "grievance_priority_changed"]);
        assert.deepEqual(rows.map((x) => x.role), ["admin", "manager", "manager"]);
        assert.ok(rows.every((x) => x.ip === ip && String(x.targetId) === String(g._id)));
        assert.match(rows[1].details, /GRV-T-1: assigned -> in_progress/);
    });
    await check("refused actions are not logged as done", async () => {
        const before = await AuditLog.countDocuments();
        const g = await Grievance.findOne({ referenceNumber: "GRV-T-1" });
        assert.equal((await call("PATCH", `/api/grievances/${g._id}/status`, { token: managerToken, body: { status: "submitted" } })).status, 400);
        assert.equal(await AuditLog.countDocuments(), before);
    });
    await check("user and department changes by the admin; logout", async () => {
        await reset();
        const created = await call("POST", "/api/admin/users", { token: adminToken, body: { name: "New Mgr", email: "new@t.in", password: "Passw0rd1!", role: "manager", departmentId: String(water._id) } });
        assert.equal(created.status, 201);
        assert.equal((await call("PATCH", `/api/admin/users/${created.body.user.id}`, { token: adminToken, body: { name: "Renamed" } })).status, 200);
        assert.equal((await call("POST", "/api/departments", { token: adminToken, body: { name: "Roads", code: "ROADS" } })).status, 201);
        assert.equal((await call("POST", "/api/auth/logout", { token: managerToken })).status, 200);
        const events = (await AuditLog.find({}).sort({ createdAt: 1 })).map((x) => x.event);
        assert.deepEqual(events, ["user_created", "user_updated", "department_created", "staff_logout"]);
        const text = JSON.stringify(await AuditLog.find({}).lean());
        assert.ok(!text.includes("Passw0rd1!"), "the new user's password is not logged");
    });
    await check("manager password and status changes invalidate existing sessions", async () => {
        const managerTokenBefore = jwt.sign({
            userId: String(manager._id),
            role: "manager",
            tv: manager.tokenVersion || 0,
        }, process.env.JWT_SECRET);
        const changed = await call("PATCH", `/api/admin/managers/${manager._id}`, {
            token: adminToken,
            body: { password: "Changed-Passw0rd2!" },
        });
        assert.equal(changed.status, 200);
        assert.equal((await call("GET", "/api/auth/me", { token: managerTokenBefore })).status, 401);
        assert.equal((await staffLogin("manager", "mgr@t.in", GOOD, { ip: newIp() })).status, 401);
        assert.equal((await staffLogin("manager", "mgr@t.in", "Changed-Passw0rd2!", { ip: newIp() })).status, 200);
        managerToken = jwt.sign({
            userId: String(manager._id),
            role: "manager",
            tv: (await User.findById(manager._id)).tokenVersion,
        }, process.env.JWT_SECRET);
        const activeToken = managerToken;
        assert.equal((await call("PATCH", `/api/admin/managers/${manager._id}`, {
            token: adminToken,
            body: { isActive: false },
        })).status, 200);
        assert.equal((await call("GET", "/api/auth/me", { token: activeToken })).status, 401);
        assert.equal((await call("PATCH", `/api/admin/managers/${manager._id}`, {
            token: adminToken,
            body: { isActive: true },
        })).status, 200);
        assert.equal((await call("GET", "/api/auth/me", { token: activeToken })).status, 401);
        managerToken = jwt.sign({
            userId: String(manager._id),
            role: "manager",
            tv: (await User.findById(manager._id)).tokenVersion,
        }, process.env.JWT_SECRET);
    });
    await check("admin dashboard returns the summary required by the portal", async () => {
        const dashboard = await call("GET", "/api/admin/dashboard", { token: adminToken });
        assert.equal(dashboard.status, 200);
        assert.equal(dashboard.body.overdueThresholdDays, 7);
        assert.equal(typeof dashboard.body.stats.totalGrievances, "number");
        assert.ok(Array.isArray(dashboard.body.departmentSummary));
        assert.ok(Array.isArray(dashboard.body.recentActivity));
        assert.ok(Array.isArray(dashboard.body.escalationAlerts));
    });

    console.log("GET /api/admin/audit-logs");
    await check("admin only", async () => {
        assert.equal((await call("GET", "/api/admin/audit-logs")).status, 401);
        assert.equal((await call("GET", "/api/admin/audit-logs", { token: managerToken })).status, 403);
        assert.equal((await call("GET", "/api/admin/audit-logs", { token: adminToken })).status, 200);
    });
    await check("newest first, with the user's name, paging and filters", async () => {
        await reset();
        const ip = newIp();
        await staffLogin("admin", "admin@t.in", GOOD, { ip });
        await staffLogin("admin", "admin@t.in", "wrong", { ip });
        await staffLogin("manager", "mgr@t.in", "Changed-Passw0rd2!", { ip });
        const all = await call("GET", "/api/admin/audit-logs", { token: adminToken });
        assert.equal(all.body.pagination.total, 3);
        assert.equal(all.body.logs[0].identifier, "mgr@t.in", "newest first");
        assert.equal(all.body.logs[0].userId.name, "Mohan Manager");
        assert.equal(all.body.logs[0].userId.password, undefined);
        const failures = await call("GET", "/api/admin/audit-logs?outcome=failure", { token: adminToken });
        assert.equal(failures.body.logs.length, 1);
        const byEmail = await call("GET", "/api/admin/audit-logs?identifier=MGR", { token: adminToken });
        assert.equal(byEmail.body.logs.length, 1);
        const page = await call("GET", "/api/admin/audit-logs?limit=2&page=2", { token: adminToken });
        assert.equal(page.body.logs.length, 1);
        const today = new Date().toISOString().slice(0, 10);
        assert.equal((await call("GET", `/api/admin/audit-logs?from=${today}&to=${today}`, { token: adminToken })).body.pagination.total, 3);
        assert.equal((await call("GET", "/api/admin/audit-logs?to=2000-01-01", { token: adminToken })).body.pagination.total, 0);
    });
    await check("bad filters give 400, not a crash", async () => {
        for (const q of ["event=nope", "outcome=maybe", "from=yesterday-ish", "userId=not-an-id"]) {
            assert.equal((await call("GET", `/api/admin/audit-logs?${q}`, { token: adminToken })).status, 400, q);
        }
    });

    console.log(`\n${passed} checks passed${process.exitCode ? " - SOME FAILED" : ""}`);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    server.close();
})().catch((e) => { console.error(e); process.exit(1); });
