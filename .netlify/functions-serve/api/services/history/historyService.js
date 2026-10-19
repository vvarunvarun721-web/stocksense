const PriceHistory = require("../../models/PriceHistory");

function normalizeStock(value) {
  if (value === true) {
    return true;
  }

  if (value === false) {
    return false;
  }

  const text = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!text) {
    return null;
  }

  if (
    /out[\s-]*of[\s-]*stock/i.test(text) ||
    /outofstock/i.test(text) ||
    /sold[\s-]*out/i.test(text) ||
    /currently[\s-]*unavailable/i.test(text) ||
    /unavailable/i.test(text)
  ) {
    return false;
  }

  if (
    /instock/i.test(text) ||
    /in[\s-]*stock/i.test(text) ||
    /schema\.org\/instock/i.test(text)
  ) {
    return true;
  }

  return null;
}

async function saveSnapshot(product, scrapedProduct) {
  if (!product?._id) {
    throw new Error("Cannot save price snapshot without product ID");
  }

  const sourceUrl = String(scrapedProduct?.url || product?.url || "").trim();

  if (!sourceUrl) {
    throw new Error("Cannot save price snapshot without source URL");
  }

  const price = scrapedProduct?.currentPrice ?? null;

  const stock = normalizeStock(scrapedProduct?.availability);

  /*
    =====================================================
    PREVENT UNNECESSARY DUPLICATE SNAPSHOTS
    =====================================================

    Scheduler runs every 30 minutes.

    If nothing changed, do not create thousands
    of identical records.

    Still keep a periodic checkpoint every 6 hours.
    =====================================================
    */

  const latest = await PriceHistory.findOne({
    productId: product._id,
    sourceUrl,
  })
    .sort({
      checkedAt: -1,
    })
    .lean();

  if (latest) {
    const latestPrice = latest.price ?? null;

    const latestStock = latest.stock ?? null;

    const latestTime = new Date(latest.checkedAt).getTime();

    const age = Date.now() - latestTime;

    const sixHours = 6 * 60 * 60 * 1000;

    const unchanged = latestPrice === price && latestStock === stock;

    if (unchanged && age < sixHours) {
      console.log("📈 Snapshot skipped — no price/stock change");

      return latest;
    }
  }

  const snapshot = await PriceHistory.create({
    productId: product._id,

    sourceUrl,

    platform: scrapedProduct?.platform || product?.platform || null,

    price,

    stock,

    seller: null,

    checkedAt: new Date(),
  });

  console.log("📈 Price Snapshot Saved:", sourceUrl, "₹" + price);

  return snapshot;
}

module.exports = {
  saveSnapshot,
};
