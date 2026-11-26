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
        // Unique (when present) so a citizen can sign in with their mobile number.
        // Stored as 10 digits, e.g. "9876543210". If your database already holds duplicate mobile
        // numbers, MongoDB cannot build this index until they are fixed.
        mobileNo: {
            type: String,
            trim: true,
            unique: true,
            sparse: true,
        },
        // Email verification. Left unset for existing accounts (treated as verified);
        // new citizen accounts may require a one-time email code.
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
