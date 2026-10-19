const { chromium } = require("playwright");

async function run() {

    const browser = await chromium.launch({
        headless: false
    });

    const page = await browser.newPage();

    await page.goto(
        "https://www.vijaysales.com/search/boost",
        {
            waitUntil: "domcontentloaded"
        }
    );

    await page.waitForTimeout(5000);

    const selectors = [

        "div",

        "article",

        "li",

        ".product",

        ".product-card",

        ".card",

        "[data-product-id]",

        "[data-sku]",

        "[class*=product]",

        "[class*=card]",

        "[class*=item]"

    ];

    for (const selector of selectors) {

        try {

            const count = await page.locator(selector).count();

            console.log(selector, "=>", count);

        } catch (e) {

        }

    }

    console.log("Finished");

}

run();