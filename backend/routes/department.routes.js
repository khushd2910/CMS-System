const express = require("express");
const { Department } = require("../models");
const { authenticate, requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res, next) => {
    try {
        const departments = await Department.find({ isActive: true }).sort({ name: 1 });
        return res.json({ departments });
    } catch (error) {
        return next(error);
    }
});

router.post("/", authenticate, requireRole("admin"), async (req, res, next) => {
    try {
        const department = await Department.create(req.body);
        return res.status(201).json({ department });
    } catch (error) {
        return next(error);
    }
});

router.patch("/:id", authenticate, requireRole("admin"), async (req, res, next) => {
    try {
        const department = await Department.findByIdAndUpdate(
            req.params.id,
            { $set: req.body },
            { new: true, runValidators: true }
        );
        if (!department) {
            return res.status(404).json({ message: "Department not found." });
        }
        return res.json({ department });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
