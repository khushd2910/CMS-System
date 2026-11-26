// Audit trail: one document per security-relevant event, kept in the "auditlogs" collection.
//
// What is recorded: who (user id / the email that was typed), role, what happened, the result,
// the client IP and browser, the record it affected, and when.
// What is NEVER recorded: passwords, tokens, CAPTCHA answers, request bodies.
//
// recordAudit() never throws: a logging problem must not stop a citizen's grievance from being
// processed. Failures are printed to the server console instead.

// Single list shared by the model, the filters on GET /api/admin/audit-logs and the code below.
const EVENTS = [
    "staff_login",
    "staff_logout",
    "password_reset",
    "grievance_assigned",
    "grievance_status_changed",
    "grievance_priority_changed",
    "user_created",
    "user_updated",
    "department_created",
    "department_updated",
    "attachment_uploaded",
    "attachment_deleted",
];
const OUTCOMES = ["success", "failure", "blocked"];

const clip = (value, max) => (typeof value === "string" && value ? value.slice(0, max) : undefined);

// The e-mail (or ID) typed on a login form, in one canonical form so counting works.
const normalizeIdentifier = (value) => (typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "");

const clientIp = (req) => req.ip || req.socket?.remoteAddress || "unknown";

const recordAudit = async (req, entry) => {
    try {
        // Required lazily so this file can be loaded before Mongoose models exist.
        const { AuditLog } = require("../models");
        const actor = entry.user || req.user;
        await AuditLog.create({
            event: entry.event,
            outcome: entry.outcome || "success",
            reason: clip(entry.reason, 60),
            userId: actor?._id,
            role: clip(entry.role || actor?.role, 20),
            identifier: entry.identifier ? normalizeIdentifier(entry.identifier) : undefined,
            targetType: clip(entry.targetType, 40),
            targetId: entry.targetId ? String(entry.targetId).slice(0, 60) : undefined,
            details: clip(entry.details, 500),
            ip: clientIp(req),
            userAgent: clip(req.get?.("user-agent"), 300),
        });
    } catch (error) {
        console.error(`[audit] could not write ${entry.event}: ${error.message}`);
    }
};

module.exports = { EVENTS, OUTCOMES, recordAudit, normalizeIdentifier, clientIp };
