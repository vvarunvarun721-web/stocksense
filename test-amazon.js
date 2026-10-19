const { chromium } = require("playwright");

async function testAmazonSearch() {

    console.log("🚀 Starting Amazon search test...");

    const browser = await chromium.launch({
        headless: false
    });

    const page = await browser.newPage();

    try {

        console.log("🌐 Opening Amazon...");

        await page.goto("https://www.amazon.in", {
            waitUntil: "domcontentloaded",
            timeout: 60000
        });

        console.log("✅ Amazon loaded");
        console.log("URL:", page.url());

        const searchBox = page.locator("#twotabsearchtextbox");

        await searchBox.waitFor({
            state: "visible",
            timeout: 15000
        });

        console.log("🔍 Search box found");

        await searchBox.fill("Sony WH-1000XM5");

        console.log("✍️ Query entered");

        await page.locator("#nav-search-submit-button").click();

        console.log("🚀 Search submitted");

        await page
            .locator("[data-component-type='s-search-result']")
            .first()
            .waitFor({
                state: "visible",
                timeout: 30000
            });

        console.log("✅ Search results found");

        console.log(
            "Product cards:",
            await page
                .locator("[data-component-type='s-search-result']")
                .count()
        );

        console.log("Current URL:", page.url());

        await page.screenshot({
            path: "amazon-search-test.png",
            fullPage: true
        });

        console.log("📸 Screenshot saved");

    } catch (err) {

        console.error("❌ Amazon search failed:");
        console.error(err.message);

        console.log("Current URL:", page.url());

        try {

            console.log(
                "Search box count:",
                await page.locator("#twotabsearchtextbox").count()
            );

            console.log(
                "Product card count:",
                await page
                    .locator("[data-component-type='s-search-result']")
                    .count()
            );

            await page.screenshot({
                path: "amazon-search-error.png",
                fullPage: true
            });

            console.log("📸 Error screenshot saved");

        } catch (e) {

            console.log(
                "Could not capture debug information:",
                e.message
            );

        }

    } finally {

        await browser.close();

        console.log("🔌 Browser closed");

    }
}

testAmazonSearch();