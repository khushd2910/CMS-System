// Turns the TRUST_PROXY setting into the value Express's "trust proxy" option expects.
//
// Why it matters: the login lock-out and the audit trail record req.ip. Behind a reverse proxy
// (nginx, Render, Heroku, a load balancer ...) every request arrives from the PROXY, so without
// this setting all visitors share one IP and one attacker can lock out everybody.
//
//   (unset) / false  -> do not trust proxy headers (right when Node is reached directly)
//   1, 2, 3 ...      -> trust that many proxies in front of the app. USE THIS in production.
//   loopback, 10.0.0.0/8 ...  -> trust proxies at these addresses (Express subnet syntax)
//   true             -> REFUSED: it would believe whatever X-Forwarded-For a visitor sends,
//                       so an attacker could pick a new "IP" on every request.
const parseTrustProxy = (value) => {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text || text.toLowerCase() === "false") return undefined;
    if (/^\d+$/.test(text)) return Number(text);
    if (text.toLowerCase() === "true") {
        console.error('[security] TRUST_PROXY=true is not accepted (clients could fake their IP). Use a number such as "1".');
        return undefined;
    }
    return text;
};

module.exports = { parseTrustProxy };
