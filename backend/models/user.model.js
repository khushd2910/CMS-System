const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        role: {
            type: String,
            enum: ["citizen", "admin", "manager"],
            required: true,
            default: "citizen",
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        mobileNo: {
            type: String,
            trim: true,
        },
        // Optional citizen profile fields (added for the registration page).
        dateOfBirth: Date,
        gender: {
            type: String,
            enum: ["male", "female", "other", "prefer_not_to_say"],
        },
        preferredLanguage: {
            type: String,
            enum: ["en", "hi", "gu"],
        },
        address: {
            state: { type: String, trim: true },
            district: { type: String, trim: true },
            cityOrTaluka: { type: String, trim: true },
            villageOrWard: { type: String, trim: true },
            line: { type: String, trim: true },
            landmark: { type: String, trim: true },
            pinCode: { type: String, trim: true },
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        passwordResetTokenHash: {
            type: String,
            select: false,
        },
        passwordResetExpires: {
            type: Date,
            select: false,
        },
        departmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Department",
        },
    },
    { timestamps: true }
);

userSchema.index({ departmentId: 1 }, { sparse: true });

module.exports = mongoose.model("User", userSchema);
