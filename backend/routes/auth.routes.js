const express = require("express");
const { authenticate } = require("../middleware/auth");
const {
    register,
    login,
    getMe,
    logout,
    forgotPassword,
    resetPassword,
    getCaptcha,
    adminLogin,
} = require("../controller/auth.controller");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/captcha", getCaptcha);
router.post("/admin-login", adminLogin);
router.get("/me", authenticate, getMe);
router.post("/logout", authenticate, logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

module.exports = router;
