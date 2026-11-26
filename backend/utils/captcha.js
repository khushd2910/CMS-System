// Self-hosted image CAPTCHA (no third-party service, no extra packages).
//
// - The challenge text is generated and kept ON THE SERVER only (as a SHA-256 hash);
//   the browser receives an id and an SVG image with glyphs drawn as paths, not text nodes.
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
const GLYPHS = {
    A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
    D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
    E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
    H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
    K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
    P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
    X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
    3: ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
    4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    5: ["11111", "10000", "10000", "11110", "00001", "10001", "01110"],
    6: ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
    7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    9: ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
};

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
        const centerX = Math.round(step * (index + 1));
        const cell = rand(4, 5);
        const x = centerX - Math.round((5 * cell) / 2);
        const y = rand(6, 11);
        const rotate = rand(-18, 18);
        const glyph = GLYPHS[char];
        let path = "";
        glyph.forEach((row, rowIndex) => {
            [...row].forEach((pixel, columnIndex) => {
                if (pixel === "1") {
                    const left = x + columnIndex * cell;
                    const top = y + rowIndex * cell;
                    path += `M${left} ${top}h${cell - 1}v${cell - 1}h-${cell - 1}z`;
                }
            });
        });
        parts.push(
            `<path d="${path}" fill="${COLOURS[rand(0, COLOURS.length - 1)]}" ` +
                `transform="rotate(${rotate} ${centerX} ${y + (7 * cell) / 2})"/>`
        );
    });
    parts.push(`<path d="M0 ${rand(15, 40)} L${WIDTH} ${rand(15, 40)}" stroke="#123a66" stroke-opacity="0.4" stroke-width="1.2"/>`);
    parts.push("</svg>");
    return parts.join("");
};

const createImageChallenge = (text) => {
    sweep();
    const id = crypto.randomBytes(16).toString("hex");
    store.set(id, { hash: hashAnswer(text), expires: Date.now() + TTL_MS });
    const image = `data:image/svg+xml;base64,${Buffer.from(renderSvg(text)).toString("base64")}`;
    return { id, image, expiresInSeconds: TTL_MS / 1000 };
};

const createCaptcha = () => {
    let text = "";
    for (let i = 0; i < LENGTH; i += 1) text += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    return createImageChallenge(text);
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
const _createForTests = (text) => {
    if (process.env.NODE_ENV !== "test") {
        throw new Error("Known-answer CAPTCHA generation is available only in tests.");
    }
    const answer = String(text).toUpperCase();
    if (!answer || [...answer].some((char) => !GLYPHS[char])) {
        throw new Error("Test CAPTCHA answer contains unsupported characters.");
    }
    return createImageChallenge(answer);
};

module.exports = { createCaptcha, verifyCaptcha, _peekForTests, _createForTests };
