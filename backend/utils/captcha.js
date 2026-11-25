// Self-hosted image CAPTCHA (no third-party service, no extra packages).
//
// - The challenge text is generated and kept ON THE SERVER only (as a SHA-256 hash);
//   the browser receives just an id and an SVG image.
// - Every challenge works once and expires after 5 minutes. A wrong answer also uses it up,
//   so an attacker cannot keep guessing the same image.
// - Storage is in memory: fine for one server process. If you run several instances behind a
//   load balancer, move this Map to Redis (or another shared store).
const crypto = require("crypto");

const TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 5000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/l to avoid confusion
const LENGTH = 4;
const WIDTH = 150;
const HEIGHT = 56;
const COLOURS = ["#123a66", "#1d4f8a", "#3b2a55", "#5a1f2b"];

const store = new Map(); // id -> { hash, expires }

const hashAnswer = (value) =>
    crypto.createHash("sha256").update(String(value).trim().toUpperCase()).digest("hex");

const sweep = () => {
    const now = Date.now();
    for (const [id, entry] of store) {
        if (entry.expires <= now) store.delete(id);
    }
    // Hard cap: drop the oldest entries if someone floods the endpoint.
    while (store.size > MAX_ENTRIES) store.delete(store.keys().next().value);
};

const rand = (min, max) => crypto.randomInt(min, max + 1);

const renderSvg = (text) => {
    const parts = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`,
        `<rect width="100%" height="100%" fill="#f4f6fa"/>`,
    ];
    // Background noise: curved lines and dots.
    for (let i = 0; i < 5; i += 1) {
        parts.push(
            `<path d="M${rand(0, 20)} ${rand(8, HEIGHT - 8)} Q${rand(40, 110)} ${rand(0, HEIGHT)} ${rand(WIDTH - 20, WIDTH)} ${rand(8, HEIGHT - 8)}" ` +
                `stroke="${COLOURS[rand(0, COLOURS.length - 1)]}" stroke-opacity="0.35" stroke-width="1.4" fill="none"/>`
        );
    }
    for (let i = 0; i < 28; i += 1) {
        parts.push(`<circle cx="${rand(0, WIDTH)}" cy="${rand(0, HEIGHT)}" r="${rand(1, 2)}" fill="#123a66" fill-opacity="0.25"/>`);
    }
    // The characters, each slightly rotated and shifted.
    const step = WIDTH / (text.length + 1);
    [...text].forEach((char, index) => {
        const x = Math.round(step * (index + 1));
        const y = rand(HEIGHT / 2 + 8, HEIGHT / 2 + 14);
        const rotate = rand(-18, 18);
        const size = rand(28, 34);
        parts.push(
            `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size}" ` +
                `fill="${COLOURS[rand(0, COLOURS.length - 1)]}" text-anchor="middle" transform="rotate(${rotate} ${x} ${y})">${char}</text>`
        );
    });
    parts.push(`<path d="M0 ${rand(15, 40)} L${WIDTH} ${rand(15, 40)}" stroke="#123a66" stroke-opacity="0.4" stroke-width="1.2"/>`);
    parts.push("</svg>");
    return parts.join("");
};

const createCaptcha = () => {
    sweep();
    let text = "";
    for (let i = 0; i < LENGTH; i += 1) text += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    const id = crypto.randomBytes(16).toString("hex");
    store.set(id, { hash: hashAnswer(text), expires: Date.now() + TTL_MS });
    const image = `data:image/svg+xml;base64,${Buffer.from(renderSvg(text)).toString("base64")}`;
    return { id, image, expiresInSeconds: TTL_MS / 1000 };
};

// Returns true only for a known, unexpired id with the right answer. The id is always used up.
const verifyCaptcha = (id, answer) => {
    if (typeof id !== "string" || typeof answer !== "string") return false;
    const entry = store.get(id);
    store.delete(id);
    if (!entry || entry.expires <= Date.now()) return false;
    const given = Buffer.from(hashAnswer(answer));
    const expected = Buffer.from(entry.hash);
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};

// Test helper only.
const _peekForTests = (id) => store.get(id);

module.exports = { createCaptcha, verifyCaptcha, _peekForTests };
