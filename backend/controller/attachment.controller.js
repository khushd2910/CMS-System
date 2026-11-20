const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const { Attachment, Grievance } = require("../models");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        if (!allowed.includes(file.mimetype)) {
            return callback(new Error("Only JPG, PNG, WEBP, and PDF attachments are allowed."));
        }
        return callback(null, true);
    },
});

const canManage = (grievance, user) =>
    user.role === "admin" ||
    String(grievance.citizenId) === String(user._id) ||
    (user.role === "officer" &&
        (String(grievance.assignedOfficerId || "") === String(user._id) ||
            String(grievance.departmentId || "") === String(user.departmentId)));

const uploadToCloudinary = (file) =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder: "grievance-attachments", resource_type: "auto" },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(file.buffer);
    });

const listAttachments = async (req, res, next) => {
    try {
        const grievance = await Grievance.findById(req.params.id);
        if (!grievance) return res.status(404).json({ message: "Grievance not found." });
        if (!canManage(grievance, req.user)) {
            return res.status(403).json({ message: "You are not authorized to view these attachments." });
        }
        const attachments = await Attachment.find({ grievanceId: grievance._id })
            .populate("uploadedBy", "name role")
            .sort({ uploadedAt: -1 });
        return res.json({ attachments });
    } catch (error) {
        return next(error);
    }
};

const uploadAttachment = async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ message: "An attachment file is required." });
        const grievance = await Grievance.findById(req.params.id);
        if (!grievance) return res.status(404).json({ message: "Grievance not found." });
        if (!canManage(grievance, req.user)) {
            return res.status(403).json({ message: "You are not authorized to upload attachments." });
        }

        const result = await uploadToCloudinary(req.file);
        const attachment = await Attachment.create({
            grievanceId: grievance._id,
            uploadedBy: req.user._id,
            fileName: req.file.originalname,
            fileUrl: result.secure_url,
            publicId: result.public_id,
            fileType: req.file.mimetype,
        });
        return res.status(201).json({ attachment });
    } catch (error) {
        return next(error);
    }
};

const deleteAttachment = async (req, res, next) => {
    try {
        const attachment = await Attachment.findById(req.params.id);
        if (!attachment) return res.status(404).json({ message: "Attachment not found." });
        const grievance = await Grievance.findById(attachment.grievanceId);
        if (!grievance || (!canManage(grievance, req.user) && String(attachment.uploadedBy) !== String(req.user._id))) {
            return res.status(403).json({ message: "You are not authorized to delete this attachment." });
        }

        await cloudinary.uploader.destroy(attachment.publicId, { resource_type: "image" });
        await attachment.deleteOne();
        return res.json({ message: "Attachment deleted successfully." });
    } catch (error) {
        return next(error);
    }
};

module.exports = { upload, listAttachments, uploadAttachment, deleteAttachment };
