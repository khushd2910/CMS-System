const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
    {
        address: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        postalCode: { type: String, trim: true },
        latitude: Number,
        longitude: Number,
    },
    { _id: false }
);

const grievanceSchema = new mongoose.Schema(
    {
        referenceNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        category: {
            type: String,
            required: true,
            trim: true,
        },
        location: locationSchema,
        citizenId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        departmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
        },
        assignedOfficerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        status: {
            type: String,
            enum: ["submitted", "under_review", "in_progress", "resolved", "rejected", "closed"],
            default: "submitted",
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high", "urgent"],
            default: "medium",
        },
        resolvedAt: Date,
    },
    { timestamps: true }
);

grievanceSchema.index({ citizenId: 1, createdAt: -1 });
grievanceSchema.index({ departmentId: 1, status: 1 });
grievanceSchema.index({ assignedOfficerId: 1, status: 1 });

module.exports = mongoose.model("Grievance", grievanceSchema);
