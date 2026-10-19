const PriceHistory = require("../../models/PriceHistory");

/*
=====================================================
PRICE ANALYZER
=====================================================

Reads historical prices from MongoDB.

IMPORTANT:
- This file does NOT search Amazon / Flipkart / etc.
- It only analyzes already-stored PriceHistory data.
- Optional sourceUrl restricts analysis to one exact
  product listing URL.

=====================================================
*/

async function analyzePrice(productId, sourceUrl) {
  const startedAt = Date.now();

  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

  /*
  =====================================================
  BUILD HISTORY FILTER
  =====================================================
  */

  const filter = {
    productId,

    checkedAt: {
      $gte: oneYearAgo,
    },
  };

  /*
  Exact URL-specific history when available.
  This prevents prices from different listings being
  mixed together.
  */

  if (sourceUrl) {
    filter.sourceUrl = String(sourceUrl).trim();
  }

  /*
  =====================================================
  FETCH HISTORY
  =====================================================

  We only need:
      price
      checkedAt

  No need to load the complete MongoDB documents.
  =====================================================
  */

  const history = await PriceHistory.find(filter)
    .select({
      price: 1,
      checkedAt: 1,
      _id: 0,
    })
    .sort({
      checkedAt: 1,
    })
    .lean();

  /*
  =====================================================
  VALID PRICE OBSERVATIONS
  =====================================================
  */

  const prices = history
    .map((item) => Number(item.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  /*
  =====================================================
  NO USABLE HISTORY
  =====================================================
  */

  if (prices.length === 0) {
    console.log(
      `📊 Price Analyzer: no usable history for product ${productId}`,
    );

    console.log(`⏱ Price Analyzer: ${Date.now() - startedAt} ms`);

    return null;
  }

  /*
  =====================================================
  PRICE METRICS
  =====================================================
  */

  const currentPrice = prices[prices.length - 1];

  const lowestPrice = Math.min(...prices);

  const highestPrice = Math.max(...prices);

  const averagePrice = Number(
    (prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2),
  );

  /*
  =====================================================
  TREND
  =====================================================
  */

  const firstPrice = prices[0];

  const difference = currentPrice - firstPrice;

  let trend = "STABLE";

  if (difference < 0) {
    trend = "DOWN";
  } else if (difference > 0) {
    trend = "UP";
  }

  /*
  =====================================================
  RESULT
  =====================================================
  */

  const result = {
    currentPrice,

    lowestPrice,

    highestPrice,

    averagePrice,

    totalSnapshots: prices.length,

    trend,

    priceDifference: difference,
  };

  console.log(
    `📊 Price Analyzer: ${prices.length} snapshot(s)` +
      `${sourceUrl ? " | URL-specific" : " | product-wide"}`,
  );

  console.log(`⏱ Price Analyzer: ${Date.now() - startedAt} ms`);

  return result;
}

module.exports = {
  analyzePrice,
};
