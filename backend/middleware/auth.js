const jwt = require("jsonwebtoken");
const { User } = require("../models");

const getSecret = () => {
    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not set. Add it to backend/.env.");
    }

    return process.env.JWT_SECRET;
};

const authenticate = async (req, res, next) => {
    try {
        const header = req.get("authorization");
        if (!header) {
            return res.status(401).json({ message: "Authentication token is required." });
        }

        const [scheme, credential] = header.trim().split(/\s+/, 2);
        if (!scheme || scheme.toLowerCase() !== "bearer" || !credential) {
            return res.status(401).json({ message: "Use Authorization: Bearer <token>." });
        }

        const token = credential.trim();
        if (!token) {
            return res.status(401).json({ message: "Authentication token is required." });
        }
        const payload = jwt.verify(token, getSecret());
        const user = await User.findById(payload.userId).select("-password");

        if (!user) {
            return res.status(401).json({ message: "User account no longer exists." });
        }

        // A token made before the last password reset is no longer valid. Tokens issued before this
        // feature existed have no "tv" and count as version 0.
        if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
            return res.status(401).json({ message: "Your session has ended. Please sign in again." });
        }

        req.user = user;
        return next();
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(401).json({ message: "Invalid or expired authentication token." });
        }

        return next(error);
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "You are not authorized for this action." });
    }

    return next();
};

const requireSelfOrRole = (userIdParam, ...roles) => (req, res, next) => {
    const requestedUserId = req.params[userIdParam];
    const isSelf =
        Boolean(req.user) &&
        Boolean(requestedUserId) &&
        req.user._id.equals(requestedUserId);
    if (isSelf || (req.user && roles.includes(req.user.role))) {
        return next();
    }

    return res.status(403).json({ message: "You are not authorized for this action." });
};

module.exports = { authenticate, requireRole, requireSelfOrRole, getSecret };
