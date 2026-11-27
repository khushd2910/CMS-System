/**
 * Checks and cleans the details a person sends when filing a grievance.
 *
 * The citizen form in the browser already checks these, but anyone can call the API directly,
 * so the SERVER must check them as well. The limits match the form.
 *
 * validateGrievanceInput(body, { canSetPriority })
 *   -> { error: "message" }   when something is wrong (send it back with status 400)
 *   -> { values: {...} }      when everything is fine; ONLY these cleaned fields should be saved
 */
const { CATEGORIES, PRIORITIES } = require("./grievance-rules");

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const LIMITS = {
    titleMin: 5,
    titleMax: 120,
    descriptionMin: 20,
    descriptionMax: 5000,
};

// Optional location fields and the longest text each one may hold.
const LOCATION_FIELDS = { address: 250, city: 100, state: 100, postalCode: 12 };

const isPlainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const validateGrievanceInput = (body, { canSetPriority = false } = {}) => {
    if (!isPlainObject(body)) {
        return { error: "Grievance details are required." };
    }

    // typeof check first: a title like { "$gt": "" } must never reach the database as an object.
    if (typeof body.title !== "string") return { error: "Title is required." };
    const title = body.title.trim();
    if (title.length < LIMITS.titleMin) return { error: `Title must be at least ${LIMITS.titleMin} characters.` };
    if (title.length > LIMITS.titleMax) return { error: `Title must be ${LIMITS.titleMax} characters or fewer.` };

    if (typeof body.description !== "string") return { error: "Description is required." };
    const description = body.description.trim();
    if (description.length < LIMITS.descriptionMin) {
        return { error: `Please describe the issue in at least ${LIMITS.descriptionMin} characters.` };
    }
    if (description.length > LIMITS.descriptionMax) {
        return { error: `Description must be ${LIMITS.descriptionMax} characters or fewer.` };
    }

    if (typeof body.category !== "string" || !CATEGORIES.includes(body.category.trim())) {
        return { error: "Select a valid category for this grievance." };
    }

    const values = { title, description, category: body.category.trim() };

    if (body.location !== undefined && body.location !== null) {
        if (!isPlainObject(body.location)) return { error: "Location must be an object." };
        const location = {};
        for (const [field, maxLength] of Object.entries(LOCATION_FIELDS)) {
            const raw = body.location[field];
            if (raw === undefined || raw === null || raw === "") continue;
            if (typeof raw !== "string") return { error: `Location ${field} must be text.` };
            const text = raw.trim();
            if (text.length > maxLength) {
                return { error: `Location ${field} must be ${maxLength} characters or fewer.` };
            }
            if (text) location[field] = text;
        }
        // Only the four fields above are kept; anything else in the location is dropped.
        if (Object.keys(location).length) values.location = location;
    }

    if (body.requestedDepartmentId !== undefined && body.requestedDepartmentId !== null && body.requestedDepartmentId !== "") {
        if (typeof body.requestedDepartmentId !== "string" || !OBJECT_ID_PATTERN.test(body.requestedDepartmentId)) {
            return { error: "Selected department is not valid." };
        }
        values.requestedDepartmentId = body.requestedDepartmentId;
    }

    // Priority is staff-only. A citizen's value is ignored (the grievance starts as "medium").
    if (canSetPriority && body.priority !== undefined) {
        if (!PRIORITIES.includes(body.priority)) return { error: "Invalid grievance priority." };
        values.priority = body.priority;
    }

    return { values };
};

module.exports = { validateGrievanceInput, LIMITS, LOCATION_FIELDS };
