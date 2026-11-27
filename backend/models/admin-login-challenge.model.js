const mongoose = require("mongoose");

const adminLoginChallengeSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        tokenVersion: {
            type: Number,
            required: true,
        },
        codeHash: {
            type: String,
            required: true,
            select: false,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        attempts: {
            type: Number,
            default: 0,
            min: 0,
            select: false,
        },
        resendCount: {
            type: Number,
            default: 0,
            min: 0,
            select: false,
        },
        resendAfter: {
            type: Date,
            required: true,
            select: false,
        },
    },
    { timestamps: true }
);

adminLoginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AdminLoginChallenge", adminLoginChallengeSchema);
