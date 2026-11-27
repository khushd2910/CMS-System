// Plain-Node checks for the grievance input rules (no database needed): npm run test:unit
const assert = require("assert");
const { validateGrievanceInput } = require("../utils/grievance-input");
const { CATEGORIES } = require("../utils/grievance-rules");

const good = {
    title: "Broken streetlight",
    description: "The streetlight on my road has not worked for a week",
    category: "Electricity",
};
const run = (change, options) => validateGrievanceInput({ ...good, ...change }, options);
const errorOf = (change, options) => run(change, options).error;

// A valid request passes and comes back cleaned
assert.deepStrictEqual(run({}).values, good);
assert.deepStrictEqual(run({ title: "  Broken streetlight  " }).values.title, "Broken streetlight", "text is trimmed");
CATEGORIES.forEach((category) => assert(!errorOf({ category }), `${category} is allowed`));

// Not an object at all
for (const body of [undefined, null, "text", 42, [], [good]]) {
    assert(validateGrievanceInput(body).error, `rejects ${JSON.stringify(body)}`);
}

// Title
assert(errorOf({ title: undefined }), "title required");
assert(errorOf({ title: "Hi" }), "title too short");
assert(errorOf({ title: "    a    " }), "spaces do not count");
assert(!errorOf({ title: "x".repeat(120) }), "120 is allowed");
assert(errorOf({ title: "x".repeat(121) }), "121 is too long");
assert(errorOf({ title: { $gt: "" } }), "an object is not text");
assert(errorOf({ title: ["Broken streetlight"] }), "an array is not text");

// Description
assert(errorOf({ description: "too short" }), "description too short");
assert(!errorOf({ description: "d".repeat(5000) }), "5000 is allowed");
assert(errorOf({ description: "d".repeat(5001) }), "5001 is too long");
assert(errorOf({ description: 12345678901234567890123 }), "a number is not text");

// Category
assert(errorOf({ category: "Made up" }), "unknown category");
assert(errorOf({ category: "" }), "empty category");
assert(errorOf({ category: ["Other"] }), "array category");
assert(errorOf({ category: "other" }), "category is case-sensitive, like the form's list");

// Location: only four text fields are kept
assert.strictEqual(run({}).values.location, undefined, "no location is fine");
assert.strictEqual(run({ location: { address: "", city: "  " } }).values.location, undefined, "empty location is dropped");
assert.deepStrictEqual(
    run({ location: { address: " MG Road ", city: "Surat", latitude: 1, evil: "x" } }).values.location,
    { address: "MG Road", city: "Surat" },
    "unknown location fields are dropped"
);
assert(errorOf({ location: "Ahmedabad" }), "location must be an object");
assert(errorOf({ location: ["Ahmedabad"] }), "location may not be an array");
assert(errorOf({ location: { city: 5 } }), "location fields must be text");
assert(errorOf({ location: { city: "x".repeat(101) } }), "city too long");
assert(errorOf({ location: { postalCode: "1".repeat(13) } }), "postal code too long");
assert(!errorOf({ location: { address: "a".repeat(250), postalCode: "380001" } }), "limits are inclusive");

// Requested department
const id = "507f1f77bcf86cd799439011";
assert.strictEqual(run({ requestedDepartmentId: id }).values.requestedDepartmentId, id);
assert.strictEqual(run({ requestedDepartmentId: "" }).values.requestedDepartmentId, undefined, "empty = no suggestion");
assert(errorOf({ requestedDepartmentId: "not-an-id" }), "bad id format");
assert(errorOf({ requestedDepartmentId: { $ne: null } }), "object id");

// Priority: only staff can set it, and only to a real value
assert.strictEqual(run({ priority: "urgent" }).values.priority, undefined, "citizen priority is ignored");
assert.strictEqual(run({ priority: "nonsense" }).error, undefined, "ignored even when invalid, as before");
assert.strictEqual(run({ priority: "urgent" }, { canSetPriority: true }).values.priority, "urgent");
assert(errorOf({ priority: "critical" }, { canSetPriority: true }), "unknown priority");

// Other fields a caller might sneak in are never returned
const sneaky = validateGrievanceInput({ ...good, status: "resolved", citizenId: "x", departmentId: id, referenceNumber: "GRV-1" }).values;
assert.deepStrictEqual(Object.keys(sneaky).sort(), ["category", "description", "title"]);

console.log("grievance input checks passed");
