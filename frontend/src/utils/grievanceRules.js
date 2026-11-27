// Grievance values shared by the admin screens.
// These mirror backend/utils/grievance-rules.js. The BACKEND is still the one that enforces them
// on every request; having them here only lets the screen show the right choices and messages.

export const STATUSES = ["submitted", "under_review", "assigned", "in_progress", "resolved", "rejected", "closed"];
export const PRIORITIES = ["low", "medium", "high", "urgent"];

// Statuses in which an admin may still (re)assign a department.
export const ASSIGNABLE_STATUSES = ["submitted", "under_review", "assigned", "in_progress"];

// Statuses in which the priority can still be changed.
export const PRIORITY_EDITABLE_STATUSES = ["submitted", "under_review", "assigned", "in_progress", "resolved"];

export const statusLabel = (status) => String(status || "").replaceAll("_", " ");
export const statusSlug = (status) => String(status || "").replaceAll("_", "-");

// Rejecting, resolving, or sending a resolved grievance back for more work needs a written reason.
export const remarksRequired = (from, to) =>
  to === "rejected" || to === "resolved" || (from === "resolved" && to === "in_progress");
