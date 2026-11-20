const express = require("express");
const { authenticate } = require("../middleware/auth");
const { register, login, getMe, logout } = require("../controller/auth.controller");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authenticate, getMe);
router.post("/logout", authenticate, logout);

module.exports = router;
