// ============================================================
// STOCKSENSE — TATACLIQ DIRECT PRODUCT SCRAPER
// ============================================================

const adapter = require("../services/search/platforms/tatacliq");
const { createScraper } = require("./_marketplaceDirect");

function normalizeUrl(value) {
    try {
        const u = new URL(value, "https://www.tatacliq.com");
        if (!/\/p-mp/i.test(u.pathname)) return null;
        return `https://www.tatacliq.com${u.pathname}`;
    } catch { return null; }
}

module.exports = createScraper({
    platform: "Tatacliq",
    host: "https://www.tatacliq.com",
    adapter,
    timeout: 18000,
    settleMs: 900,
    fallbackThreshold: 0.45,
    normalizeUrl,
    selectors: {
        title: ["h1", "[class*='productTitle']", "[class*='product-title']"],
        price: ["[class*='sellingPrice']", "[class*='selling-price']", "[class*='price']"],
        priceAttr: ["meta[itemprop='price']", "meta[property='product:price:amount']"],
        image: ["img[alt*='product' i]", "img[class*='image']", "img"],
        imageAttr: [],
        rating: ["[class*='rating']"],
        reviews: ["[class*='review']", "[class*='ratingCount']"],
        availability: ["[class*='stock']", "[class*='availability']", "[class*='soldout']"]
    }
});
