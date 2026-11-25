const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const {
    listDepartments,
    createDepartment,
    updateDepartment,
} = require("../controller/department.controller");

const router = express.Router();

router.get("/", listDepartments);
router.post("/", authenticate, requireRole("admin"), createDepartment);
router.patch("/:id", authenticate, requireRole("admin"), updateDepartment);

module.exports = router;
