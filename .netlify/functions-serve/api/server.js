require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const { getBrowser } = require("./utils/browser");


// Connect to MongoDB
mongoose.connect(
  process.env.MONGO_URI
)
  .then(() => {

    console.log(
      "✅ MongoDB connected"
    );

    /*
    Start background scheduler only after
    MongoDB connection is ready.
    */

    startScheduler();

  })
  .catch((err) => {

    console.error(
      "❌ MongoDB connection error:",
      err
    );

  });

// Routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);

const analyzeRoutes = require("./routes/analyze");
app.use("/api/analyze", analyzeRoutes);

const searchRoutes = require("./routes/search");
app.use("/api/search", searchRoutes);

const productDetailsRoutes = require("./routes/product");
app.use("/api/product", productDetailsRoutes);

const watchlistRoutes =
  require("./routes/watchlist");

app.use(

  "/api/watchlist",

  watchlistRoutes

);

app.get('/', (req, res) => {
  res.send('StockSense server is alive 🚀');
});

const {
  startScheduler
} = require("./cron");
const checkRoutes = require('./routes/check');
app.use('/api', checkRoutes);

const historyRoutes =
  require("./routes/history");

app.use(

  "/api/history",

  historyRoutes

);

const notificationRoutes =
  require("./routes/notification");

app.use(

  "/api/notifications",

  notificationRoutes

);

const dashboardRoutes = require("./routes/dashboard");

app.use(

  "/api/dashboard",

  dashboardRoutes

);

const PORT = process.env.PORT || 5000;


/*
======================================================
BROWSER WARM-UP

Initialize the same browser instance used by the
Amazon product scraper before accepting normal work.

This removes the Chromium cold-start cost from the
first real product request.
======================================================
*/

async function startServer() {

  try {

    console.log("🔥 Warming Amazon scraper browser...");

    const browser = await getBrowser();

    const page = await browser.newPage();

    await page
      .goto("about:blank", {
        waitUntil: "commit",
        timeout: 5000
      })
      .catch(() => { });

    await page.close();

    console.log("✅ Amazon scraper browser warmed successfully");

  }
  catch (error) {

    console.error(
      "⚠️ Browser warm-up failed:",
      error.message
    );

  }


  app.listen(
    PORT,
    () =>
      console.log(
        `Server running on port ${PORT}`
      )
  );

}

module.exports = app;

if (require.main === module) {
  startServer();
}
