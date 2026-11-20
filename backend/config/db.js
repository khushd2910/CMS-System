const mongoose = require("mongoose");

const connectDB = async () => {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
        throw new Error("MONGO_URI is not set. Add it to backend/.env.");
    }

    const conn = await mongoose.connect(mongoURI, {
        dbName: process.env.MONGO_DB_NAME || "Grievance_db",
    });
    console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
};

module.exports = connectDB;