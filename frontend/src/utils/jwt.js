// Reads the expiry time ("exp", in seconds) from a login token so the app knows when the session ends.
// This does NOT check the signature: the server does that on every request. It is only used to sign the
// person out on screen at the right moment instead of waiting for their next click to fail.
export function tokenExpiryMs(token) {
  try {
    const payload = String(token).split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
    const { exp } = JSON.parse(decodeURIComponent(Array.from(json, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`).join("")));
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}
