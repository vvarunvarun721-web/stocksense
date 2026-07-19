const { chromium } = require("playwright");

let browser = null;

async function getBrowser() {

    if (!browser) {

        console.log("🚀 Launching Browser Pool...");

        browser = await chromium.launch({

            headless: true

        });

    }

    return browser;
}

async function getPage() {

    const browser = await getBrowser();

    const page = await browser.newPage();

    return page;

}

async function closePage(page) {

    if (page)

        await page.close();

}

async function shutdownBrowser() {

    if (browser) {

        await browser.close();

        browser = null;

    }

}

module.exports = {

    getBrowser,

    getPage,

    closePage,

    shutdownBrowser

};