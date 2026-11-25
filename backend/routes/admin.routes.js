const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const { listUsers, createUser, updateUser } = require("../controller/admin.controller");

const router = express.Router();

router.use(authenticate, requireRole("admin"));
router.get("/users", listUsers);
router.post("/users", createUser);
router.patch("/users/:id", updateUser);

module.exports = router;
