const express = require("express");
const { Grievance, StatusHistory, Department, User } = require("../models");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();
const statuses = ["submitted", "under_review", "in_progress", "resolved", "rejected", "closed"];

const makeReferenceNumber = () =>
    `GRV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

const canView = (grievance, user) =>
    user.role === "admin" ||
    grievance.citizenId.equals(user._id) ||
    (user.role === "officer" &&
        (grievance.assignedOfficerId?.equals(user._id) ||
            grievance.departmentId?.equals(user.departmentId)));

router.post("/", authenticate, requireRole("citizen", "admin"), async (req, res, next) => {
    try {
        const { title, description, category, location, departmentId, priority } = req.body;
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
});

router.get("/", authenticate, async (req, res, next) => {
    try {
        const filter =
            req.user.role === "citizen"
                ? { citizenId: req.user._id }
                : req.user.role === "officer"
                  ? { $or: [{ assignedOfficerId: req.user._id }, { departmentId: req.user.departmentId }] }
                  : {};
        const grievances = await Grievance.find(filter)
            .populate("citizenId", "name email mobileNo")
            .populate("departmentId", "name")
            .populate("assignedOfficerId", "name email")
            .sort({ createdAt: -1 });
        return res.json({ grievances });
    } catch (error) {
        return next(error);
    }
});

router.get("/:id", authenticate, async (req, res, next) => {
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
});

router.patch(
    "/:id/status",
    authenticate,
    requireRole("admin", "officer"),
    async (req, res, next) => {
        try {
            const { status, remarks, assignedOfficerId } = req.body;
            if (!statuses.includes(status)) {
                return res.status(400).json({ message: "Invalid grievance status." });
            }
            if (assignedOfficerId && !(await User.exists({ _id: assignedOfficerId, role: "officer" }))) {
                return res.status(400).json({ message: "Assigned user must be an officer." });
            }

            const grievance = await Grievance.findById(req.params.id);
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

            return res.json({ grievance });
        } catch (error) {
            return next(error);
        }
    }
);

module.exports = router;
