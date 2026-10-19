const {
    getPage,
    closePage
} = require("./utils/browserPool");

(async () => {

    const page =
        await getPage();

    try {

        await page.goto(
            "https://www.tatacliq.com/",
            {
                waitUntil:
                    "domcontentloaded",
                timeout:
                    30000
            }
        );

        await page.waitForTimeout(
            4000
        );

        console.log(
            "URL:",
            page.url()
        );

        console.log(
            "TITLE:",
            await page.title()
        );

        console.log(
            "INPUTS:",
            await page.locator("input").count()
        );

        console.log(
            "LINKS:",
            await page.locator("a").count()
        );

        const links =
            await page.locator("a").evaluateAll(
                nodes =>
                    nodes
                        .map(
                            a => ({
                                text:
                                    (
                                        a.innerText ||
                                        ""
                                    )
                                        .replace(
                                            /\s+/g,
                                            " "
                                        )
                                        .trim()
                                        .slice(
                                            0,
                                            150
                                        ),

                                href:
                                    a.href || ""
                            })
                        )
                        .filter(
                            item =>
                                /\/p-mp|\/product|\/p\//i.test(
                                    item.href
                                )
                        )
                        .slice(
                            0,
                            50
                        )
            );

        console.log(
            "PRODUCT-LIKE LINKS:"
        );

        console.dir(
            links,
            {
                depth: null
            }
        );

    }
    catch (err) {

        console.error(
            err
        );

    }
    finally {

        await closePage(
            page
        );

    }

})();