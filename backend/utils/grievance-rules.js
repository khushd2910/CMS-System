/**
 * Grievance business rules - the ONE place to change them.
 *
 * Roles in the system: "citizen", "admin", "manager" (department manager).
 */

const STATUSES = [
    "submitted",
    "under_review",
    "assigned",
    "in_progress",
    "resolved",
    "rejected",
    "closed",
];

const PRIORITIES = ["low", "medium", "high", "urgent"];

/**
 * Status transitions allowed through PATCH /api/grievances/:id/status.
 *
 *   TRANSITIONS[currentStatus][newStatus] = roles that may make the move
 *
 * A move that is not listed here is rejected. Two moves are NOT here on
 * purpose, because they happen through the assign-department endpoint:
 *   submitted / under_review / assigned / in_progress  ->  assigned
 *
 * A manager can only move grievances that belong to their own department
 * (that check lives in canAccessGrievance, not in this table).
 */
const TRANSITIONS = {
    submitted: {
        under_review: ["admin"],
        rejected: ["admin"],
    },
    under_review: {
        rejected: ["admin"],
    },
    assigned: {
        in_progress: ["manager"],
    },
    in_progress: {
        resolved: ["manager"],
    },
    resolved: {
        closed: ["admin", "manager"],
        // Sends the work back, e.g. when the resolution was not good enough.
        in_progress: ["admin", "manager"],
    },
    rejected: {}, // final
    closed: {}, // final
};

/** Statuses from which admin may (re)assign a grievance to a department. */
const ASSIGNABLE_STATUSES = ["submitted", "under_review", "assigned", "in_progress"];

/** Statuses in which the priority can still be changed. */
const PRIORITY_EDITABLE_STATUSES = [
    "submitted",
    "under_review",
    "assigned",
    "in_progress",
    "resolved",
];

const getId = (value) => String(value?._id || value || "");

/**
 * Who may open a grievance (and its attachments / history)?
 *  - admin:   every grievance
 *  - citizen: only their own
 *  - manager: only grievances assigned to THEIR department
 */
const canAccessGrievance = (grievance, user) => {
    if (!grievance || !user) return false;
    if (user.role === "admin") return true;
    if (user.role === "citizen") return getId(grievance.citizenId) === String(user._id);
    if (user.role === "manager") {
        const managerDepartment = getId(user.departmentId);
        return Boolean(managerDepartment) && getId(grievance.departmentId) === managerDepartment;
    }
    return false;
};

/** Statuses the given user may move this grievance to right now. */
const getAllowedTransitions = (grievance, user) => {
    if (!canAccessGrievance(grievance, user)) return [];
    const fromCurrent = TRANSITIONS[grievance.status] || {};
    return Object.keys(fromCurrent).filter((next) => fromCurrent[next].includes(user.role));
};

/** Moving to rejected/resolved, or sending a resolved grievance back, needs a reason. */
const remarksRequired = (from, to) =>
    to === "rejected" || to === "resolved" || (from === "resolved" && to === "in_progress");

module.exports = {
    STATUSES,
    PRIORITIES,
    TRANSITIONS,
    ASSIGNABLE_STATUSES,
    PRIORITY_EDITABLE_STATUSES,
    getId,
    canAccessGrievance,
    getAllowedTransitions,
    remarksRequired,
};
