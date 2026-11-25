const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const {
    createGrievance,
    listGrievances,
    getGrievance,
    getGrievanceHistory,
    updateGrievanceStatus,
<<<<<<< HEAD
=======
    assignDepartment,
    updateGrievancePriority,
>>>>>>> main
} = require("../controller/grievance.controller");

const router = express.Router();

router.post("/", authenticate, requireRole("citizen", "admin"), createGrievance);
router.get("/", authenticate, listGrievances);
router.get("/:id/history", authenticate, getGrievanceHistory);
router.get("/:id", authenticate, getGrievance);
<<<<<<< HEAD
router.patch("/:id/status", authenticate, requireRole("admin", "officer"), updateGrievanceStatus);
=======
router.patch("/:id/status", authenticate, requireRole("admin", "manager"), updateGrievanceStatus);
router.patch("/:id/assign-department", authenticate, requireRole("admin"), assignDepartment);
router.patch("/:id/priority", authenticate, requireRole("admin", "manager"), updateGrievancePriority);
>>>>>>> main

module.exports = router;
