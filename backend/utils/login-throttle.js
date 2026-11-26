// Lock-out rules for the admin and manager login.
//
// The counters are NOT kept in memory: they are worked out from the audit trail (the "auditlogs"
// collection), so a server restart does not give attackers a fresh start and several server
// instances share the same view.
//
// A lock lifts by itself once enough old failures are older than WINDOW_MS.
// Three kinds of failure are counted separately:
//
//   wrong password / unknown account / wrong role   ("invalid_credentials")
//     - LIMITS.pair    : same IP  + same account   -> 5 failures.  Reset by a successful sign-in
//                        from that IP on that account, so a typo does not haunt a real user.
//     - LIMITS.account : ANY IP   + same account   -> 20 failures. Stops guessing spread over many
//                        IPs. Trade-off: while an attack is running the real owner is also asked
//                        to wait. Raise the number if that happens in practice.
//     - LIMITS.ip      : same IP, ANY account      -> 30 failures. Stops one machine trying many accounts.
//
//   wrong CAPTCHA   ("captcha_failed")
//     - LIMITS.captcha : same IP                   -> 20 failures. A mistyped CAPTCHA never locks an
//                        ACCOUNT, so nobody can lock an admin out just by sending bad CAPTCHAs.
const { AuditLog } = require("../models");

const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { pair: 5, account: 20, ip: 30, captcha: 20 };

// The newest `limit` matching failures. If that many exist inside the window, the lock lasts until
// the oldest of them is WINDOW_MS old.
const lockFor = async (filter, limit, since, now) => {
    const recent = await AuditLog.find({ ...filter, createdAt: { $gt: since } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select("createdAt");
    if (recent.length < limit) return 0;
    return Math.max(1, Math.ceil((recent[limit - 1].createdAt.getTime() + WINDOW_MS - now) / 1000));
};

// -> { locked: boolean, retryAfterSeconds: number, scope: string }
const getLockStatus = async ({ ip, role, identifier }) => {
    const now = Date.now();
    const windowStart = new Date(now - WINDOW_MS);
    const credentialFailure = { event: "staff_login", outcome: "failure", reason: "invalid_credentials" };

    // For the IP+account pair only failures AFTER the last successful sign-in count.
    const lastSuccess = await AuditLog.findOne({
        event: "staff_login", outcome: "success", role, identifier, ip, createdAt: { $gt: windowStart },
    })
        .sort({ createdAt: -1 })
        .select("createdAt");
    const pairSince = lastSuccess ? lastSuccess.createdAt : windowStart;

    const checks = [
        ["ip_account", { ...credentialFailure, role, identifier, ip }, LIMITS.pair, pairSince],
        ["account", { ...credentialFailure, role, identifier }, LIMITS.account, windowStart],
        ["ip", { ...credentialFailure, ip }, LIMITS.ip, windowStart],
        ["captcha", { event: "staff_login", outcome: "failure", reason: "captcha_failed", ip }, LIMITS.captcha, windowStart],
    ];

    let worst = { locked: false, retryAfterSeconds: 0, scope: "" };
    for (const [scope, filter, limit, since] of checks) {
        const seconds = await lockFor(filter, limit, since, now);
        if (seconds > worst.retryAfterSeconds) worst = { locked: true, retryAfterSeconds: seconds, scope };
    }
    return worst;
};

module.exports = { getLockStatus, LIMITS, WINDOW_MS };
