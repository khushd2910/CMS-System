const mongoose = require("mongoose");

const statusHistorySchema = new mongoose.Schema({
    grievanceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Grievance",
        required: true,
    },
    oldStatus: {
        type: String,
        required: true,
        trim: true,
    },
    newStatus: {
        type: String,
        required: true,
        trim: true,
    },
    changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    remarks: {
        type: String,
        trim: true,
    },
    // What kind of change this entry records. Older entries without it are status changes.
    action: {
        type: String,
        enum: ["status_changed", "department_assigned", "priority_changed"],
        default: "status_changed",
    },
    // Readable detail for non-status changes, e.g. "Department: Water Supply".
    details: {
        type: String,
        trim: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

statusHistorySchema.index({ grievanceId: 1, createdAt: -1 });

module.exports = mongoose.model("StatusHistory", statusHistorySchema);
