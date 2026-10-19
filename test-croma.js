const { chromium } = require("playwright");

async function run() {

    const browser = await chromium.launch({

        headless: false

    });

    const page = await browser.newPage();

    await page.goto(
        "https://www.croma.com/search/?text=Boost",
        {
            waitUntil: "domcontentloaded"
        }
    );

    console.log(await page.title());

}

run();