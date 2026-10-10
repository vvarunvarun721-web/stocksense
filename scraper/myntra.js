const adapter = require("../services/search/platforms/myntra");
const { createScraper } = require("./_marketplaceDirect");

function normalizeUrl(value) {
    try {
        const u = new URL(value, "https://www.myntra.com");

        if (!/myntra\.com/i.test(u.hostname)) {
            return null;
        }

        return `https://www.myntra.com${u.pathname}`;
    } catch {
        return null;
    }
}

/**
 * Extract Myntra brand from canonical product URL.
 *
 * Example:
 * /mailers/shirts/cahoot/cahoot-men-comfort-textured-opaque-casual-shirt/30431231/buy
 *
 * -> cahoot
 */
function extractBrandFromUrl(url) {
    try {
        const u = new URL(url);

        const parts = u.pathname
            .split("/")
            .map(v => v.trim())
            .filter(Boolean);

        if (parts.length < 3) {
            return null;
        }

        /*
         * Myntra URL patterns commonly contain:
         *
         * /category/brand/product-slug/id/buy
         *
         * or:
         *
         * /category/subcategory/brand/product-slug/id/buy
         *
         * Find the numeric product ID first and use the segment
         * immediately before the product slug.
         */

        const numericIndex = parts.findIndex(part => /^\d+$/.test(part));

        if (numericIndex <= 0) {
            return null;
        }

        const productSlug = parts[numericIndex - 1];

        if (!productSlug) {
            return null;
        }

        /*
         * The segment before the product slug is normally the brand.
         */
        const brandIndex = numericIndex - 2;

        if (brandIndex < 0) {
            return null;
        }

        const brand = parts[brandIndex];

        if (!brand) {
            return null;
        }

        /*
         * Avoid treating generic category names as brands.
         */
        const blocked = new Set([
            "shirts",
            "tshirts",
            "t-shirts",
            "tops",
            "jeans",
            "trousers",
            "jackets",
            "dresses",
            "clothing",
            "men",
            "women",
            "kids",
            "boys",
            "girls",
            "accessories",
            "footwear",
            "shoes",
            "sports",
            "beauty",
            "bags",
            "watches"
        ]);

        if (blocked.has(brand.toLowerCase())) {
            return null;
        }

        return brand
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, c => c.toUpperCase())
            .trim();

    } catch {
        return null;
    }
}

const scraper = createScraper({
    platform: "Myntra",
    host: "https://www.myntra.com",
    adapter,

    timeout: 18000,
    settleMs: 900,
    fallbackThreshold: 0.45,

    normalizeUrl,

    selectors: {
        title: [
            "h1.pdp-name",
            "h1",
            "[class*='pdp-title']"
        ],

        price: [
            ".pdp-price",
            "[class*='pdp-price']",
            "[class*='price']"
        ],

        priceAttr: [
            "meta[itemprop='price']",
            "meta[property='product:price:amount']"
        ],

        image: [
            "img[alt*='product' i]",
            "img[class*='image']",
            "img"
        ],

        imageAttr: [],

        rating: [
            "[class*='rating']"
        ],

        reviews: [
            "[class*='review']",
            "[class*='ratingCount']"
        ],

        availability: [
            "[class*='stock']",
            "[class*='availability']",
            "[class*='soldout']"
        ]
    }
});

/**
 * Wrap the generic scraper so we can add Myntra-specific
 * deterministic information without changing _marketplaceDirect.
 */
const originalScrape = scraper.scrape.bind(scraper);

scraper.scrape = async function (url) {
    const result = await originalScrape(url);

    if (!result) {
        return result;
    }

    /*
     * Myntra brand is much more reliable from the canonical URL
     * than from generic DOM selectors.
     */
    if (!result.brand) {
        const brand = extractBrandFromUrl(result.url || url);

        if (brand) {
            result.brand = brand;
            console.log(`🏷️ Myntra brand extracted from URL: ${brand}`);
        }
    }

    return result;
};

module.exports = scraper;