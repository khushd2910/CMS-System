const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        role: {
            type: String,
            enum: ["citizen", "admin", "officer"],
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
