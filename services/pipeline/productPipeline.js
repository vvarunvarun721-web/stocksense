const { scrapeProduct } = require("../../scraper");
const { normalizeProduct } = require("../ai/normalize");
const { generateSearchQueries } = require("../ai/searchGenerator");

async function processProduct(url) {

    console.log("🚀 PRODUCT PIPELINE V2 RUNNING");

    console.log("========== STOCKSENSE PIPELINE ==========");

    console.log("Step 1 : Scraping Product");

    const scraped = await scrapeProduct(url);

    console.log("Scraped Successfully");
    console.log(scraped);

    console.log("-----------------------------------------");

    console.log("Step 2 : AI Product Normalization");

    const normalized = await normalizeProduct(scraped.title);

    console.log(normalizedText);

   

    console.log("-----------------------------------------");

    console.log("Step 3 : Generate Search Queries");

    console.log("========== NORMALIZED ==========");
    console.dir(normalized, { depth: null });

    const queries = generateSearchQueries(normalized);

    console.log("========== GENERATED QUERIES ==========");
    console.dir(queries, { depth: null });

    console.log("Generated Queries:");
    console.log(queries);

    console.log(queries);

    return {

        scraped,

        normalized,

        queries

    };

}

module.exports = {

    processProduct

};