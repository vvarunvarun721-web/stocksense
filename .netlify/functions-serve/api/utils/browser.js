const { chromium } = require("playwright");

let browser = null;

async function getBrowser() {
    if (!browser) {
        browser = await chromium.launch({
            headless: true
        });
    }

    return browser;
}

async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
    }
}

module.exports = {
    getBrowser,
    closeBrowser
};