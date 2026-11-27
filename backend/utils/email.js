const nodemailer = require("nodemailer");

let transporter;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
}[character]));

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
    const recipientAccepted = mail.accepted?.some(
        (accepted) => String(accepted).toLowerCase() === to.toLowerCase()
    );
    if (!recipientAccepted) {
        throw Object.assign(new Error("SMTP server did not accept the recipient."), { code: "EMAIL_REJECTED" });
    }

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

const sendVerificationEmail = async ({ email, name, code }) => {
    const subject = "Your email verification code";
    const text = [
        `Hello ${name || "Citizen"},`,
        "",
        "Thank you for registering. Enter this code in the Grievance Redressal Portal to verify your email address:",
        code,
        "",
        "This code expires in 10 minutes and can only be used once.",
        "",
        "If you did not create this account, you can ignore this email.",
    ].join("\n");
    const html = `
        <p>Hello ${escapeHtml(name || "Citizen")},</p>
        <p>Thank you for registering. Enter this code in the Grievance Redressal Portal to verify your email address:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:5px">${escapeHtml(code)}</p>
        <p>This code expires in 10 minutes and can only be used once.</p>
        <p>If you did not create this account, you can ignore this email.</p>
    `;

    return sendEmail({ to: email, subject, text, html });
};

const sendAdminLoginOtpEmail = async ({ email, name, code }) => {
    const subject = "Your administrator sign-in code";
    const text = [
        `Hello ${name || "Administrator"},`,
        "",
        "Enter this one-time code to finish signing in to the Grievance Redressal Portal:",
        code,
        "",
        "This code expires in 5 minutes and can only be used once.",
        "If you did not attempt to sign in, change your password and contact support.",
    ].join("\n");
    const html = `
        <p>Hello ${escapeHtml(name || "Administrator")},</p>
        <p>Enter this one-time code to finish signing in to the Grievance Redressal Portal:</p>
        <p style="font-size:24px;font-weight:bold;letter-spacing:5px">${escapeHtml(code)}</p>
        <p>This code expires in 5 minutes and can only be used once.</p>
        <p>If you did not attempt to sign in, change your password and contact support.</p>
    `;

    return sendEmail({ to: email, subject, text, html });
};

module.exports = {
    sendEmail,
    sendGrievanceStatusEmail,
    sendPasswordResetEmail,
    sendVerificationEmail,
    sendAdminLoginOtpEmail,
};
