const {

    getPage,

    closePage,

    shutdownBrowser

} = require("./utils/browserPool");

async function run() {

    const page1 = await getPage();

    await page1.goto("https://example.com");

    console.log(await page1.title());

    const page2 = await getPage();

    await page2.goto("https://example.com");

    console.log(await page2.title());

    await closePage(page1);

    await closePage(page2);

    await shutdownBrowser();

}

run();