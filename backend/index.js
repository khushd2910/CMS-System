const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth.routes");
const departmentRoutes = require("./routes/department.routes");
const grievanceRoutes = require("./routes/grievance.routes");
const adminRoutes = require("./routes/admin.routes");
const attachmentRoutes = require("./routes/attachment.routes");
const notificationRoutes = require("./routes/notification.routes");
const errorHandler = require("./middleware/error-handler");
const { parseTrustProxy } = require("./config/trust-proxy");

const app=express();
// Needed behind a reverse proxy so req.ip is the visitor, not the proxy (see config/trust-proxy.js).
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== undefined) app.set("trust proxy", trustProxy);
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Hello World");
});
app.use("/api/auth", authRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/grievances", grievanceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", attachmentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function startServer() {
    if (process.env.NODE_ENV === "production" && trustProxy === undefined) {
        console.warn("[security] TRUST_PROXY is not set. If this server runs behind a proxy or load balancer, set TRUST_PROXY=1 (number of proxies) so IP-based lock-outs and the audit trail see the real visitor.");
    }
    await connectDB();
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

if (require.main === module) {
    startServer().catch((error) => {
    console.error(`Failed to start server: ${error.message}`);
    process.exitCode=1;
    });
}

module.exports = { app, startServer };