const {
    getPage,
    closePage
} = require("./utils/browserPool");

(async () => {

    const page = await getPage();

    const matches = [];

    page.on("request", request => {

        try {

            const url = request.url();
            const method = request.method();

            if (
                /meesho\.com/i.test(url) &&
                /search|listing|catalog|product|searchListing/i.test(url)
            ) {

                matches.push({
                    type: "REQUEST",
                    method,
                    url,
                    postData: request.postData() || null
                });

            }

        }
        catch (_) { }

    });

    page.on("response", response => {

        try {

            const url = response.url();
            const contentType =
                (
                    response.headers()["content-type"] ||
                    ""
                ).toLowerCase();

            if (
                /meesho\.com/i.test(url) &&
                (
                    /search|listing|catalog|product/i.test(url)
                ) &&
                (
                    contentType.includes("json") ||
                    contentType.includes("graphql")
                )
            ) {

                matches.push({
                    type: "RESPONSE",
                    status: response.status(),
                    contentType,
                    url
                });

            }

        }
        catch (_) { }

    });

    try {

        await page.goto(
            "https://www.meesho.com/search?q=Boost%20Nutrition%20Drink",
            {
                waitUntil: "domcontentloaded",
                timeout: 30000
            }
        );

        await page.waitForTimeout(10000);

        console.log("\nURL:", page.url());
        console.log("TITLE:", await page.title());

        console.log(
            "\n========== MEESHO SEARCH/LISTING TRAFFIC ==========\n"
        );

        console.dir(
            matches,
            {
                depth: null,
                maxArrayLength: 50
            }
        );

    }
    catch (err) {

        console.error(
            "Meesho inspection failed:",
            err.message
        );

    }
    finally {

        await closePage(page);

    }

})();