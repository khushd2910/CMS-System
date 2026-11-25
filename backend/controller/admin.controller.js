const bcrypt = require("bcryptjs");
const { User, Department } = require("../models");
const { getPagination, paginationMeta } = require("../utils/pagination");

const publicUser = (user) => ({
    id: user._id,
    role: user.role,
    name: user.name,
    mobileNo: user.mobileNo,
    email: user.email,
    departmentId: user.departmentId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
});

const listUsers = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.role) {
            if (!["citizen", "manager", "admin"].includes(req.query.role)) {
                return res.status(400).json({ message: "Invalid user role." });
            }
            filter.role = req.query.role;
        }
        if (req.query.search) {
            const escapedSearch = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            filter.$or = [
                { name: { $regex: escapedSearch, $options: "i" } },
                { email: { $regex: escapedSearch, $options: "i" } },
            ];
        }
        const pagination = getPagination(req.query);
        const total = await User.countDocuments(filter);
        const users = await User.find(filter)
            .select("-password")
            .populate("departmentId", "name isActive")
            .sort({ createdAt: -1 })
            .skip(pagination.skip)
            .limit(pagination.limit);
        return res.json({ users, pagination: paginationMeta(pagination, total) });
    } catch (error) {
        return next(error);
    }
};

const createUser = async (req, res, next) => {
    try {
        const { name, mobileNo, email, password, role, departmentId } = req.body || {};
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
        if (!["admin", "manager"].includes(role)) {
            return res.status(400).json({ message: "Admin-created users must have the admin or manager role." });
        }
        if (role === "manager" && (!departmentId || !(await Department.exists({ _id: departmentId, isActive: true })))) {
            return res.status(400).json({ message: "An active department is required for a manager." });
        }

        const user = await User.create({
            name: normalizedName,
            mobileNo,
            email: normalizedEmail,
            password: await bcrypt.hash(password, 12),
            role,
            departmentId: role === "manager" ? departmentId : undefined,
        });
        return res.status(201).json({ user: publicUser(user) });
    } catch (error) {
        return next(error);
    }
};

const updateUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        const updates = req.body || {};
        if (updates.role !== undefined) {
            if (!["citizen", "manager", "admin"].includes(updates.role)) {
                return res.status(400).json({ message: "Invalid user role." });
            }
            user.role = updates.role;
        }
        if (updates.name !== undefined) user.name = updates.name;
        if (updates.mobileNo !== undefined) user.mobileNo = updates.mobileNo;
        if (updates.departmentId !== undefined) {
            if (updates.departmentId && !(await Department.exists({ _id: updates.departmentId, isActive: true }))) {
                return res.status(400).json({ message: "Department is not active or does not exist." });
            }
            user.departmentId = updates.departmentId || undefined;
        }
        if (user.role === "manager" && !user.departmentId) {
            return res.status(400).json({ message: "A manager must be assigned to an active department." });
        }
        if (user.role !== "manager") user.departmentId = undefined;
        await user.save();
        return res.json({ user: publicUser(user) });
    } catch (error) {
        return next(error);
    }
};

module.exports = { listUsers, createUser, updateUser };
