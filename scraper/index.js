const { detectPlatform } = require("../utils/platform");

const amazonScraper = require("./amazon");

async function scrapeProduct(url) {

    const platform = detectPlatform(url);

    switch (platform) {

        case "amazon":
            return await amazonScraper.scrape(url);

        default:
            throw new Error("Platform not supported");

    }

}

module.exports = {
    scrapeProduct
};