const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const {
    createGrievance,
    listGrievances,
    getGrievance,
    getGrievanceHistory,
    updateGrievanceStatus,
} = require("../controller/grievance.controller");

const router = express.Router();

router.post("/", authenticate, requireRole("citizen", "admin"), createGrievance);
router.get("/", authenticate, listGrievances);
router.get("/:id/history", authenticate, getGrievanceHistory);
router.get("/:id", authenticate, getGrievance);
router.patch("/:id/status", authenticate, requireRole("admin", "officer"), updateGrievanceStatus);

module.exports = router;
