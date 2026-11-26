const bcrypt = require("bcryptjs");
const { User, Department, AuditLog } = require("../models");
const { getPagination, paginationMeta } = require("../utils/pagination");
const { EVENTS, OUTCOMES, recordAudit } = require("../utils/audit");
const { passwordPolicyError } = require("../utils/password");

const publicUser = (user) => ({
    id: user._id,
    role: user.role,
    name: user.name,
    mobileNo: user.mobileNo,
    email: user.email,
    departmentId: user.departmentId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
});

const listUsers = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.role) {
            if (!["citizen", "manager", "admin"].includes(req.query.role)) {
                return res.status(400).json({ message: "Invalid user role." });
            }
            filter.role = req.query.role;
        }
        if (req.query.search) {
            const escapedSearch = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { name: { $regex: escapedSearch, $options: "i" } },
                { email: { $regex: escapedSearch, $options: "i" } },
            ];
        }
        const pagination = getPagination(req.query);
        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select("-password")
            .populate("departmentId", "name isActive")
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit);
        return res.json({ users, pagination: paginationMeta(pagination, total) });
    } catch (error) {
        return next(error);
    }
};

const createUser = async (req, res, next) => {
    try {
        const { name, mobileNo, email, password, role, departmentId } = req.body || {};
        const normalizedName = typeof name === "string" ? name.trim() : "";
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (!normalizedName || !normalizedEmail || typeof password !== "string") {
            return res.status(400).json({ message: "name, email, and password are required." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ message: "A valid email address is required." });
        }
        const passwordError = passwordPolicyError(password);
        if (passwordError) {
            return res.status(400).json({ message: passwordError });
        }
        if (!["admin", "manager"].includes(role)) {
            return res.status(400).json({ message: "Admin-created users must have the admin or manager role." });
        }
        if (role === "manager" && (!departmentId || !(await Department.exists({ _id: departmentId, isActive: true })))) {
            return res.status(400).json({ message: "An active department is required for a manager." });
        }

        const user = await User.create({
            name: normalizedName,
            // An empty string would clash with the unique mobile index, so it is stored as "no number".
            mobileNo: typeof mobileNo === "string" && mobileNo.trim() ? mobileNo.trim() : undefined,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 12),
            role,
            departmentId: role === "manager" ? departmentId : undefined,
        });
        await recordAudit(req, {
            event: "user_created",
            targetType: "User",
            targetId: user._id,
            details: `Created ${role} account ${user.email}`,
        });
        return res.status(201).json({ user: publicUser(user) });
    } catch (error) {
        return next(error);
    }
};

const updateUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        const updates = req.body || {};
        if (updates.role !== undefined) {
            if (!["citizen", "manager", "admin"].includes(updates.role)) {
                return res.status(400).json({ message: "Invalid user role." });
            }
            user.role = updates.role;
        }
        if (updates.name !== undefined) user.name = updates.name;
        if (updates.mobileNo !== undefined) {
            user.mobileNo = typeof updates.mobileNo === "string" && updates.mobileNo.trim() ? updates.mobileNo.trim() : undefined;
        }
        if (updates.departmentId !== undefined) {
            if (updates.departmentId && !(await Department.exists({ _id: updates.departmentId, isActive: true }))) {
                return res.status(400).json({ message: "Department is not active or does not exist." });
            }
            user.departmentId = updates.departmentId || undefined;
        }
        if (user.role === "manager" && !user.departmentId) {
            return res.status(400).json({ message: "A manager must be assigned to an active department." });
        }
        if (user.role !== "manager") user.departmentId = undefined;
        await user.save();
        // Field NAMES only: values (and passwords) never go into the log.
        const changed = ["role", "name", "mobileNo", "departmentId"].filter((field) => updates[field] !== undefined);
        await recordAudit(req, {
            event: "user_updated",
            targetType: "User",
            targetId: user._id,
            details: `Updated ${user.email}: ${changed.join(", ") || "no fields"}`,
        });
        return res.json({ user: publicUser(user) });
    } catch (error) {
        return next(error);
    }
};

// GET /api/admin/audit-logs?event=&outcome=&role=&userId=&identifier=&from=&to=&page=&limit=
// Newest first. "from" / "to" are dates (for example 2026-11-01); "identifier" is a partial match.
const listAuditLogs = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.event) {
            if (!EVENTS.includes(req.query.event)) return res.status(400).json({ message: "Invalid audit event." });
            filter.event = req.query.event;
        }
        if (req.query.outcome) {
            if (!OUTCOMES.includes(req.query.outcome)) return res.status(400).json({ message: "Invalid audit outcome." });
            filter.outcome = req.query.outcome;
        }
        if (typeof req.query.role === "string" && req.query.role) filter.role = req.query.role;
        if (typeof req.query.userId === "string" && req.query.userId) filter.userId = req.query.userId;
        if (typeof req.query.identifier === "string" && req.query.identifier) {
            const escaped = req.query.identifier.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.identifier = { $regex: escaped };
        }
        const range = {};
        for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) {
            if (typeof req.query[key] !== "string" || !req.query[key]) continue;
            const date = new Date(req.query[key]);
            if (Number.isNaN(date.getTime())) return res.status(400).json({ message: `"${key}" is not a valid date.` });
            // A bare date for "to" means the whole day.
            if (key === "to" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) date.setUTCHours(23, 59, 59, 999);
            range[operator] = date;
        }
        if (Object.keys(range).length) filter.createdAt = range;

        const pagination = getPagination(req.query);
        const total = await AuditLog.countDocuments(filter);
        const logs = await AuditLog.find(filter)
            .populate("userId", "name email role")
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit);
        return res.json({ logs, pagination: paginationMeta(pagination, total) });
    } catch (error) {
        return next(error);
    }
};

module.exports = { listUsers, createUser, updateUser, listAuditLogs };
