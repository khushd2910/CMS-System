const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema({
    grievanceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Grievance",
        required: true,
    },
    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    fileName: {
        type: String,
        required: true,
        trim: true,
    },
    fileUrl: {
        type: String,
        required: true,
        trim: true,
    },
    publicId: {
        type: String,
        required: true,
        trim: true,
    },
    fileType: {
        type: String,
        trim: true,
    },
    uploadedAt: {
        type: Date,
        default: Date.now,
    },
});

attachmentSchema.index({ grievanceId: 1, uploadedAt: -1 });

module.exports = mongoose.model("Attachment", attachmentSchema);
