const { chromium } = require("playwright");

async function run() {

    const browser = await chromium.launch({
        headless: false
    });

    const page = await browser.newPage();

    // Print every request made
    page.on("request", request => {

        const url = request.url();

        if (
            url.includes("search") ||
            url.includes("product") ||
            url.includes("listing") ||
            url.includes("query")
        ) {
            console.log(url);
        }

    });

    await page.goto(
        "https://www.vijaysales.com",
        {
            waitUntil: "domcontentloaded"
        }
    );

    console.log("\nNow manually search for Samsung.\n");

    // Keep browser open
    await page.waitForTimeout(60000);

}

run();