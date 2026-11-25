const nodemailer = require("nodemailer");

let transporter;

const getTransporter = () => {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be set in backend/.env.");
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT || 587),
            secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
            service: process.env.SMTP_SERVICE || undefined,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }

    return transporter;
};

const sendEmail = async ({ to, subject, text, html }) => {
    if (!to) {
        throw new Error("Email recipient is required.");
    }

    const mail = await getTransporter().sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html,
    });

    return {
        messageId: mail.messageId,
        accepted: mail.accepted,
        rejected: mail.rejected,
    };
};

const sendGrievanceStatusEmail = async ({ citizenEmail, citizenName, referenceNumber, oldStatus, newStatus, remarks }) => {
    const subject = `Grievance ${referenceNumber} status updated`;
    const text = [
        `Hello ${citizenName || "Citizen"},`,
        "",
        `Your grievance ${referenceNumber} changed from ${oldStatus} to ${newStatus}.`,
        remarks ? `Remarks: ${remarks}` : null,
        "",
        "Grievance Management System",
    ].filter(Boolean).join("\n");

    const html = `
        <p>Hello ${citizenName || "Citizen"},</p>
        <p>Your grievance <strong>${referenceNumber}</strong> changed from
        <strong>${oldStatus}</strong> to <strong>${newStatus}</strong>.</p>
        ${remarks ? `<p><strong>Remarks:</strong> ${remarks}</p>` : ""}
        <p>Grievance Management System</p>
    `;

    return sendEmail({ to: citizenEmail, subject, text, html });
};

const sendPasswordResetEmail = async ({ email, name, resetUrl }) => {
    const subject = "Reset your Grievance System password";
    const text = [
        `Hello ${name || "User"},`,
        "",
        "We received a request to reset your password.",
        `Reset it within 30 minutes using this link: ${resetUrl}`,
        "",
        "If you did not request this, you can ignore this email.",
    ].join("\n");
    const html = `
        <p>Hello ${name || "User"},</p>
        <p>We received a request to reset your password.</p>
        <p><a href="${resetUrl}">Reset my password</a></p>
        <p>This link expires in 30 minutes. If you did not request this, ignore this email.</p>
    `;

    return sendEmail({ to: email, subject, text, html });
};

const sendVerificationEmail = async ({ email, name, verifyUrl }) => {
    const subject = "Verify your email for the Grievance System";
    const text = [
        `Hello ${name || "Citizen"},`,
        "",
        "Thank you for registering. Please confirm your email address within 24 hours using this link:",
        verifyUrl,
        "",
        "If you did not create this account, you can ignore this email.",
    ].join("\n");
    const html = `
        <p>Hello ${name || "Citizen"},</p>
        <p>Thank you for registering. Please confirm your email address:</p>
        <p><a href="${verifyUrl}">Verify my email</a></p>
        <p>This link expires in 24 hours. If you did not create this account, ignore this email.</p>
    `;

    return sendEmail({ to: email, subject, text, html });
};

module.exports = { sendEmail, sendGrievanceStatusEmail, sendPasswordResetEmail, sendVerificationEmail };
