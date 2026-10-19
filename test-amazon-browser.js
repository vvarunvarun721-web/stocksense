const { getPage, closePage } = require("./utils/browserPool");

(async () => {

    let page = null;

    try {

        page = await getPage();

        console.log("Opening Amazon product...");

        await page.goto(
            "https://www.amazon.in/gp/product/B00J3QHWJE",
            {
                waitUntil: "commit",
                timeout: 30000
            }
        );

        console.log("URL:", page.url());
        console.log("TITLE:", await page.title());

        await page.waitForTimeout(3000);

        console.log("AFTER 3 SEC URL:", page.url());
        console.log("AFTER 3 SEC TITLE:", await page.title());

    }
    catch (err) {

        console.error(
            "TEST ERROR:",
            err.message
        );

    }
    finally {

        await closePage(page);

    }

})();