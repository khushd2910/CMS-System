const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { getSecret } = require("../middleware/auth");

const publicUser = (user) => ({
    id: user._id,
    role: user.role,
    name: user.name,
    mobileNo: user.mobileNo,
    email: user.email,
    departmentId: user.departmentId,
});

const createToken = (user) =>
    jwt.sign({ userId: user._id.toString(), role: user.role }, getSecret(), {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
    });

const authResponse = (user) => ({
    user: publicUser(user),
    token: createToken(user),
    tokenType: "Bearer",
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
});

const register = async (req, res, next) => {
    try {
        const { name, mobileNo, email, password } = req.body || {};
        const normalizedName = typeof name === "string" ? name.trim() : "";
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (!normalizedName || !normalizedEmail || typeof password !== "string") {
            return res.status(400).json({ message: "name, email, and password are required." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return res.status(400).json({ message: "A valid email address is required." });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters." });
        }

        const user = await User.create({
            name: normalizedName,
            mobileNo,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 12),
            role: "citizen",
        });
        return res.status(201).json(authResponse(user));
    } catch (error) {
        return next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body || {};
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (!normalizedEmail || typeof password !== "string") {
            return res.status(400).json({ message: "email and password are required." });
        }

        const user = await User.findOne({ email: normalizedEmail }).select("+password");
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid email or password." });
        }
        return res.json(authResponse(user));
    } catch (error) {
        return next(error);
    }
};

const getMe = (req, res) => res.json({ user: publicUser(req.user) });

const logout = (req, res) =>
    res.json({ message: "Logged out successfully. Remove the token from the client." });

module.exports = { register, login, getMe, logout };
