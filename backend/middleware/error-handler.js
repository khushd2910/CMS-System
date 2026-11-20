const errorHandler = (error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.name === "ValidationError") {
        return res.status(400).json({
            message: "Request validation failed.",
            errors: Object.values(error.errors).map((item) => item.message),
        });
    }

    if (error.code === 11000) {
        return res.status(409).json({
            message: `A record with the same ${Object.keys(error.keyPattern).join(", ")} already exists.`,
        });
    }

    if (error.name === "CastError") {
        return res.status(400).json({ message: `Invalid ${error.path}.` });
    }

    if (error.name === "MulterError") {
        return res.status(400).json({ message: error.code === "LIMIT_FILE_SIZE"
            ? "Attachment exceeds the 10 MB limit."
            : "Attachment upload failed." });
    }

    if (error.message && [
        "Only JPG, PNG, WEBP, and PDF attachments are allowed.",
        "An attachment file is required.",
    ].includes(error.message)) {
        return res.status(400).json({ message: error.message });
    }

    if (error.http_code) {
        return res.status(502).json({ message: "External storage service is unavailable." });
    }

    console.error(error);
    return res.status(500).json({ message: "An unexpected server error occurred." });
};

module.exports = errorHandler;
