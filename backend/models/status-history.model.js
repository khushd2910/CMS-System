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
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

statusHistorySchema.index({ grievanceId: 1, createdAt: -1 });

module.exports = mongoose.model("StatusHistory", statusHistorySchema);
