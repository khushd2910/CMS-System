const express = require("express");
const { authenticate } = require("../middleware/auth");
const {
    listNotifications,
    markNotificationRead,
    markAllNotificationsRead,
} = require("../controller/notification.controller");

const router = express.Router();

router.use(authenticate);
router.get("/", listNotifications);
router.patch("/:id/read", markNotificationRead);
router.post("/read-all", markAllNotificationsRead);

module.exports = router;
