const mongoose = require("mongoose");

const pendingRegistrationSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
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
            required: true,
        },
        termsAcceptedAt: {
            type: Date,
            required: true,
        },
        verificationCodeHash: {
            type: String,
            required: true,
            select: false,
        },
        verificationExpires: {
            type: Date,
            required: true,
            select: false,
        },
        verificationAttempts: {
            type: Number,
            default: 0,
            min: 0,
            select: false,
        },
        verifiedAt: Date,
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("PendingRegistration", pendingRegistrationSchema);
