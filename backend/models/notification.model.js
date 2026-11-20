const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    grievanceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Grievance",
    },
    message: {
        type: String,
        required: true,
        trim: true,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    readAt: Date,
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
