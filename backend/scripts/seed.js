const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { User, Department } = require("../models");
const { passwordPolicyError } = require("../utils/password");

dotenv.config();

// Safe to run again and again:
//   - departments: created if missing, switched back to active.
//   - admin account: created if it does not exist. If it already exists, its PASSWORD IS LEFT ALONE.
//     To change the password on purpose, run with RESET_ADMIN_PASSWORD=true (this also signs out its old sessions).
//   - an existing account with this email that is NOT an admin is never turned into one.
const seed = async () => {
    if (!process.env.ADMIN_EMAIL) {
        throw new Error("ADMIN_EMAIL must be set before seeding.");
    }
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    const resetPassword = String(process.env.RESET_ADMIN_PASSWORD || "").toLowerCase() === "true";

    await connectDB();

    const departmentNames = ["Public Works", "Water Supply", "Electricity", "Sanitation"];
    const departments = await Promise.all(
        departmentNames.map((name) =>
            Department.findOneAndUpdate(
                { name },
                { $set: { isActive: true }, $setOnInsert: { name } },
                { returnDocument: "after", upsert: true, runValidators: true }
            )
        )
    );

    const existing = await User.findOne({ email }).select("+password");
    const requirePassword = () => {
        if (!process.env.ADMIN_PASSWORD) {
            throw new Error("ADMIN_PASSWORD must be set to create the admin or to reset its password.");
        }
        const passwordError = passwordPolicyError(process.env.ADMIN_PASSWORD);
        if (passwordError) throw new Error(`ADMIN_PASSWORD: ${passwordError}`);
        return bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    };

    if (!existing) {
        await User.create({
            name: process.env.ADMIN_NAME || "System Administrator",
            email,
            role: "admin",
            password: await requirePassword(),
        });
        console.log(`Created admin: ${email}`);
    } else if (existing.role !== "admin") {
        throw new Error(`${email} already exists as a "${existing.role}" account. Use a different ADMIN_EMAIL; the seed will not change an account's role.`);
    } else if (resetPassword) {
        existing.password = await requirePassword();
        existing.tokenVersion = (existing.tokenVersion || 0) + 1; // signs out every device
        await existing.save();
        console.log(`Admin password reset on purpose (RESET_ADMIN_PASSWORD=true): ${email}. Old sessions were signed out.`);
    } else {
        console.log(`Admin ${email} already exists: password left unchanged. Set RESET_ADMIN_PASSWORD=true to change it.`);
    }

    console.log(`Seeded departments: ${departments.map((department) => department.name).join(", ")}`);
    await mongoose.disconnect();
};

seed().catch(async (error) => {
    console.error(`Seeding failed: ${error.message}`);
    await mongoose.disconnect();
    process.exitCode = 1;
});
