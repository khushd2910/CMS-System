const mongoose = require("mongoose");
const { EVENTS, OUTCOMES } = require("../utils/audit");

// Append-only: the application only ever creates these documents.
const auditLogSchema = new mongoose.Schema(
    {
        event: { type: String, enum: EVENTS, required: true },
        outcome: { type: String, enum: OUTCOMES, default: "success" },
        // Short machine-readable cause for failures and blocks, e.g. "invalid_credentials".
        reason: String,
        // Who did it. Missing for a failed login (nobody is signed in); see "identifier".
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        role: String,
        // The e-mail / ID typed on the login form (lower-case, max 254 characters).
        identifier: String,
        // The record the action touched, e.g. targetType "Grievance" + its id.
        targetType: String,
        targetId: String,
        details: String,
        ip: String,
        userAgent: String,
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
// Used by the login lock-out checks (utils/login-throttle.js).
auditLogSchema.index({ event: 1, outcome: 1, reason: 1, identifier: 1, ip: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
