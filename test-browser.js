const { getBrowser,closeBrowser } = require("./utils/browser");

async function run() {

    const browser = await getBrowser();

    const page = await browser.newPage();

    await page.goto("https://example.com");

    console.log(await page.title());

    await page.close();

    await closeBrowser();

}

run();