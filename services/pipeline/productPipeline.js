const { scrapeProduct } = require("../../scraper");
const { normalizeProduct } = require("../ai/normalize");
const { generateSearchQueries } = require("../ai/searchGenerator");

async function processProduct(url) {

    console.log("🚀 PRODUCT PIPELINE V2 RUNNING");

    console.log("========== STOCKSENSE PIPELINE ==========");

    console.log("Step 1 : Scraping Product");

    const scraped = await scrapeProduct(url);

    console.log("Scraped Successfully");
    console.dir(scraped, { depth: null });

    console.log("-----------------------------------------");

    console.log("Step 2 : AI Product Normalization");

    const normalized = await normalizeProduct(scraped.title);

    console.dir(normalized, { depth: null });

    console.log("-----------------------------------------");

    console.log("Step 3 : Generate Search Queries");

    const queries = generateSearchQueries(normalized);

    console.dir(queries, { depth: null });

    console.log("-----------------------------------------");

    return {
        scraped,
        normalized,
        queries
    };

}

module.exports = {
    processProduct
};