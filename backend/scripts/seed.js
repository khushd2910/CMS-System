const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const { User, Department } = require("../models");

dotenv.config();

const seed = async () => {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
        throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set before seeding.");
    }
    if (process.env.ADMIN_PASSWORD.length < 8) {
        throw new Error("ADMIN_PASSWORD must be at least 8 characters.");
    }

    await connectDB();

    const departmentNames = ["Public Works", "Water Supply", "Electricity", "Sanitation"];
    const departments = await Promise.all(
        departmentNames.map((name) =>
            Department.findOneAndUpdate(
                { name },
                { $set: { isActive: true }, $setOnInsert: { name } },
                { new: true, upsert: true, runValidators: true }
            )
        )
    );

    const password = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    const admin = await User.findOneAndUpdate(
        { email: process.env.ADMIN_EMAIL.trim().toLowerCase() },
        {
            $set: {
                name: process.env.ADMIN_NAME || "System Administrator",
                role: "admin",
                password,
            },
        },
        {
            new: true,
            upsert: true,
            runValidators: true,
            setDefaultsOnInsert: true,
        }
    );

    console.log(`Seeded admin: ${admin.email}`);
    console.log(`Seeded departments: ${departments.map((department) => department.name).join(", ")}`);
    await require("mongoose").disconnect();
};

seed().catch(async (error) => {
    console.error(`Seeding failed: ${error.message}`);
    await require("mongoose").disconnect();
    process.exitCode = 1;
});
