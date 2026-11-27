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
        contactNumber: {
            type: String,
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // Existing accounts with this unset remain valid; new citizen registrations set it on creation.
        emailVerified: Boolean,
        emailVerificationTokenHash: {
            type: String,
            select: false,
        },
        emailVerificationExpires: {
            type: Date,
            select: false,
        },
        emailVerificationAttempts: {
            type: Number,
            default: 0,
            min: 0,
            select: false,
        },
        // Optional citizen profile fields (added for the registration page).
        dateOfBirth: Date,
        gender: {
            type: String,
            enum: ["male", "female", "other", "prefer_not_to_say"],
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
        termsAccepted: {
            type: Boolean,
            default: false,
        },
        termsAcceptedAt: Date,
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
        // Goes up by one every time the password is reset. Every login token carries the number it was issued
        // with, so raising it signs out every device that was already logged in (see middleware/auth.js).
        // Accounts created before this field existed count as 0.
        tokenVersion: {
            type: Number,
            default: 0,
            min: 0,
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
