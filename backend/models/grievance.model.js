const mongoose = require("mongoose");
const { STATUSES, PRIORITIES } = require("../utils/grievance-rules");

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
        // Department the citizen asked for (optional hint for the admin).
        // It gives the department's manager NO access to the grievance.
        requestedDepartmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
        },
        // Department that actually handles the grievance. Only an admin sets it
        // (PATCH /api/grievances/:id/assign-department).
        departmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
        },
        status: {
            type: String,
            enum: STATUSES,
            default: "submitted",
        },
        priority: {
            type: String,
            enum: PRIORITIES,
            default: "medium",
        },
        resolvedAt: Date,
    },
    { timestamps: true }
);

grievanceSchema.index({ citizenId: 1, createdAt: -1 });
grievanceSchema.index({ departmentId: 1, status: 1 });

module.exports = mongoose.model("Grievance", grievanceSchema);
