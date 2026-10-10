// ============================================================
// STOCKSENSE — MEESHO DIRECT PRODUCT SCRAPER
// ============================================================

const adapter = require("../services/search/platforms/meesho");
const { createScraper } = require("./_marketplaceDirect");

function normalizeUrl(value) {
    try {
        const u = new URL(value, "https://www.meesho.com");
        if (!/\/p\//i.test(u.pathname)) return null;
        return `https://www.meesho.com${u.pathname}`;
    } catch { return null; }
}

module.exports = createScraper({
    platform: "Meesho",
    host: "https://www.meesho.com",
    adapter,
    timeout: 18000,
    settleMs: 900,
    fallbackThreshold: 0.45,
    normalizeUrl,
    selectors: {
        title: ["h1", "[data-testid='product-title']", "[class*='ProductTitle']"],
        price: ["[data-testid='product-price']", "[class*='Price']", "[class*='price']"],
        priceAttr: ["meta[itemprop='price']", "meta[property='product:price:amount']"],
        image: ["img[alt*='product' i]", "img[class*='image']", "img"],
        imageAttr: [],
        rating: ["[class*='rating']"],
        reviews: ["[class*='review']", "[class*='ratingCount']"],
        availability: ["[class*='stock']", "[class*='availability']", "[class*='soldout']"]
    }
});
