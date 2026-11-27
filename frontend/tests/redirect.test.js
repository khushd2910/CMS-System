// Run with:  npm test   (from frontend/). No browser needed.
import assert from "node:assert/strict";
import { redirectTarget } from "../src/utils/redirect.js";
import { validateNewPassword, MAX_PASSWORD_BYTES } from "../src/utils/passwordRules.js";
import { tokenExpiryMs } from "../src/utils/jwt.js";

const admin = { prefix: "/admin", fallback: "/admin/dashboard" };
const citizen = { prefix: "/citizen", fallback: "/citizen/dashboard" };
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`  ok   ${name}`); };

ok("keeps path, query and hash", () =>
  assert.equal(redirectTarget({ pathname: "/citizen/dashboard", search: "?tab=2", hash: "#x" }, citizen), "/citizen/dashboard?tab=2#x"));
ok("no 'from' -> fallback", () => {
  assert.equal(redirectTarget(undefined, admin), admin.fallback);
  assert.equal(redirectTarget(null, admin), admin.fallback);
  assert.equal(redirectTarget("/admin/x", admin), admin.fallback); // not a location object
});
ok("other areas of the site are refused (citizen cannot be sent to /admin)", () =>
  assert.equal(redirectTarget({ pathname: "/admin/dashboard" }, citizen), citizen.fallback));
ok("prefix must match a whole path segment", () => {
  assert.equal(redirectTarget({ pathname: "/administrator" }, admin), admin.fallback);
  assert.equal(redirectTarget({ pathname: "/admin" }, admin), "/admin");
});
ok("off-site and odd values are refused", () => {
  for (const pathname of ["//evil.com", "https://evil.com/admin", "admin/dashboard", "/admin\\evil", "javascript:alert(1)", 42, undefined]) {
    assert.equal(redirectTarget({ pathname }, { fallback: "/home" }), "/home", String(pathname));
  }
});
ok("never loops back to a login page", () => {
  for (const pathname of ["/admin/login", "/login", "/register", "/forgot-password", "/reset-password/abc"]) {
    assert.equal(redirectTarget({ pathname }, { fallback: "/home" }), "/home", pathname);
  }
});
ok("password: 72 bytes ok, 73 refused, emoji counted as bytes", () => {
  const good = "Aa1!" + "x".repeat(MAX_PASSWORD_BYTES - 4);
  assert.equal(validateNewPassword(good), "");
  assert.match(validateNewPassword(good + "x"), /too long/i);
  assert.match(validateNewPassword("Aa1!" + "😀".repeat(20)), /too long/i);
});
ok("token expiry is read from the JWT 'exp' (seconds -> milliseconds)", () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = `${b64({ alg: "HS256" })}.${b64({ userId: "1", exp: 1900000000 })}.sig`;
  assert.equal(tokenExpiryMs(token), 1900000000 * 1000);
});
ok("a token without exp, or garbage, gives null (never throws)", () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  assert.equal(tokenExpiryMs(`${b64({})}.${b64({ userId: "1" })}.sig`), null);
  for (const bad of [null, undefined, "", "abc", "a.b.c", 42]) assert.equal(tokenExpiryMs(bad), null, String(bad));
});
console.log(`\n${n} checks passed`);
