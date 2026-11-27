const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const {
    listUsers,
    createUser,
    updateUser,
    listManagers,
    createManager,
    updateManager,
    listAdminDepartments,
    getDashboard,
    listAuditLogs,
} = require("../controller/admin.controller");

const router = express.Router();

router.use(authenticate, requireRole("admin"));
router.get("/dashboard", getDashboard);
router.get("/departments", listAdminDepartments);
router.get("/managers", listManagers);
router.post("/managers", createManager);
router.patch("/managers/:id", updateManager);
router.get("/users", listUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.get("/audit-logs", listAuditLogs);

module.exports = router;
