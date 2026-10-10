// ============================================================
// STOCKSENSE — RELIANCE DIRECT PRODUCT SCRAPER
// ============================================================

const adapter = require("../services/search/platforms/reliance");
const { createScraper } = require("./_marketplaceDirect");

function normalizeUrl(value) {
    try {
        const u = new URL(value, "https://www.reliancedigital.in");
        if (!/\/product\//i.test(u.pathname)) return null;
        return `https://www.reliancedigital.in${u.pathname}`;
    } catch { return null; }
}

module.exports = createScraper({
    platform: "Reliance",
    host: "https://www.reliancedigital.in",
    adapter,
    timeout: 18000,
    settleMs: 900,
    fallbackThreshold: 0.45,
    normalizeUrl,
    selectors: {
        title: ["h1", "[class*='product-title']", "[class*='ProductTitle']"],
        price: ["[class*='selling-price']", "[class*='price']", "[class*='Price']"],
        priceAttr: ["meta[itemprop='price']", "meta[property='product:price:amount']"],
        image: ["img[alt*='product' i]", "img[class*='image']", "img"],
        imageAttr: [],
        rating: ["[class*='rating']"],
        reviews: ["[class*='review']", "[class*='ratingCount']"],
        availability: ["[class*='stock']", "[class*='availability']", "[class*='soldout']"]
    }
});
