const { chromium } = require("playwright");

async function run() {

    const browser = await chromium.launch({
        headless: false
    });

    const page = await browser.newPage();

    await page.goto(
        "https://www.reliancedigital.in/search?q=Samsung",
        {
            waitUntil: "domcontentloaded",
            timeout: 60000
        }
    );

    console.log(await page.title());

}

run();