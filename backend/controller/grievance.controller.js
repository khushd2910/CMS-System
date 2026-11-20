const { Grievance, StatusHistory, Department, User, Notification } = require("../models");
const { sendGrievanceStatusEmail } = require("../utils/email");
const { getPagination, paginationMeta } = require("../utils/pagination");

const statuses = ["submitted", "under_review", "in_progress", "resolved", "rejected", "closed"];

const makeReferenceNumber = () =>
    `GRV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

const getId = (value) => String(value?._id || value || "");

const canView = (grievance, user) =>
    user.role === "admin" ||
    getId(grievance.citizenId) === String(user._id) ||
    (user.role === "officer" &&
        (getId(grievance.assignedOfficerId) === String(user._id) ||
            getId(grievance.departmentId) === String(user.departmentId)));

const createGrievance = async (req, res, next) => {
    try {
        const { title, description, category, location, departmentId, priority } = req.body || {};
        if (!title || !description || !category) {
            return res.status(400).json({ message: "title, description, and category are required." });
        }
        if (departmentId && !(await Department.exists({ _id: departmentId, isActive: true }))) {
            return res.status(400).json({ message: "Selected department is not active or does not exist." });
        }
        const grievance = await Grievance.create({
            referenceNumber: makeReferenceNumber(),
            title,
            description,
            category,
            location,
            departmentId,
            priority,
            citizenId: req.user._id,
        });
        return res.status(201).json({ grievance });
    } catch (error) {
        return next(error);
    }
};

const listGrievances = async (req, res, next) => {
    try {
        const filter =
            req.user.role === "citizen"
                ? { citizenId: req.user._id }
                : req.user.role === "officer"
                  ? { $or: [{ assignedOfficerId: req.user._id }, { departmentId: req.user.departmentId }] }
                  : {};
        if (req.query.status) {
            if (!statuses.includes(req.query.status)) {
                return res.status(400).json({ message: "Invalid grievance status filter." });
            }
            filter.status = req.query.status;
        }
        if (req.query.priority && ["low", "medium", "high", "urgent"].includes(req.query.priority)) {
            filter.priority = req.query.priority;
        }
        if (req.query.priority && !["low", "medium", "high", "urgent"].includes(req.query.priority)) {
            return res.status(400).json({ message: "Invalid grievance priority filter." });
        }
        if (req.query.category) filter.category = req.query.category;
        if (req.query.departmentId) filter.departmentId = req.query.departmentId;
        if (req.query.search) {
            const escapedSearch = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$and = [
                ...(filter.$and || []),
                {
                    $or: [
                        { referenceNumber: { $regex: escapedSearch, $options: "i" } },
                        { title: { $regex: escapedSearch, $options: "i" } },
                        { description: { $regex: escapedSearch, $options: "i" } },
                    ],
                },
            ];
        }
        const pagination = getPagination(req.query);
        const total = await Grievance.countDocuments(filter);
        const grievances = await Grievance.find(filter)
            .populate("citizenId", "name email mobileNo")
            .populate("departmentId", "name")
            .populate("assignedOfficerId", "name email")
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
        const grievance = await Grievance.findById(req.params.id)
            .populate("citizenId", "name email mobileNo")
            .populate("departmentId", "name")
            .populate("assignedOfficerId", "name email");
        if (!grievance) {
            return res.status(404).json({ message: "Grievance not found." });
        }
        if (!canView(grievance, req.user)) {
            return res.status(403).json({ message: "You are not authorized to view this grievance." });
        }
        const history = await StatusHistory.find({ grievanceId: grievance._id })
            .populate("changedBy", "name role")
            .sort({ createdAt: -1 });
        return res.json({ grievance, history });
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
        if (!canView(grievance, req.user)) {
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

const updateGrievanceStatus = async (req, res, next) => {
    try {
        const { status, remarks, assignedOfficerId } = req.body || {};
        if (!statuses.includes(status)) {
            return res.status(400).json({ message: "Invalid grievance status." });
        }
        if (assignedOfficerId && !(await User.exists({ _id: assignedOfficerId, role: "officer" }))) {
            return res.status(400).json({ message: "Assigned user must be an officer." });
        }
        const grievance = await Grievance.findById(req.params.id).populate("citizenId", "name email");
        if (!grievance) {
            return res.status(404).json({ message: "Grievance not found." });
        }
        if (req.user.role === "officer" && !canView(grievance, req.user)) {
            return res.status(403).json({ message: "You are not authorized to update this grievance." });
        }

        const oldStatus = grievance.status;
        grievance.status = status;
        if (assignedOfficerId) grievance.assignedOfficerId = assignedOfficerId;
        grievance.resolvedAt = status === "resolved" ? new Date() : undefined;
        await grievance.save();
        await StatusHistory.create({
            grievanceId: grievance._id,
            oldStatus,
            newStatus: status,
            changedBy: req.user._id,
            remarks,
        });
        await Notification.create({
            userId: grievance.citizenId._id,
            grievanceId: grievance._id,
            message: `Your grievance ${grievance.referenceNumber} changed from ${oldStatus} to ${status}.`,
        });
        if (process.env.SMTP_HOST && grievance.citizenId.email) {
            sendGrievanceStatusEmail({
                citizenEmail: grievance.citizenId.email,
                citizenName: grievance.citizenId.name,
                referenceNumber: grievance.referenceNumber,
                oldStatus,
                newStatus: status,
                remarks,
            }).catch((error) => console.error(`Grievance status email failed: ${error.message}`));
        }
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
};
