const Watchlist = require("../../models/Watchlist");
const Product = require("../../models/Product");
const { createNotification } = require("./notificationService");

async function checkWatchlistPrice(productId, latestPrice) {
  const numericPrice = Number(latestPrice);

  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    return 0;
  }

  const watchlists = await Watchlist.find({
    productId,
    notifyOnDrop: true,
  });

  if (!watchlists.length) {
    return 0;
  }

  const product = await Product.findById(productId);

  const productTitle =
    product?.title || product?.name || "Your watched product";

  let notificationCount = 0;

  for (const item of watchlists) {
    const targetPrice =
      item.targetPrice == null ? null : Number(item.targetPrice);

    // No valid target price configured
    if (!Number.isFinite(targetPrice)) {
      continue;
    }

    // Price has not reached target yet
    if (numericPrice > targetPrice) {
      continue;
    }

    const lastNotifiedPrice =
      item.lastNotifiedPrice == null ? null : Number(item.lastNotifiedPrice);

    /*
     * First time target is reached:
     *     null -> notify
     *
     * Later:
     *     only notify when price becomes lower
     *     than the previously notified price.
     */
    const shouldNotify =
      lastNotifiedPrice === null || numericPrice < lastNotifiedPrice;

    if (!shouldNotify) {
      continue;
    }

    let message;

    if (lastNotifiedPrice === null) {
      message =
        `${productTitle} has reached your target price of ₹${targetPrice}. ` +
        `Current price: ₹${numericPrice}.`;
    } else {
      message =
        `${productTitle} dropped again from ₹${lastNotifiedPrice} ` +
        `to ₹${numericPrice}.`;
    }

    await createNotification(
      item.userId,
      productId,
      "🔥 Price Drop Alert",
      message,
    );

    // Watchlist schema already contains this field
    item.lastNotifiedPrice = numericPrice;
    await item.save();

    notificationCount++;

    console.log(
      `🔔 Price-drop notification created: ${productTitle} → ₹${numericPrice}`,
    );
  }

  return notificationCount;
}

module.exports = {
  checkWatchlistPrice,
};
