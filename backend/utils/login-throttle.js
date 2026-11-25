// Slows down password guessing on the admin login: after MAX_FAILURES failed attempts for the same
// IP + account, further attempts are refused until WINDOW_MS has passed.
// In memory (one server process). Use a shared store such as Redis if you run several instances.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

const failures = new Map(); // key -> { count, first }

const keyFor = (ip, identifier) => `${ip || "unknown"}|${String(identifier || "").toLowerCase()}`;

const isLocked = (ip, identifier) => {
    const entry = failures.get(keyFor(ip, identifier));
    if (!entry) return false;
    if (Date.now() - entry.first > WINDOW_MS) {
        failures.delete(keyFor(ip, identifier));
        return false;
    }
    return entry.count >= MAX_FAILURES;
};

const recordFailure = (ip, identifier) => {
    const key = keyFor(ip, identifier);
    const entry = failures.get(key);
    if (!entry || Date.now() - entry.first > WINDOW_MS) {
        failures.set(key, { count: 1, first: Date.now() });
    } else {
        entry.count += 1;
    }
    if (failures.size > 10000) failures.delete(failures.keys().next().value);
};

const clearFailures = (ip, identifier) => failures.delete(keyFor(ip, identifier));

module.exports = { isLocked, recordFailure, clearFailures, MAX_FAILURES, WINDOW_MS };
