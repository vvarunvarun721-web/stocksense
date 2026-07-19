const { getBrowser } = require("../utils/browser");

async function scrape(url) {

    const browser = await getBrowser();

    const page = await browser.newPage();

    try {

        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 30000
        });

        await page.waitForTimeout(2000);
        console.log("Current URL:", page.url());

        console.log("Page Title:", await page.title());

        await page.waitForSelector("#productTitle", {
            timeout: 10000
        });

        const title = await page
            .locator("span#productTitle")
            .innerText()
            .catch(() => null);

        const priceWhole = await page
            .locator("span.a-price-whole")
            .first()
            .innerText()
            .catch(() => null);

        const currentPrice = priceWhole
            ? Number(priceWhole.replace(/[^\d]/g, ""))
            : null;

        const image = await page
            .locator("#landingImage")
            .first()
            .getAttribute("src")
            .catch(() => null);

        const rating = await page
            .locator("span.a-icon-alt")
            .first()
            .innerText()
            .catch(() => null);

        const reviews = await page
            .locator("#acrCustomerReviewText")
            .first()
            .innerText()
            .catch(() => null);

        const availability = await page
            .locator("#availability span")
            .first()
            .innerText()
            .catch(() => "Unknown");
        await page.close();

        const cleanTitle = title
            ? title.replace(/\|\|/g, " ").trim()
            : null;
        const cleanPrice = currentPrice
            ? Number(String(currentPrice).replace(/[^\d]/g, ""))
            : null;
        const cleanRating = rating
            ? parseFloat(rating)
            : null;
        const reviewCount = reviews
            ? Number(reviews.replace(/[^\d]/g, ""))
            : null;
        const stockStatus = availability
            ? availability.trim()
            : "Unknown";


        return {
            platform: "Amazon",
            url,
            title: cleanTitle,
            currentPrice: cleanPrice,
            image,
            rating: cleanRating,
            reviewCount,
            availability: stockStatus
        };

    } catch (err) {

        await page.close();

        throw err;

    }

}

module.exports = {
    scrape
};