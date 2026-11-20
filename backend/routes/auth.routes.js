const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { authenticate, getSecret } = require("../middleware/auth");

const router = express.Router();

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

router.post("/register", async (req, res, next) => {
    try {
        const { name, mobileNo, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ message: "name, email, and password are required." });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters." });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        const user = await User.create({
            name,
            mobileNo,
            email,
            password: passwordHash,
            role: "citizen",
        });

        return res.status(201).json({ user: publicUser(user), token: createToken(user) });
    } catch (error) {
        return next(error);
    }
});

router.post("/login", async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "email and password are required." });
        }

        const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid email or password." });
        }

        return res.json({ user: publicUser(user), token: createToken(user) });
    } catch (error) {
        return next(error);
    }
});

router.get("/me", authenticate, (req, res) => {
    res.json({ user: publicUser(req.user) });
});

module.exports = router;
