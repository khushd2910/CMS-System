import { createServer } from "vite";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.window = { sessionStorage: mem(), localStorage: mem() };
const vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const { request, onSessionEnded } = await vite.ssrLoadModule("/src/services/apiClient.js");
const { tokenStorage } = await vite.ssrLoadModule("/src/services/tokenStorage.js");
let ended = 0;
onSessionEnded(() => { ended += 1; });
const reply = (status) => async () => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => ({ message: "x" }) });

tokenStorage.set("tok-1", false);
globalThis.fetch = reply(401);
await assert.rejects(request("/auth/me", { auth: true }));
assert.equal(ended, 1, "401 with a token -> session ended");

await assert.rejects(request("/auth/logout", { auth: true, notifyOnExpiry: false }));
assert.equal(ended, 1, "logout's 401 is ignored");

await assert.rejects(request("/auth/login", { method: "POST", body: {} }));
assert.equal(ended, 1, "401 on a login attempt (no token sent) is a wrong password, not an expiry");

globalThis.fetch = reply(500);
await assert.rejects(request("/auth/me", { auth: true }));
assert.equal(ended, 1, "a 500 is not an expiry");

// signed in again while the old request was still running -> stale 401 must not kick the new session out
globalThis.fetch = async () => { tokenStorage.set("tok-2", false); return reply(401)(); };
await assert.rejects(request("/auth/me", { auth: true }));
assert.equal(ended, 1, "stale 401 for an old token is ignored");
console.log("api client expiry handling: 5 checks passed");
await vite.close();
