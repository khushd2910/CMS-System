require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const { User } = require("../models");

const run = async () => {
    if (process.env.CONFIRM_REMOVE_MOBILE_DATA !== "true") {
        throw new Error("Set CONFIRM_REMOVE_MOBILE_DATA=true to remove mobile data from the user collection.");
    }

    await connectDB();
    const collection = User.collection;
    const collectionExists = await mongoose.connection.db
        .listCollections({ name: collection.collectionName })
        .hasNext();
    if (!collectionExists) {
        console.log("The user collection does not exist; there is no mobile data to remove.");
        return;
    }
    const indexes = await collection.listIndexes().toArray();
    const mobileIndex = indexes.find((index) => index.key?.mobileNo);
    if (mobileIndex) await collection.dropIndex(mobileIndex.name);

    const result = await collection.updateMany(
        {},
        {
            $unset: {
                mobileNo: "",
                mobileVerified: "",
                mobileVerificationExpires: "",
                mobileVerificationAttempts: "",
            },
        }
    );
    console.log(`Removed mobile fields from ${result.modifiedCount} user document(s).`);
};

run()
    .catch((error) => {
        console.error(`Mobile data migration failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (mongoose.connection.readyState) await mongoose.disconnect();
    });
