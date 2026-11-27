const mongoose = require("mongoose");

const loginAttemptSchema = new mongoose.Schema(
    {
        identifier: {
            type: String,
            required: true,
            maxlength: 254,
        },
        ip: {
            type: String,
            required: true,
            maxlength: 64,
        },
        reason: {
            type: String,
            enum: ["invalid_credentials", "captcha_failed", "blocked"],
            required: true,
        },
    },
    { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

loginAttemptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });
loginAttemptSchema.index({ identifier: 1, reason: 1, createdAt: -1 });
loginAttemptSchema.index({ ip: 1, reason: 1, createdAt: -1 });
loginAttemptSchema.index({ ip: 1, identifier: 1, reason: 1, createdAt: -1 });

module.exports = mongoose.model("LoginAttempt", loginAttemptSchema);
