// ============================================================
// STOCKSENSE — AJIO DIRECT PRODUCT SCRAPER
// ============================================================

const adapter = require("../services/search/platforms/ajio");
const { createScraper } = require("./_marketplaceDirect");

function normalizeUrl(value) {
    try {
        const u = new URL(value, "https://www.ajio.com");
        if (!/\/p\//i.test(u.pathname)) return null;
        return `https://www.ajio.com${u.pathname}`;
    } catch { return null; }
}

module.exports = createScraper({
    platform: "Ajio",
    host: "https://www.ajio.com",
    adapter,
    timeout: 18000,
    settleMs: 900,
    fallbackThreshold: 0.45,
    normalizeUrl,
    selectors: {
        title: ["h1", ".prod-name", ".pdp-product-name", "[class*='prod-name']", "[class*='product-name']"],
        price: [".prod-sp", ".prod-discnt-price", ".price", ".pdp-price", "[class*='price']"],
        priceAttr: ["meta[itemprop='price']", "meta[property='product:price:amount']"],
        image: ["img[alt*='product' i]", "img[class*='image']", "img"],
        imageAttr: [],
        rating: ["[class*='rating']"],
        reviews: ["[class*='review']", "[class*='ratingCount']"],
        availability: ["[class*='stock']", "[class*='availability']", "[class*='soldout']"]
    }
});
