// Plain-Node checks for the CAPTCHA helper and the TRUST_PROXY parser (no database needed): npm run test:unit
// The lock-out rules need the database: see staff-login.test.js (npm run test:staff).
const assert = require("assert");
const crypto = require("crypto");
const { createCaptcha, verifyCaptcha } = require("../utils/captcha");
const { passwordPolicyError } = require("../utils/password");

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
const svg = Buffer.from(c1.image.split(",")[1], "base64").toString();
assert(!svg.includes("<text"), "the CAPTCHA answer is not embedded as extractable SVG text");
assert(!svg.includes("undefined"));
const answer = solve(c1.id);
assert.strictEqual(verifyCaptcha(c1.id, answer.toLowerCase()), true, "correct (case-insensitive) answer passes");
assert.strictEqual(verifyCaptcha(c1.id, answer), false, "same captcha cannot be reused");
assert.strictEqual(svg.includes(answer), false, "the answer is not present as plaintext in the image source");

assert.strictEqual(passwordPolicyError("Abcdef1!"), "");
assert.match(passwordPolicyError("Abcdefgh1"), /symbol/i);
assert.match(passwordPolicyError("Abcdefg!"), /number/i);
assert.match(passwordPolicyError("1234567!"), /letter/i);
assert.match(passwordPolicyError("Ab1!"), /8 characters/i);

const c2 = createCaptcha();
const right2 = solve(c2.id); // read before verifying: a verify call removes the entry
assert.strictEqual(verifyCaptcha(c2.id, right2 === "ZZZZ" ? "YYYY" : "ZZZZ"), false, "wrong answer fails");
const c3 = createCaptcha();
const right3 = solve(c3.id);
verifyCaptcha(c3.id, right3 === "ZZZZ" ? "YYYY" : "ZZZZ");
assert.strictEqual(verifyCaptcha(c3.id, right3), false, "a wrong attempt uses the captcha up, even if the right answer follows");
assert.strictEqual(verifyCaptcha("nope", "1234"), false);
assert.strictEqual(verifyCaptcha(undefined, undefined), false);

// TRUST_PROXY parsing (the lock-out and audit trail depend on the real visitor IP).
const { parseTrustProxy } = require("../config/trust-proxy");
const quiet = console.error; console.error = () => {};
assert.strictEqual(parseTrustProxy(undefined), undefined, "unset -> do not trust proxies");
assert.strictEqual(parseTrustProxy(""), undefined);
assert.strictEqual(parseTrustProxy("false"), undefined);
assert.strictEqual(parseTrustProxy("1"), 1, "a number = how many proxies");
assert.strictEqual(parseTrustProxy(" 2 "), 2);
assert.strictEqual(parseTrustProxy("true"), undefined, "true is refused: visitors could fake their IP");
console.error = quiet;
assert.strictEqual(parseTrustProxy("loopback, 10.0.0.0/8"), "loopback, 10.0.0.0/8", "subnets pass through");

console.log("admin-login utils: all checks passed");
