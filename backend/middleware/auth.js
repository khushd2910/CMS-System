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
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Authentication token is required." });
        }

        const token = header.slice("Bearer ".length);
        const payload = jwt.verify(token, getSecret());
        const user = await User.findById(payload.userId).select("-password");

        if (!user) {
            return res.status(401).json({ message: "User account no longer exists." });
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

module.exports = { authenticate, requireRole, getSecret };
