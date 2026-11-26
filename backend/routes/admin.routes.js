const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { listUsers, createUser, updateUser, listAuditLogs } = require("../controller/admin.controller");

const router = express.Router();

router.use(authenticate, requireRole("admin"));
router.get("/users", listUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);
router.get("/audit-logs", listAuditLogs);

module.exports = router;
