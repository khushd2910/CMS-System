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
    managerLogin,
    verifyEmailCode,
    resendVerification,
    verifyAdminLoginOtp,
    resendAdminLoginOtp,
} = require("../controller/auth.controller");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.post("/verify-email", verifyEmailCode);
router.post("/resend-verification", resendVerification);
router.get("/captcha", getCaptcha);
router.post("/admin-login", adminLogin);
router.post("/admin-login/verify-otp", verifyAdminLoginOtp);
router.post("/admin-login/resend-otp", resendAdminLoginOtp);
router.post("/manager-login", managerLogin);
router.get("/me", authenticate, getMe);
router.post("/logout", authenticate, logout);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

module.exports = router;
