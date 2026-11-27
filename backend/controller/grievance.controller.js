const { Grievance, StatusHistory, Department, User, Notification } = require("../models");
const { sendGrievanceStatusEmail } = require("../utils/email");
const { recordAudit } = require("../utils/audit");
const { getPagination, paginationMeta } = require("../utils/pagination");
const {
    STATUSES,
    PRIORITIES,
    TRANSITIONS,
    ASSIGNABLE_STATUSES,
    PRIORITY_EDITABLE_STATUSES,
    getId,
    canAccessGrievance,
    getAllowedTransitions,
    remarksRequired,
} = require("../utils/grievance-rules");

const makeReferenceNumber = () =>
    `GRV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

const cleanText = (value) => (typeof value === "string" ? value.trim() : "");

const withRelations = (query) =>
    query
        .populate("citizenId", "name email")
        .populate("departmentId", "name")
        .populate("requestedDepartmentId", "name");

const createGrievance = async (req, res, next) => {
    try {
        const { title, description, category, location, requestedDepartmentId, priority } =
            req.body || {};
        if (!title || !description || !category) {
            return res.status(400).json({ message: "title, description, and category are required." });
        }
        if (
            requestedDepartmentId &&
            !(await Department.exists({ _id: requestedDepartmentId, isActive: true }))
        ) {
            return res.status(400).json({ message: "Selected department is not active or does not exist." });
        }
        const grievance = await Grievance.create({
            referenceNumber: makeReferenceNumber(),
            title,
            description,
            category,
            location,
            requestedDepartmentId,
            // Priority is decided by staff. A citizen's value is ignored (default: medium).
            priority: req.user.role === "admin" ? priority : undefined,
            citizenId: req.user._id,
        });
        return res.status(201).json({ grievance });
    } catch (error) {
        return next(error);
    }
};

const listGrievances = async (req, res, next) => {
    try {
        const pagination = getPagination(req.query);

        // 1. Scope: what this role is allowed to see at all.
        let filter;
        if (req.user.role === "citizen") {
            filter = { citizenId: req.user._id };
        } else if (req.user.role === "manager") {
            if (!req.user.departmentId) {
                // A manager without a department sees nothing (never "everything").
                return res.json({ grievances: [], pagination: paginationMeta(pagination, 0) });
            }
            filter = { departmentId: req.user.departmentId };
        } else {
            filter = {};
        }

        // 2. Optional narrowing filters from the query string.
        if (req.query.status) {
            if (!STATUSES.includes(req.query.status)) {
                return res.status(400).json({ message: "Invalid grievance status filter." });
            }
            filter.status = req.query.status;
        }
        if (req.query.priority) {
            if (!PRIORITIES.includes(req.query.priority)) {
                return res.status(400).json({ message: "Invalid grievance priority filter." });
            }
            filter.priority = req.query.priority;
        }
        if (typeof req.query.category === "string" && req.query.category) {
            filter.category = req.query.category;
        }
        // A manager's department is fixed by the scope above and can never be overridden.
        if (req.user.role !== "manager" && typeof req.query.departmentId === "string" && req.query.departmentId) {
            filter.departmentId = req.query.departmentId;
        }
        if (typeof req.query.search === "string" && req.query.search) {
            const escapedSearch = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$and = [
                {
                    $or: [
                        { referenceNumber: { $regex: escapedSearch, $options: "i" } },
                        { title: { $regex: escapedSearch, $options: "i" } },
                        { description: { $regex: escapedSearch, $options: "i" } },
                    ],
                },
            ];
        }

        const total = await Grievance.countDocuments(filter);
        const grievances = await withRelations(Grievance.find(filter))
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit);
        return res.json({
            grievances,
            pagination: paginationMeta(pagination, total),
        });
    } catch (error) {
        return next(error);
    }
};

const getGrievance = async (req, res, next) => {
    try {
        const grievance = await withRelations(Grievance.findById(req.params.id));
        if (!grievance) {
            return res.status(404).json({ message: "Grievance not found." });
        }
        if (!canAccessGrievance(grievance, req.user)) {
            return res.status(403).json({ message: "You are not authorized to view this grievance." });
        }
        const history = await StatusHistory.find({ grievanceId: grievance._id })
            .populate("changedBy", "name role")
            .sort({ createdAt: -1 });
        return res.json({
            grievance,
            history,
            // The statuses THIS user may move the grievance to right now (drives the UI buttons).
            allowedTransitions: getAllowedTransitions(grievance, req.user),
        });
    } catch (error) {
        return next(error);
    }
};

const getGrievanceHistory = async (req, res, next) => {
    try {
        const grievance = await Grievance.findById(req.params.id);
        if (!grievance) {
            return res.status(404).json({ message: "Grievance not found." });
        }
        if (!canAccessGrievance(grievance, req.user)) {
            return res.status(403).json({ message: "You are not authorized to view this grievance audit." });
        }
        const history = await StatusHistory.find({ grievanceId: grievance._id })
            .populate("changedBy", "name role email")
            .sort({ createdAt: -1 });
        return res.json({
            referenceNumber: grievance.referenceNumber,
            history,
        });
    } catch (error) {
        return next(error);
    }
};

// Tells the citizen (in-app + email) that their grievance changed status.
// `grievance.citizenId` must be populated with name and email.
const notifyCitizen = async (grievance, { oldStatus, newStatus, message, remarks }) => {
    await Notification.create({
        userId: grievance.citizenId._id,
        grievanceId: grievance._id,
        message,
    });
    if (process.env.SMTP_HOST && grievance.citizenId.email) {
        sendGrievanceStatusEmail({
            citizenEmail: grievance.citizenId.email,
            citizenName: grievance.citizenId.name,
            referenceNumber: grievance.referenceNumber,
            oldStatus,
            newStatus,
            remarks,
        }).catch((error) => console.error(`Grievance status email failed: ${error.message}`));
    }
};

const updateGrievanceStatus = async (req, res, next) => {
    try {
        const status = req.body?.status;
        const remarks = cleanText(req.body?.remarks);
        if (!STATUSES.includes(status)) {
            return res.status(400).json({ message: "Invalid grievance status." });
        }
        const grievance = await Grievance.findById(req.params.id).populate("citizenId", "name email");
        if (!grievance) {
            return res.status(404).json({ message: "Grievance not found." });
        }
        // Managers only reach grievances of their own department.
        if (!canAccessGrievance(grievance, req.user)) {
            return res.status(403).json({ message: "You are not authorized to update this grievance." });
        }

        const oldStatus = grievance.status;
        const permittedRoles = TRANSITIONS[oldStatus]?.[status];
        if (!permittedRoles) {
            const options = Object.keys(TRANSITIONS[oldStatus] || {});
            return res.status(400).json({
                message: `A grievance that is ${oldStatus} cannot be changed to ${status}.`,
                allowedStatuses: options,
            });
        }
        if (!permittedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: `Your role cannot change a grievance from ${oldStatus} to ${status}.`,
            });
        }
        if (remarksRequired(oldStatus, status) && !remarks) {
            return res.status(400).json({ message: `Remarks are required to change status to ${status}.` });
        }

        grievance.status = status;
        if (status === "resolved") {
            grievance.resolvedAt = new Date();
        } else if (oldStatus === "resolved" && status === "in_progress") {
            grievance.resolvedAt = undefined; // sent back for more work
        } // resolved -> closed keeps the original resolution date
        await grievance.save();

        await StatusHistory.create({
            grievanceId: grievance._id,
            oldStatus,
            newStatus: status,
            changedBy: req.user._id,
            remarks: remarks || undefined,
            action: "status_changed",
        });
        await recordAudit(req, {
            event: "grievance_status_changed",
            targetType: "Grievance",
            targetId: grievance._id,
            details: `${grievance.referenceNumber}: ${oldStatus} -> ${status}`,
        });
        await notifyCitizen(grievance, {
            oldStatus,
            newStatus: status,
            remarks,
            message: `Your grievance ${grievance.referenceNumber} changed from ${oldStatus} to ${status}.`,
        });
        return res.json({
            grievance,
            allowedTransitions: getAllowedTransitions(grievance, req.user),
        });
    } catch (error) {
        return next(error);
    }
};

// Admin only: send a grievance to a department (or move it to another one).
const assignDepartment = async (req, res, next) => {
    try {
        const departmentId = req.body?.departmentId;
        const remarks = cleanText(req.body?.remarks);
        const priority = req.body?.priority;
        if (!departmentId || typeof departmentId !== "string") {
            return res.status(400).json({ message: "departmentId is required." });
        }
        if (priority !== undefined && !PRIORITIES.includes(priority)) {
            return res.status(400).json({ message: "Invalid grievance priority." });
        }
        const department = await Department.findOne({ _id: departmentId, isActive: true });
        if (!department) {
            return res.status(400).json({ message: "Department is not active or does not exist." });
        }
        const grievance = await Grievance.findById(req.params.id).populate("citizenId", "name email");
        if (!grievance) {
            return res.status(404).json({ message: "Grievance not found." });
        }
        if (!ASSIGNABLE_STATUSES.includes(grievance.status)) {
            return res.status(400).json({
                message: `A grievance that is ${grievance.status} can no longer be assigned to a department.`,
            });
        }

        const isReassignment = Boolean(grievance.departmentId);
        if (isReassignment && getId(grievance.departmentId) === String(department._id)) {
            return res.status(400).json({ message: "Grievance is already assigned to this department." });
        }
        if (isReassignment && !remarks) {
            return res.status(400).json({ message: "Remarks are required to reassign a grievance." });
        }

        const previousDepartment = isReassignment
            ? await Department.findById(grievance.departmentId).select("name")
            : null;
        const oldStatus = grievance.status;
        const oldPriority = grievance.priority;

        grievance.departmentId = department._id;
        grievance.status = "assigned";
        if (priority !== undefined) grievance.priority = priority;
        await grievance.save();

        const details = [
            previousDepartment
                ? `Department changed from ${previousDepartment.name} to ${department.name}`
                : `Assigned to department ${department.name}`,
            priority !== undefined && priority !== oldPriority
                ? `Priority changed from ${oldPriority} to ${priority}`
                : null,
        ]
            .filter(Boolean)
            .join(". ");
        await StatusHistory.create({
            grievanceId: grievance._id,
            oldStatus,
            newStatus: "assigned",
            changedBy: req.user._id,
            remarks: remarks || undefined,
            action: "department_assigned",
            details,
        });
        await recordAudit(req, {
            event: "grievance_assigned",
            targetType: "Grievance",
            targetId: grievance._id,
            details: `${grievance.referenceNumber}: ${details}`,
        });

        await notifyCitizen(grievance, {
            oldStatus,
            newStatus: "assigned",
            remarks,
            message: `Your grievance ${grievance.referenceNumber} has been assigned to the ${department.name} department.`,
        });
        const managers = await User.find({ role: "manager", departmentId: department._id }).select("_id");
        if (managers.length) {
            await Notification.insertMany(
                managers.map((manager) => ({
                    userId: manager._id,
                    grievanceId: grievance._id,
                    message: `Grievance ${grievance.referenceNumber} has been assigned to your department.`,
                }))
            );
        }

        await grievance.populate([
            { path: "departmentId", select: "name" },
            { path: "requestedDepartmentId", select: "name" },
        ]);
        return res.json({ grievance });
    } catch (error) {
        return next(error);
    }
};

// Admin (any grievance) or manager (own department): change priority.
const updateGrievancePriority = async (req, res, next) => {
    try {
        const priority = req.body?.priority;
        const remarks = cleanText(req.body?.remarks);
        if (!PRIORITIES.includes(priority)) {
            return res.status(400).json({ message: "Invalid grievance priority." });
        }
        const grievance = await Grievance.findById(req.params.id);
        if (!grievance) {
            return res.status(404).json({ message: "Grievance not found." });
        }
        if (!canAccessGrievance(grievance, req.user)) {
            return res.status(403).json({ message: "You are not authorized to update this grievance." });
        }
        if (!PRIORITY_EDITABLE_STATUSES.includes(grievance.status)) {
            return res.status(400).json({
                message: `Priority cannot be changed on a ${grievance.status} grievance.`,
            });
        }
        if (grievance.priority === priority) {
            return res.status(400).json({ message: `Priority is already ${priority}.` });
        }

        const oldPriority = grievance.priority;
        grievance.priority = priority;
        await grievance.save();
        await StatusHistory.create({
            grievanceId: grievance._id,
            oldStatus: grievance.status,
            newStatus: grievance.status,
            changedBy: req.user._id,
            remarks: remarks || undefined,
            action: "priority_changed",
            details: `Priority changed from ${oldPriority} to ${priority}`,
        });
        await recordAudit(req, {
            event: "grievance_priority_changed",
            targetType: "Grievance",
            targetId: grievance._id,
            details: `${grievance.referenceNumber}: priority ${oldPriority} -> ${priority}`,
        });
        return res.json({ grievance });
    } catch (error) {
        return next(error);
    }
};

module.exports = {
    createGrievance,
    listGrievances,
    getGrievance,
    getGrievanceHistory,
    updateGrievanceStatus,
    assignDepartment,
    updateGrievancePriority,
};
