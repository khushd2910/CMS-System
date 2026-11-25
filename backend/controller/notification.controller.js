const { Notification } = require("../models");
const { getPagination, paginationMeta } = require("../utils/pagination");

const listNotifications = async (req, res, next) => {
    try {
        const unreadOnly = req.query.unread === "true";
        const filter = { userId: req.user._id };
        if (unreadOnly) filter.isRead = false;
        const pagination = getPagination(req.query);
        const total = await Notification.countDocuments(filter);
        const notifications = await Notification.find(filter)
            .populate("grievanceId", "referenceNumber title status")
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit);
        const unreadCount = await Notification.countDocuments({ userId: req.user._id, isRead: false });
        return res.json({
            notifications,
            unreadCount,
            pagination: paginationMeta(pagination, total),
        });
    } catch (error) {
        return next(error);
    }
};

const markNotificationRead = async (req, res, next) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user._id },
            { $set: { isRead: true, readAt: new Date() } },
            { returnDocument: "after" }
        );
        if (!notification) {
            return res.status(404).json({ message: "Notification not found." });
        }
        return res.json({ notification });
    } catch (error) {
        return next(error);
    }
};

const markAllNotificationsRead = async (req, res, next) => {
    try {
        const result = await Notification.updateMany(
            { userId: req.user._id, isRead: false },
            { $set: { isRead: true, readAt: new Date() } }
        );
        return res.json({ updatedCount: result.modifiedCount });
    } catch (error) {
        return next(error);
    }
};

module.exports = { listNotifications, markNotificationRead, markAllNotificationsRead };
