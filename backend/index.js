const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth.routes");
const departmentRoutes = require("./routes/department.routes");
const grievanceRoutes = require("./routes/grievance.routes");
const errorHandler = require("./middleware/error-handler");

const app=express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Hello World");
});
app.use("/api/auth", authRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/grievances", grievanceRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function startServer() {
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