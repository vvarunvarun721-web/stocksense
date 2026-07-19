const { getPage, closePage } = require("../../utils/browserPool");

async function genericSearch(config, query) {

    const page = await getPage();

    try {

        await page.goto(config.baseUrl, {
            waitUntil: "domcontentloaded"
        });

        console.log(`Searching ${config.platform}: ${query}`);

        return [];

    } finally {

        await closePage(page);

    }

}

module.exports = genericSearch;