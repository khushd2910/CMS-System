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

module.exports = { sendEmail, sendGrievanceStatusEmail };
