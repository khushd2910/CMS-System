const bcrypt = require("bcryptjs");
const { User, Department, Grievance, StatusHistory, AuditLog } = require("../models");
const { getPagination, paginationMeta } = require("../utils/pagination");
const { EVENTS, OUTCOMES, recordAudit } = require("../utils/audit");
const { passwordPolicyError } = require("../utils/password");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_NUMBER_PATTERN = /^\+?[0-9][0-9\s().-]{6,19}$/;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const OVERDUE_DAYS = 7;
const OPEN_STATUSES = ["submitted", "under_review", "assigned", "in_progress"];
const safeSearch = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const publicUser = (user) => ({
    id: user._id,
    role: user.role,
    name: user.name,
    email: user.email,
    contactNumber: user.contactNumber,
    isActive: user.isActive !== false,
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
            const escapedSearch = safeSearch(req.query.search);
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

const getDepartmentSummary = async () => {
    const departments = await Department.find({}).sort({ name: 1 }).lean();
    return Promise.all(departments.map(async (department) => {
        const [managerCount, grievanceCount] = await Promise.all([
            User.countDocuments({ role: "manager", departmentId: department._id }),
            Grievance.countDocuments({ departmentId: department._id }),
        ]);
        return { ...department, managerCount, grievanceCount };
    }));
};

const getDashboard = async (req, res, next) => {
    try {
        const overdueBefore = new Date(Date.now() - OVERDUE_DAYS * 24 * 60 * 60 * 1000);
        const [
            totalGrievances,
            pendingGrievances,
            inReviewGrievances,
            inProgressGrievances,
            resolvedGrievances,
            overdueGrievances,
            citizens,
            departments,
            managers,
            departmentSummary,
            recentActivity,
            escalationAlerts,
        ] = await Promise.all([
            Grievance.countDocuments(),
            Grievance.countDocuments({ status: { $in: ["submitted", "assigned"] } }),
            Grievance.countDocuments({ status: "under_review" }),
            Grievance.countDocuments({ status: "in_progress" }),
            Grievance.countDocuments({ status: { $in: ["resolved", "closed"] } }),
            Grievance.countDocuments({ status: { $in: OPEN_STATUSES }, createdAt: { $lt: overdueBefore } }),
            User.countDocuments({ role: "citizen" }),
            Department.countDocuments(),
            User.countDocuments({ role: "manager" }),
            getDepartmentSummary(),
            StatusHistory.find({})
                .populate("grievanceId", "referenceNumber title")
                .populate("changedBy", "name role")
                .sort({ createdAt: -1 })
                .limit(6)
                .lean(),
            Grievance.find({ status: { $in: OPEN_STATUSES }, priority: "urgent" })
                .select("referenceNumber title status createdAt")
                .populate("departmentId", "name")
                .sort({ createdAt: 1 })
                .limit(5)
                .lean(),
        ]);

        return res.json({
            stats: {
                totalGrievances,
                pendingGrievances,
                inReviewGrievances,
                inProgressGrievances,
                resolvedGrievances,
                overdueGrievances,
                citizens,
                departments,
                managers,
                escalationAlerts: await Grievance.countDocuments({
                    status: { $in: OPEN_STATUSES },
                    priority: "urgent",
                }),
            },
            overdueThresholdDays: OVERDUE_DAYS,
            departmentSummary,
            recentActivity,
            escalationAlerts,
        });
    } catch (error) {
        return next(error);
    }
};

const listAdminDepartments = async (req, res, next) => {
    try {
        const filter = {};
        if (typeof req.query.search === "string" && req.query.search.trim()) {
            const expression = new RegExp(safeSearch(req.query.search.trim()), "i");
            filter.$or = [{ name: expression }, { code: expression }];
        }
        if (req.query.active === "true") filter.isActive = true;
        if (req.query.active === "false") filter.isActive = false;

        const pagination = getPagination(req.query);
        const [total, departments] = await Promise.all([
            Department.countDocuments(filter),
            Department.find(filter)
                .sort({ name: 1 })
                .skip(pagination.skip)
                .limit(pagination.limit)
                .lean(),
        ]);
        const withCounts = await Promise.all(departments.map(async (department) => {
            const [managerCount, grievanceCount] = await Promise.all([
                User.countDocuments({ role: "manager", departmentId: department._id }),
                Grievance.countDocuments({ departmentId: department._id }),
            ]);
            return { ...department, managerCount, grievanceCount };
        }));
        return res.json({
            departments: withCounts,
            pagination: paginationMeta(pagination, total),
        });
    } catch (error) {
        return next(error);
    }
};

const listManagers = async (req, res, next) => {
    try {
        const filter = { role: "manager" };
        if (typeof req.query.search === "string" && req.query.search.trim()) {
            const expression = new RegExp(safeSearch(req.query.search.trim()), "i");
            filter.$or = [{ name: expression }, { email: expression }];
        }
        if (typeof req.query.departmentId === "string" && req.query.departmentId) {
            if (!OBJECT_ID_PATTERN.test(req.query.departmentId)) {
                return res.status(400).json({ message: "Invalid department ID." });
            }
            filter.departmentId = req.query.departmentId;
        }
        if (req.query.active === "true") filter.isActive = { $ne: false };
        if (req.query.active === "false") filter.isActive = false;

        const pagination = getPagination(req.query);
        const [total, managers] = await Promise.all([
            User.countDocuments(filter),
            User.find(filter)
                .select("-password")
                .populate("departmentId", "name code isActive")
                .sort({ createdAt: -1 })
                .skip(pagination.skip)
                .limit(pagination.limit),
        ]);
        return res.json({
            managers: managers.map(publicUser),
            pagination: paginationMeta(pagination, total),
        });
    } catch (error) {
        return next(error);
    }
};

const createUser = async (req, res, next) => {
    try {
        const { name, email, password, role, departmentId, contactNumber } = req.body || {};
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
        if (contactNumber && !CONTACT_NUMBER_PATTERN.test(contactNumber.trim())) {
            return res.status(400).json({ message: "Enter a valid work contact number." });
        }

        const user = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 12),
            role,
            contactNumber: typeof contactNumber === "string" && contactNumber.trim() ? contactNumber.trim() : undefined,
            isActive: true,
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
        let invalidateSessions = false;
        if (updates.role !== undefined) {
            if (!["citizen", "manager", "admin"].includes(updates.role)) {
                return res.status(400).json({ message: "Invalid user role." });
            }
            if (user.role !== updates.role) invalidateSessions = true;
            user.role = updates.role;
        }
        if (updates.name !== undefined) user.name = updates.name;
        if (updates.contactNumber !== undefined) {
            if (typeof updates.contactNumber !== "string" && updates.contactNumber !== null) {
                return res.status(400).json({ message: "Work contact number must be text." });
            }
            const contactNumber = typeof updates.contactNumber === "string" ? updates.contactNumber.trim() : "";
            if (contactNumber && !CONTACT_NUMBER_PATTERN.test(contactNumber)) {
                return res.status(400).json({ message: "Enter a valid work contact number." });
            }
            user.contactNumber = contactNumber || undefined;
        }
        if (updates.isActive !== undefined) {
            if (typeof updates.isActive !== "boolean") {
                return res.status(400).json({ message: "Account status must be active or inactive." });
            }
            if ((user.isActive !== false) !== updates.isActive) invalidateSessions = true;
            user.isActive = updates.isActive;
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
        if (invalidateSessions) user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
        // Field NAMES only: values (and passwords) never go into the log.
        const changed = ["role", "name", "contactNumber", "isActive", "departmentId"].filter((field) => updates[field] !== undefined);
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

const createManager = async (req, res, next) => {
    try {
        const { name, email, password, departmentId, contactNumber, isActive } = req.body || {};
        const normalizedName = typeof name === "string" ? name.trim() : "";
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (normalizedName.length < 2 || !EMAIL_PATTERN.test(normalizedEmail) || typeof password !== "string") {
            return res.status(400).json({ message: "A valid name, email, and password are required." });
        }
        const passwordError = passwordPolicyError(password);
        if (passwordError) return res.status(400).json({ message: passwordError });
        if (!OBJECT_ID_PATTERN.test(String(departmentId || "")) ||
            !(await Department.exists({ _id: departmentId, isActive: true }))) {
            return res.status(400).json({ message: "Select an active department." });
        }
        if (contactNumber && (typeof contactNumber !== "string" || !CONTACT_NUMBER_PATTERN.test(contactNumber.trim()))) {
            return res.status(400).json({ message: "Enter a valid work contact number." });
        }
        if (isActive !== undefined && typeof isActive !== "boolean") {
            return res.status(400).json({ message: "Account status must be active or inactive." });
        }
        if (await User.exists({ email: normalizedEmail })) {
            return res.status(409).json({ message: "An account with this email already exists.", code: "EMAIL_EXISTS" });
        }

        const manager = await User.create({
            name: normalizedName,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 12),
            role: "manager",
            departmentId,
            contactNumber: contactNumber?.trim() || undefined,
            isActive: isActive !== false,
        });
        await recordAudit(req, {
            event: "user_created",
            targetType: "User",
            targetId: manager._id,
            details: `Created manager account ${manager.email}`,
        });
        await manager.populate("departmentId", "name code isActive");
        return res.status(201).json({ manager: publicUser(manager) });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "An account with this email already exists.", code: "EMAIL_EXISTS" });
        }
        return next(error);
    }
};

const updateManager = async (req, res, next) => {
    try {
        const manager = await User.findOne({ _id: req.params.id, role: "manager" });
        if (!manager) return res.status(404).json({ message: "Department manager not found." });
        const updates = req.body || {};
        let invalidateSessions = false;
        const allowed = ["name", "email", "contactNumber", "departmentId", "isActive", "password"];
        if (!allowed.some((field) => updates[field] !== undefined)) {
            return res.status(400).json({ message: "Provide at least one manager field to update." });
        }

        if (updates.name !== undefined) {
            if (typeof updates.name !== "string" || updates.name.trim().length < 2) {
                return res.status(400).json({ message: "Manager name must be at least 2 characters." });
            }
            manager.name = updates.name.trim();
        }
        if (updates.email !== undefined) {
            if (typeof updates.email !== "string" || !EMAIL_PATTERN.test(updates.email.trim())) {
                return res.status(400).json({ message: "Enter a valid manager email address." });
            }
            const normalizedEmail = updates.email.trim().toLowerCase();
            if (await User.exists({ email: normalizedEmail, _id: { $ne: manager._id } })) {
                return res.status(409).json({ message: "An account with this email already exists.", code: "EMAIL_EXISTS" });
            }
            manager.email = normalizedEmail;
        }
        if (updates.contactNumber !== undefined) {
            if (typeof updates.contactNumber !== "string" && updates.contactNumber !== null) {
                return res.status(400).json({ message: "Work contact number must be text." });
            }
            const contactNumber = typeof updates.contactNumber === "string" ? updates.contactNumber.trim() : "";
            if (contactNumber && !CONTACT_NUMBER_PATTERN.test(contactNumber)) {
                return res.status(400).json({ message: "Enter a valid work contact number." });
            }
            manager.contactNumber = contactNumber || undefined;
        }
        if (updates.departmentId !== undefined) {
            const requestedDepartmentId = String(updates.departmentId);
            // Only a CHANGE of department must point to an active one. Keeping the manager in the
            // department they already have is always allowed, even if that department was deactivated
            // later, so the admin can still fix a name, phone number or password.
            const isUnchanged = String(manager.departmentId || "") === requestedDepartmentId;
            if (!isUnchanged) {
                if (
                    !OBJECT_ID_PATTERN.test(requestedDepartmentId) ||
                    !(await Department.exists({ _id: requestedDepartmentId, isActive: true }))
                ) {
                    return res.status(400).json({ message: "Select an active department." });
                }
                manager.departmentId = requestedDepartmentId;
            }
        }
        if (updates.isActive !== undefined) {
            if (typeof updates.isActive !== "boolean") {
                return res.status(400).json({ message: "Account status must be active or inactive." });
            }
            if ((manager.isActive !== false) !== updates.isActive) invalidateSessions = true;
            manager.isActive = updates.isActive;
        }
        if (updates.password !== undefined) {
            if (typeof updates.password !== "string") {
                return res.status(400).json({ message: "Password must be text." });
            }
            const passwordError = passwordPolicyError(updates.password);
            if (passwordError) return res.status(400).json({ message: passwordError });
            manager.password = await bcrypt.hash(updates.password, 12);
            invalidateSessions = true;
        }

        if (invalidateSessions) manager.tokenVersion = (manager.tokenVersion || 0) + 1;
        await manager.save();
        await manager.populate("departmentId", "name code isActive");
        const changed = allowed.filter((field) => updates[field] !== undefined);
        await recordAudit(req, {
            event: "user_updated",
            targetType: "User",
            targetId: manager._id,
            details: `Updated manager ${manager.email}: ${changed.join(", ")}`,
        });
        return res.json({ manager: publicUser(manager) });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ message: "An account with this email already exists.", code: "EMAIL_EXISTS" });
        }
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

module.exports = {
    listUsers,
    createUser,
    updateUser,
    listManagers,
    createManager,
    updateManager,
    listAdminDepartments,
    getDashboard,
    listAuditLogs,
};
