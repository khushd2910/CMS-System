// End-to-end check of roles, department assignment, status rules and priority.
// Run with:  MONGO_URI=mongodb://127.0.0.1:27017 MONGO_DB_NAME=cms_test JWT_SECRET=test node tests/workflow.test.js
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.MONGO_DB_NAME = process.env.MONGO_DB_NAME || "cms_test";
process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
delete process.env.SMTP_HOST; // never send real emails from tests
if (!/test/i.test(process.env.MONGO_DB_NAME)) {
    // The test wipes its database, so refuse to run against anything that is not clearly a test DB.
    console.error(`Refusing to run: MONGO_DB_NAME "${process.env.MONGO_DB_NAME}" does not contain "test".`);
    process.exit(1);
}

const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const emailService = require("../utils/email");
emailService.sendGrievanceStatusEmail = async () => ({ accepted: [] });
const { app } = require("../index");
const { User, Department, Grievance, StatusHistory, Notification } = require("../models");

let server, base;
const call = async (method, path, token, body) => {
    const res = await fetch(base + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
// /api/auth/login is citizen-only now (staff use CAPTCHA-protected endpoints), so staff tokens are signed directly.
const login = async (email) => {
    const user = await User.findOne({ email });
    return jwt.sign({ userId: user._id.toString(), role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

let passed = 0;
const check = async (name, fn) => {
    try { await fn(); passed++; console.log(`  ok   ${name}`); }
    catch (e) { console.log(`  FAIL ${name}\n       ${e.message}`); process.exitCode = 1; }
};

(async () => {
    await connectDB();
    await mongoose.connection.dropDatabase();
    server = app.listen(0);
    base = `http://127.0.0.1:${server.address().port}`;

    const pw = await bcrypt.hash("Passw0rd!", 4);
    const [water, roads] = await Department.create([{ name: "Water Supply" }, { name: "Public Works" }]);
    await User.create([
        { name: "Admin", email: "admin@t.in", password: pw, role: "admin" },
        { name: "Mgr Water", email: "mw@t.in", password: pw, role: "manager", departmentId: water._id },
        { name: "Mgr Roads", email: "mr@t.in", password: pw, role: "manager", departmentId: roads._id },
        { name: "Citizen A", email: "a@t.in", password: pw, role: "citizen" },
        { name: "Citizen B", email: "b@t.in", password: pw, role: "citizen" },
    ]);
    const T = {};
    for (const [k, e] of Object.entries({ admin: "admin@t.in", mw: "mw@t.in", mr: "mr@t.in", a: "a@t.in", b: "b@t.in" })) T[k] = await login(e);

    console.log("Roles");
    await check("officer role no longer exists", async () => {
        await assert.rejects(User.create({ name: "X", email: "o@t.in", password: "x", role: "officer" }), /not a valid enum value|validation/i);
        const r = await call("POST", "/api/admin/users", T.admin, { name: "O", email: "o2@t.in", password: "Passw0rd!", role: "officer" });
        assert.equal(r.status, 400);
    });
    await check("admin can create a manager only with a department", async () => {
        assert.equal((await call("POST", "/api/admin/users", T.admin, { name: "M", email: "m3@t.in", password: "Passw0rd!", role: "manager" })).status, 400);
        const ok = await call("POST", "/api/admin/users", T.admin, { name: "M", email: "m3@t.in", password: "Passw0rd!", role: "manager", departmentId: String(water._id) });
        assert.equal(ok.status, 201);
        assert.equal(ok.body.user.role, "manager");
    });

    console.log("Creating grievances (priority fix)");
    let g1;
    await check("citizen-supplied priority is ignored; department request is only a hint", async () => {
        const r = await call("POST", "/api/grievances", T.a, { title: "Leak", description: "Pipe burst", category: "Water", priority: "urgent", requestedDepartmentId: String(water._id), departmentId: String(water._id) });
        assert.equal(r.status, 201);
        g1 = r.body.grievance;
        assert.equal(g1.priority, "medium");
        assert.equal(g1.status, "submitted");
        assert.equal(g1.departmentId, undefined, "citizen must not set the handling department");
        assert.equal(g1.requestedDepartmentId, String(water._id));
    });
    await check("manager cannot create grievances", async () => {
        assert.equal((await call("POST", "/api/grievances", T.mw, { title: "t", description: "d", category: "c" })).status, 403);
    });
    await check("admin may set priority when creating", async () => {
        const r = await call("POST", "/api/grievances", T.admin, { title: "t", description: "d", category: "c", priority: "high" });
        assert.equal(r.body.grievance.priority, "high");
    });

    console.log("Visibility (problem 2)");
    await check("manager sees nothing before the admin assigns a department", async () => {
        assert.equal((await call("GET", "/api/grievances", T.mw)).body.grievances.length, 0);
        assert.equal((await call("GET", `/api/grievances/${g1._id}`, T.mw)).status, 403);
    });
    await check("citizen sees only own grievances", async () => {
        assert.equal((await call("GET", "/api/grievances", T.b)).body.grievances.length, 0);
        assert.equal((await call("GET", `/api/grievances/${g1._id}`, T.b)).status, 403);
    });

    console.log("Assigning a department");
    await check("only admin can assign", async () => {
        for (const t of [T.a, T.mw]) assert.equal((await call("PATCH", `/api/grievances/${g1._id}/assign-department`, t, { departmentId: String(water._id) })).status, 403);
    });
    await check("unknown / missing department rejected", async () => {
        assert.equal((await call("PATCH", `/api/grievances/${g1._id}/assign-department`, T.admin, {})).status, 400);
        assert.equal((await call("PATCH", `/api/grievances/${g1._id}/assign-department`, T.admin, { departmentId: String(new mongoose.Types.ObjectId()) })).status, 400);
        assert.equal((await call("PATCH", `/api/grievances/${g1._id}/assign-department`, T.admin, { departmentId: "nope" })).status, 400);
    });
    await check("first assignment sets department, status=assigned, optional priority, history, notifications", async () => {
        const r = await call("PATCH", `/api/grievances/${g1._id}/assign-department`, T.admin, { departmentId: String(water._id), priority: "high" });
        assert.equal(r.status, 200);
        assert.equal(r.body.grievance.status, "assigned");
        assert.equal(r.body.grievance.departmentId.name, "Water Supply");
        assert.equal(r.body.grievance.priority, "high");
        const h = await StatusHistory.find({ grievanceId: g1._id });
        assert.equal(h.length, 1);
        assert.equal(h[0].action, "department_assigned");
        assert.equal(h[0].newStatus, "assigned");
        const citizenNotes = await Notification.countDocuments({ grievanceId: g1._id, userId: (await User.findOne({ email: "a@t.in" }))._id });
        const mgrNotes = await Notification.countDocuments({ grievanceId: g1._id, userId: (await User.findOne({ email: "mw@t.in" }))._id });
        assert.equal(citizenNotes, 1);
        assert.equal(mgrNotes, 1);
    });
    await check("assigning the same department again is rejected", async () => {
        assert.equal((await call("PATCH", `/api/grievances/${g1._id}/assign-department`, T.admin, { departmentId: String(water._id), remarks: "x" })).status, 400);
    });
    await check("right manager sees it; other department's manager does not", async () => {
        assert.equal((await call("GET", "/api/grievances", T.mw)).body.grievances.length, 1);
        assert.equal((await call("GET", `/api/grievances/${g1._id}`, T.mw)).status, 200);
        assert.equal((await call("GET", "/api/grievances", T.mr)).body.grievances.length, 0);
        assert.equal((await call("GET", `/api/grievances/${g1._id}`, T.mr)).status, 403);
        assert.equal((await call("GET", `/api/grievances/${g1._id}/history`, T.mr)).status, 403);
    });
    await check("manager cannot widen the list with ?departmentId=", async () => {
        const r = await call("GET", `/api/grievances?departmentId=${roads._id}`, T.mw);
        assert.equal(r.body.grievances.length, 1);
        assert.equal(r.body.grievances[0].departmentId.name, "Water Supply");
        const other = await call("GET", `/api/grievances?departmentId=${water._id}`, T.mr);
        assert.equal(other.body.grievances.length, 0);
    });
    await check("attachments follow the same access rule", async () => {
        assert.equal((await call("GET", `/api/grievances/${g1._id}/attachments`, T.mr)).status, 403);
        assert.equal((await call("GET", `/api/grievances/${g1._id}/attachments`, T.mw)).status, 200);
        assert.equal((await call("GET", `/api/grievances/${g1._id}/attachments`, T.b)).status, 403);
    });

    console.log("Status rules");
    const status = (t, to, remarks) => call("PATCH", `/api/grievances/${g1._id}/status`, t, { status: to, remarks });
    await check("allowedTransitions tells each role what it can do", async () => {
        assert.deepEqual((await call("GET", `/api/grievances/${g1._id}`, T.mw)).body.allowedTransitions, ["in_progress"]);
        assert.deepEqual((await call("GET", `/api/grievances/${g1._id}`, T.admin)).body.allowedTransitions, []);
        assert.deepEqual((await call("GET", `/api/grievances/${g1._id}`, T.a)).body.allowedTransitions, []);
    });
    await check("citizen cannot change status", async () => assert.equal((await status(T.a, "in_progress")).status, 403));
    await check("other department's manager cannot change status", async () => assert.equal((await status(T.mr, "in_progress")).status, 403));
    await check("cannot skip steps (assigned -> resolved / closed)", async () => {
        assert.equal((await status(T.mw, "resolved", "done")).status, 400);
        assert.equal((await status(T.mw, "closed")).status, 400);
    });
    await check("admin cannot do the manager's step", async () => assert.equal((await status(T.admin, "in_progress")).status, 403));
    await check("unknown status rejected", async () => assert.equal((await status(T.mw, "banana")).status, 400));
    await check("manager: assigned -> in_progress", async () => {
        const r = await status(T.mw, "in_progress", "Inspection done");
        assert.equal(r.status, 200);
        assert.equal(r.body.grievance.status, "in_progress");
    });
    await check("resolved needs remarks", async () => {
        assert.equal((await status(T.mw, "resolved")).status, 400);
        assert.equal((await status(T.mw, "resolved", "   ")).status, 400);
    });
    await check("manager resolves; resolvedAt set", async () => {
        const r = await status(T.mw, "resolved", "Pipe replaced");
        assert.equal(r.status, 200);
        assert.ok(r.body.grievance.resolvedAt);
    });
    await check("citizen cannot change priority", async () => {
        assert.equal((await call("PATCH", `/api/grievances/${g1._id}/priority`, T.a, { priority: "low" })).status, 403);
    });
    await check("resolved -> closed keeps resolvedAt (bug fix)", async () => {
        const r = await status(T.admin, "closed");
        assert.equal(r.status, 200);
        assert.ok(r.body.grievance.resolvedAt, "resolvedAt must survive closing");
    });
    await check("closed is final; cannot be reassigned", async () => {
        assert.equal((await status(T.admin, "in_progress")).status, 400);
        assert.equal((await call("PATCH", `/api/grievances/${g1._id}/assign-department`, T.admin, { departmentId: String(roads._id), remarks: "x" })).status, 400);
    });
    await check("history has every step with who did it", async () => {
        const h = (await call("GET", `/api/grievances/${g1._id}/history`, T.mw)).body.history;
        assert.deepEqual(h.map((x) => x.newStatus).reverse(), ["assigned", "in_progress", "resolved", "closed"]);
        assert.ok(h.every((x) => x.changedBy?.role));
    });

    console.log("Admin review, rejection, reassignment, priority");
    let g2;
    await check("admin: submitted -> under_review -> rejected (remarks required)", async () => {
        g2 = (await call("POST", "/api/grievances", T.b, { title: "Noise", description: "d", category: "Other" })).body.grievance;
        const s = (to, r) => call("PATCH", `/api/grievances/${g2._id}/status`, T.admin, { status: to, remarks: r });
        assert.equal((await s("under_review")).status, 200);
        assert.equal((await s("rejected")).status, 400);
        assert.equal((await s("rejected", "Not a government matter")).status, 200);
        assert.equal((await s("under_review")).status, 400);
    });
    await check("reassignment needs remarks, resets to assigned, old manager loses access", async () => {
        const g3 = (await call("POST", "/api/grievances", T.b, { title: "Road", description: "d", category: "Roads" })).body.grievance;
        const assign = (dep, remarks) => call("PATCH", `/api/grievances/${g3._id}/assign-department`, T.admin, { departmentId: String(dep._id), remarks });
        assert.equal((await assign(water)).status, 200);
        assert.equal((await call("PATCH", `/api/grievances/${g3._id}/status`, T.mw, { status: "in_progress" })).status, 200);
        assert.equal((await assign(roads)).status, 400, "remarks required");
        const r = await assign(roads, "Wrong department");
        assert.equal(r.status, 200);
        assert.equal(r.body.grievance.status, "assigned");
        assert.equal((await call("GET", `/api/grievances/${g3._id}`, T.mw)).status, 403);
        assert.equal((await call("GET", `/api/grievances/${g3._id}`, T.mr)).status, 200);
        const last = (await StatusHistory.find({ grievanceId: g3._id }).sort({ createdAt: -1 }))[0];
        assert.match(last.details, /from Water Supply to Public Works/);
    });
    await check("priority: admin and own-department manager can change it, logged in history", async () => {
        const g4 = (await call("POST", "/api/grievances", T.a, { title: "P", description: "d", category: "c" })).body.grievance;
        assert.equal((await call("PATCH", `/api/grievances/${g4._id}/priority`, T.admin, { priority: "urgent" })).status, 200);
        assert.equal((await call("PATCH", `/api/grievances/${g4._id}/priority`, T.admin, { priority: "urgent" })).status, 400);
        assert.equal((await call("PATCH", `/api/grievances/${g4._id}/priority`, T.admin, { priority: "critical" })).status, 400);
        assert.equal((await call("PATCH", `/api/grievances/${g4._id}/priority`, T.mw, { priority: "low" })).status, 403, "not their department yet");
        await call("PATCH", `/api/grievances/${g4._id}/assign-department`, T.admin, { departmentId: String(water._id) });
        assert.equal((await call("PATCH", `/api/grievances/${g4._id}/priority`, T.mw, { priority: "low" })).status, 200);
        const acts = (await StatusHistory.find({ grievanceId: g4._id })).map((h) => h.action).sort();
        assert.deepEqual(acts, ["department_assigned", "priority_changed", "priority_changed"]);
        const g2doc = await call("PATCH", `/api/grievances/${g2._id}/priority`, T.admin, { priority: "low" });
        assert.equal(g2doc.status, 400, "rejected grievance priority is locked");
    });
    await check("manager without a department sees nothing (not everything)", async () => {
        await User.collection.insertOne({ name: "Orphan", email: "orphan@t.in", password: pw, role: "manager", createdAt: new Date(), updatedAt: new Date() });
        const t = await login("orphan@t.in");
        const r = await call("GET", "/api/grievances", t);
        assert.equal(r.status, 200);
        assert.equal(r.body.grievances.length, 0);
    });
    await check("admin sees all and can filter by status/department", async () => {
        const all = (await call("GET", "/api/grievances", T.admin)).body.grievances.length;
        assert.ok(all >= 5);
        const closed = (await call("GET", "/api/grievances?status=closed", T.admin)).body.grievances;
        assert.equal(closed.length, 1);
        assert.equal((await call("GET", "/api/grievances?status=nope", T.admin)).status, 400);
    });

    console.log(`\n${passed} checks passed${process.exitCode ? " - SOME FAILED" : ""}`);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    server.close();
})().catch((e) => { console.error(e); process.exit(1); });
