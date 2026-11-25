const dotenv = require("dotenv");
const { sendEmail } = require("../utils/email");

dotenv.config();

const testEmail = async () => {
    if (!process.env.TEST_EMAIL) {
        throw new Error("TEST_EMAIL must be set to run the email test.");
    }

    const result = await sendEmail({
        to: process.env.TEST_EMAIL,
        subject: "Grievance System SMTP test",
        text: "This is a test email from the Grievance Management System.",
        html: "<p>This is a test email from the <strong>Grievance Management System</strong>.</p>",
    });

    console.log("Test email sent:", result.messageId);
};

testEmail().catch((error) => {
    console.error(`Email test failed: ${error.message}`);
    process.exitCode = 1;
});
