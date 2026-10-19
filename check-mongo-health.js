require("dotenv").config();

const mongoose = require("mongoose");

(async () => {

    try {

        await mongoose.connect(
            process.env.MONGO_URI
        );

        console.log("✅ MongoDB Connected");

        const stats =
            await mongoose.connection.db.command({
                dbStats: 1,
                maxTimeMS: 5000
            });

        console.dir(
            {
                dataSize: stats.dataSize,
                storageSize: stats.storageSize,
                indexSize: stats.indexSize,
                collections: stats.collections
            },
            {
                depth: null
            }
        );

    } catch (err) {

        console.error(
            "❌ MongoDB health check failed:"
        );

        console.error(
            err.message
        );

    } finally {

        await mongoose.connection.close();

    }

})();