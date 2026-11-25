const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const {
    createGrievance,
    listGrievances,
    getGrievance,
    getGrievanceHistory,
    updateGrievanceStatus,
    assignDepartment,
    updateGrievancePriority,
} = require("../controller/grievance.controller");

const router = express.Router();

router.post("/", authenticate, requireRole("citizen", "admin"), createGrievance);
router.get("/", authenticate, listGrievances);
router.get("/:id/history", authenticate, getGrievanceHistory);
router.get("/:id", authenticate, getGrievance);
router.patch("/:id/status", authenticate, requireRole("admin", "manager"), updateGrievanceStatus);
router.patch("/:id/assign-department", authenticate, requireRole("admin"), assignDepartment);
router.patch("/:id/priority", authenticate, requireRole("admin", "manager"), updateGrievancePriority);

module.exports = router;
