// ============================================================
// STOCKSENSE - WATCHLIST BACKGROUND SCHEDULER
// ============================================================
//
// Handles:
//   1. Price-drop notifications
//   2. Out-of-stock -> In-stock detection
//   3. Restock in-app notification
//   4. Restock email notification
//
// IMPORTANT:
//   Restock detection performs a fresh scrape of the saved
//   product URL. It does NOT rely only on old Product data.
//
// ============================================================

const Watchlist = require("../../models/Watchlist");

const Product = require("../../models/Product");

const User = require("../../models/User");

const { scrapeProduct } = require("../../scraper");

const {
  createNotification,
  sendRestockEmail,
} = require("./notificationService");

const { checkWatchlistPrice } = require("./notificationEngine");

// ============================================================
// NORMALIZE AVAILABILITY
// ============================================================

function normalizeAvailability(value) {
  // --------------------------------------------------------
  // BOOLEAN VALUES
  // --------------------------------------------------------

  if (value === false) {
    return false;
  }

  if (value === true) {
    return true;
  }

  // --------------------------------------------------------
  // EMPTY VALUES
  // --------------------------------------------------------

  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim().toLowerCase();

  if (!text) {
    return null;
  }

  // --------------------------------------------------------
  // OUT OF STOCK
  // --------------------------------------------------------

  if (
    /schema\.org\/outofstock/i.test(text) ||
    /out[\s-]*of[\s-]*stock/i.test(text) ||
    /sold[\s-]*out/i.test(text) ||
    /currently[\s-]*unavailable/i.test(text) ||
    /\bunavailable\b/i.test(text) ||
    /\bnotify[\s-]*me\b/i.test(text)
  ) {
    return false;
  }

  // --------------------------------------------------------
  // IN STOCK
  // --------------------------------------------------------

  if (
    /schema\.org\/instock/i.test(text) ||
    /\binstock\b/i.test(text) ||
    /\bin[\s-]*stock\b/i.test(text) ||
    /add[\s-]*to[\s-]*cart/i.test(text) ||
    /buy[\s-]*now/i.test(text)
  ) {
    return true;
  }

  return null;
}

// ============================================================
// SAFE VALUE HELPERS
// ============================================================

function getWatchSourceUrl(watch, product) {
  return (
    watch?.sourceUrl ||
    watch?.productUrl ||
    watch?.url ||
    product?.sourceUrl ||
    product?.url ||
    null
  );
}

function getScrapedPrice(scraped) {
  const value = scraped?.currentPrice ?? scraped?.price ?? null;

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

// ============================================================
// SCRAPER TIMEOUT
// ============================================================
//
// Prevents one broken marketplace page from blocking the
// whole scheduler.
// ============================================================

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    Promise.resolve(promise),

    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Watchlist scrape timeout after ${timeoutMs} ms`));
      }, timeoutMs);
    }),
  ]);
}

// ============================================================
// SAFE FIELD SETTER
// ============================================================
//
// This prevents the scheduler from crashing if a particular
// Mongoose schema has not yet received one of the optional
// fields.
//
// NOTE:
//   For persistent restock monitoring, the fields SHOULD be
//   added to Watchlist schema as described below this code.
// ============================================================

function setWatchField(watch, field, value) {
  if (
    watch &&
    watch.schema &&
    typeof watch.schema.path === "function" &&
    watch.schema.path(field)
  ) {
    watch[field] = value;

    return true;
  }

  return false;
}

// ============================================================
// MAIN SCHEDULER
// ============================================================

async function runWatchlistScheduler() {
  console.log("🔔 Checking Watchlists...");

  const watchlists = await Watchlist.find({
    $or: [
      {
        notifyOnDrop: true,
      },

      {
        notifyOnRestock: true,
      },
    ],
  })
    .populate("productId")
    .populate("userId");

  console.log(`🔔 Watchlists loaded: ${watchlists.length}`);

  let checkedCount = 0;

  let notificationCount = 0;

  let skippedCount = 0;

  for (const watch of watchlists) {
    try {
      // ====================================================
      // VALIDATE REFERENCES
      // ====================================================

      if (!watch.productId) {
        skippedCount++;

        console.log("⚠️ Watchlist skipped: product missing");

        continue;
      }

      if (!watch.userId) {
        skippedCount++;

        console.log("⚠️ Watchlist skipped: user missing");

        continue;
      }

      const product = watch.productId;

      const user = watch.userId;

      checkedCount++;

      // ====================================================
      // CURRENT STORED AVAILABILITY
      // ====================================================

      let previousAvailability = normalizeAvailability(watch.lastAvailability);

      // ====================================================
      // FRESH RESTOCK SCRAPE
      // ====================================================
      //
      // Only scrape when restock monitoring is enabled.
      // Existing price-drop logic does not require a fresh
      // scrape here.
      // ====================================================

      let latestScraped = null;

      let currentAvailability = normalizeAvailability(product.availability);

      if (watch.notifyOnRestock === true || watch.notifyOnDrop === true) {
        const sourceUrl = getWatchSourceUrl(watch, product);

        if (!sourceUrl) {
          console.log(
            `⚠️ Restock monitoring skipped for "${product.title}" because no source URL is stored.`,
          );

          currentAvailability = normalizeAvailability(product.availability);
        } else {
          console.log(`🔄 Restock check: ${product.title}`);

          console.log("   URL:", sourceUrl);

          try {
            latestScraped = await withTimeout(scrapeProduct(sourceUrl), 25000);

            currentAvailability = normalizeAvailability(
              latestScraped?.availability,
            );
            const scrapedPrice = getScrapedPrice(latestScraped);

            if (scrapedPrice !== null && product.schema?.path("currentPrice")) {
              product.currentPrice = scrapedPrice;
            }

            console.log(`   Previous: ${previousAvailability}`);

            console.log(`   Current:  ${currentAvailability}`);

            // ------------------------------------------------
            // UPDATE PRODUCT AVAILABILITY WHEN THE FIELD
            // EXISTS IN THE PRODUCT SCHEMA
            // ------------------------------------------------

            if (product.schema?.path("availability")) {
              if (currentAvailability === "OUT_OF_STOCK") {
                product.availability = false;
              } else if (currentAvailability === "IN_STOCK") {
                product.availability = true;
              } else {
                product.availability = null;
              }

              await product.save();
            }
          } catch (error) {
            console.error(
              `⚠️ Restock scrape failed for "${product.title}": ${error.message}`,
            );

            // ------------------------------------------------
            // IMPORTANT:
            //
            // Do NOT turn a scrape failure into OUT_OF_STOCK.
            // Preserve the previous known state.
            // ------------------------------------------------

            currentAvailability = previousAvailability;
          }
        }
      }

      // ====================================================
      // RESTOCK DETECTION
      // ====================================================
      //
      // Only this exact transition causes notification:
      //
      // OUT_OF_STOCK
      //        ↓
      // IN_STOCK
      //
      // UNKNOWN -> IN_STOCK does NOT notify.
      // ====================================================

      const alreadyNotified = watch.lastRestockNotified === true;

      if (
        watch.notifyOnRestock === true &&
        previousAvailability === "OUT_OF_STOCK" &&
        currentAvailability === "IN_STOCK" &&
        !alreadyNotified
      ) {
        const title = product.title || "Product";

        const notificationMessage = `${title} is back in stock. StockSense detected that it is available again.`;

        // --------------------------------------------------
        // IN-APP NOTIFICATION
        // --------------------------------------------------

        await createNotification(
          user._id,
          product._id,
          "🔔 Product Back In Stock",
          notificationMessage,
        );

        // --------------------------------------------------
        // EMAIL NOTIFICATION
        // --------------------------------------------------

        if (user.email && typeof sendRestockEmail === "function") {
          try {
            const restockPrice =
              getScrapedPrice(latestScraped) ??
              (Number.isFinite(Number(product.currentPrice))
                ? Number(product.currentPrice)
                : null);

            await sendRestockEmail(
              user.email,
              user.name || "there",
              title,
              restockPrice,
              getWatchSourceUrl(watch, product),
            );

            console.log(`📧 Restock email sent to ${user.email}`);
          } catch (emailError) {
            console.error(`⚠️ Restock email failed: ${emailError.message}`);
          }
        }

        // --------------------------------------------------
        // LOCK DUPLICATE NOTIFICATION
        // --------------------------------------------------

        setWatchField(watch, "lastRestockNotified", true);

        notificationCount++;

        console.log(`🔔 Restock notification created for ${title}`);
      }

      // ====================================================
      // PRODUCT BECAME OUT OF STOCK AGAIN
      // ====================================================
      //
      // Reset the lock so the next genuine restock can
      // generate another notification.
      // ====================================================

      if (currentAvailability === "OUT_OF_STOCK") {
        setWatchField(watch, "lastRestockNotified", false);
      }

      // ====================================================
      // STORE LATEST AVAILABILITY
      // ====================================================

      setWatchField(watch, "lastAvailability", currentAvailability);
      // ====================================================
      // PRICE-DROP MONITORING
      // ====================================================

      if (watch.notifyOnDrop === true) {
        const currentPrice =
          getScrapedPrice(latestScraped) ??
          (Number.isFinite(Number(product.currentPrice))
            ? Number(product.currentPrice)
            : null);

        if (currentPrice !== null) {
          const created = await checkWatchlistPrice(product._id, currentPrice);

          notificationCount += Number(created || 0);
        }
      }

      // ====================================================
      // PRICE-DROP MONITORING
      // ====================================================

      if (watch.notifyOnDrop === true) {
        const currentPrice =
          getScrapedPrice(latestScraped) ??
          (Number.isFinite(Number(product.currentPrice))
            ? Number(product.currentPrice)
            : null);

        if (currentPrice !== null) {
          const created = await checkWatchlistPrice(product._id, currentPrice);

          notificationCount += Number(created || 0);
        }
      }

      // ====================================================
      // SAVE WATCHLIST
      // ====================================================

      await watch.save();
    } catch (error) {
      console.error(`❌ Watchlist processing failed: ${error.message}`);
    }
  }

  // ========================================================
  // SUMMARY
  // ========================================================

  console.log("🔔 Watchlist Scheduler Summary");

  console.log(`   Checked: ${checkedCount}`);

  console.log(`   Notifications sent: ${notificationCount}`);

  console.log(`   Skipped: ${skippedCount}`);

  console.log("✅ Watchlist check complete.");
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  runWatchlistScheduler,
};
