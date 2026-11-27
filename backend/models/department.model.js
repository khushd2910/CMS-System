const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        code: {
            type: String,
            trim: true,
            uppercase: true,
            unique: true,
            sparse: true,
        },
        description: {
            type: String,
            trim: true,
        },
        contactEmail: {
            type: String,
            trim: true,
            lowercase: true,
        },
        contactNumber: {
            type: String,
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Department", departmentSchema);
