// ============================================================
// STOCKSENSE — NYKAA DIRECT PRODUCT SCRAPER
// ============================================================

const adapter = require("../services/search/platforms/nykaa");
const { createScraper } = require("./_marketplaceDirect");

function normalizeUrl(value) {
    try {
        const u = new URL(value, "https://www.nykaa.com");
        if (!/\/p\//i.test(u.pathname)) return null;
        return `https://www.nykaa.com${u.pathname}`;
    } catch { return null; }
}

module.exports = createScraper({
    platform: "Nykaa",
    host: "https://www.nykaa.com",
    adapter,
    timeout: 18000,
    settleMs: 900,
    fallbackThreshold: 0.45,
    normalizeUrl,
    selectors: {
        title: ["h1", "[class*='product-title']", "[class*='pdp']"],
        price: ["[class*='price']", "[class*='Price']", "[data-test='product-price']"],
        priceAttr: ["meta[itemprop='price']", "meta[property='product:price:amount']"],
        image: ["img[alt*='product' i]", "img[class*='image']", "img"],
        imageAttr: [],
        rating: ["[class*='rating']"],
        reviews: ["[class*='review']", "[class*='ratingCount']"],
        availability: ["[class*='stock']", "[class*='availability']", "[class*='soldout']"]
    }
});
