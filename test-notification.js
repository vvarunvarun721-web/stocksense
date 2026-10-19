require("dotenv").config();

const mongoose = require("mongoose");

const {
    runWatchlistScheduler
} = require("./services/notification/watchlistScheduler");

async function testNotification() {

    try {

        await mongoose.connect(process.env.MONGO_URI);

        console.log("✅ MongoDB connected");

        console.log("🔔 Running Watchlist Scheduler manually...");

        await runWatchlistScheduler();

        console.log("✅ Notification test completed");

    } catch (err) {

        console.error("❌ Test failed:", err.message);

    } finally {

        await mongoose.disconnect();

        console.log("🔌 MongoDB disconnected");

    }
}

testNotification();