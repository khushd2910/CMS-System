// Plain-Node checks for the CAPTCHA and throttle helpers (no database needed): npm run test:unit
const assert = require("assert");
const crypto = require("crypto");
const { createCaptcha, verifyCaptcha } = require("../utils/captcha");
const throttle = require("../utils/login-throttle");

// Read the real answer by brute-forcing the hash (the store never keeps plain text).
const { _peekForTests } = require("../utils/captcha");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const solve = (id) => {
    const target = _peekForTests(id).hash;
    const h = (t) => crypto.createHash("sha256").update(t).digest("hex");
    for (const a of ALPHABET) for (const b of ALPHABET) for (const c of ALPHABET) for (const d of ALPHABET) {
        if (h(a + b + c + d) === target) return a + b + c + d;
    }
    throw new Error("unsolvable");
};

const c1 = createCaptcha();
assert(c1.image.startsWith("data:image/svg+xml;base64,"));
assert(!Buffer.from(c1.image.split(",")[1], "base64").toString().includes("undefined"));
const answer = solve(c1.id);
assert.strictEqual(verifyCaptcha(c1.id, answer.toLowerCase()), true, "correct (case-insensitive) answer passes");
assert.strictEqual(verifyCaptcha(c1.id, answer), false, "same captcha cannot be reused");

const c2 = createCaptcha();
const right2 = solve(c2.id); // read before verifying: a verify call removes the entry
assert.strictEqual(verifyCaptcha(c2.id, right2 === "ZZZZ" ? "YYYY" : "ZZZZ"), false, "wrong answer fails");
const c3 = createCaptcha();
const right3 = solve(c3.id);
verifyCaptcha(c3.id, right3 === "ZZZZ" ? "YYYY" : "ZZZZ");
assert.strictEqual(verifyCaptcha(c3.id, right3), false, "a wrong attempt uses the captcha up, even if the right answer follows");
assert.strictEqual(verifyCaptcha("nope", "1234"), false);
assert.strictEqual(verifyCaptcha(undefined, undefined), false);

for (let i = 0; i < throttle.MAX_FAILURES; i += 1) {
    assert.strictEqual(throttle.isLocked("1.1.1.1", "a@b.in"), false);
    throttle.recordFailure("1.1.1.1", "a@b.in");
}
assert.strictEqual(throttle.isLocked("1.1.1.1", "A@b.in"), true, "locks after max failures");
assert.strictEqual(throttle.isLocked("2.2.2.2", "a@b.in"), false, "other IPs unaffected");
throttle.clearFailures("1.1.1.1", "a@b.in");
assert.strictEqual(throttle.isLocked("1.1.1.1", "a@b.in"), false);
console.log("admin-login utils: all checks passed");
