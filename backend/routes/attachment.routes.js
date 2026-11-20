const express = require("express");
const { authenticate } = require("../middleware/auth");
const {
    listAttachments,
    uploadAttachment,
    deleteAttachment,
    upload,
} = require("../controller/attachment.controller");

const router = express.Router();

router.get("/grievances/:id/attachments", authenticate, listAttachments);
router.post(
    "/grievances/:id/attachments",
    authenticate,
    upload.single("file"),
    uploadAttachment
);
router.delete("/attachments/:id", authenticate, deleteAttachment);

module.exports = router;
