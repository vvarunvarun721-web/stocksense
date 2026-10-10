const { getBrowser } = require("../utils/browser");


/*
=====================================================

NORMALIZE URL

Handles:

https://example.com/product
[https://example.com/product](https://example.com/product)
[Amazon](https://example.com/product)

=====================================================
*/

function normalizeUrl(value) {

    if (
        !value ||
        typeof value !== "string"
    ) {

        return null;
    }


    let clean =
        value.trim();


    /*
    =============================================
    MARKDOWN LINK

    [label](https://...)
    =============================================
    */

    const markdownMatch =
        clean.match(
            /^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/i
        );


    if (
        markdownMatch
    ) {

        clean =
            markdownMatch[1];
    }


    /*
    =============================================
    FALLBACK MARKDOWN EXTRACTION
    =============================================
    */

    if (
        clean.includes("](")
    ) {

        const match =
            clean.match(
                /\]\((https?:\/\/[^)\s]+)\)/i
            );


        if (
            match
        ) {

            clean =
                match[1];
        }

    }


    /*
    =============================================
    REMOVE SURROUNDING QUOTES
    =============================================
    */

    clean =
        clean
            .replace(
                /^["']+|["']+$/g,
                ""
            )
            .trim();


    /*
    =============================================
    VALIDATE URL
    =============================================
    */

    try {

        const parsed =
            new URL(
                clean
            );


        return parsed.toString();

    }
    catch (_) {

        return null;
    }

}

/* =====================================================
   UNWRAP AMAZON TRACKING URL
===================================================== */

function unwrapAmazonProductUrl(
    url
) {

    if (
        !url ||
        typeof url !== "string"
    ) {

        return null;

    }


    const cleanUrl =
        url.trim();


    try {

        const parsed =
            new URL(
                cleanUrl
            );


        /*
        -------------------------------------------------
        AMAZON SPONSORED / TRACKING URL

        Example:

        /sspa/click?...&url=%2Fdp%2FB0DGTTKCJX%2F...
        -------------------------------------------------
        */

        const nestedUrl =
            parsed.searchParams.get(
                "url"
            );


        if (
            nestedUrl
        ) {

            const absoluteNestedUrl =
                new URL(
                    nestedUrl,
                    `${parsed.protocol}//${parsed.host}`
                );


            const asinMatch =
                absoluteNestedUrl.pathname.match(
                    /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i
                );


            if (
                asinMatch
            ) {

                return (
                    `https://${parsed.host}/dp/${asinMatch[1].toUpperCase()}`
                );

            }

        }


        /*
        -------------------------------------------------
        ALREADY A NORMAL AMAZON PRODUCT URL
        -------------------------------------------------
        */

        const directAsinMatch =
            parsed.pathname.match(
                /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i
            );


        if (
            directAsinMatch
        ) {

            return (
                `https://${parsed.host}/dp/${directAsinMatch[1].toUpperCase()}`
            );

        }


    }
    catch (_) {

        return cleanUrl;

    }


    return cleanUrl;

}

/*
=====================================================

NORMALIZE IMAGE URL

Handles:

https://...
//m.media-amazon.com/...
[https://...](https://...)

=====================================================
*/

function normalizeImageUrl(value) {

    if (
        !value ||
        typeof value !== "string"
    ) {

        return null;
    }


    let clean =
        value.trim();


    /*
    =============================================
    MARKDOWN LINK
    =============================================
    */

    const markdownMatch =
        clean.match(
            /^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/i
        );


    if (
        markdownMatch
    ) {

        clean =
            markdownMatch[1];
    }


    /*
    =============================================
    FALLBACK MARKDOWN EXTRACTION
    =============================================
    */

    if (
        clean.includes("](")
    ) {

        const match =
            clean.match(
                /\]\((https?:\/\/[^)\s]+)\)/i
            );


        if (
            match
        ) {

            clean =
                match[1];
        }

    }


    /*
    =============================================
    PROTOCOL-RELATIVE IMAGE URL

    //m.media-amazon.com/...
    =============================================
    */

    if (
        clean.startsWith("//")
    ) {

        clean =
            `https:${clean}`;
    }


    /*
    =============================================
    REMOVE SURROUNDING QUOTES
    =============================================
    */

    clean =
        clean
            .replace(
                /^["']+|["']+$/g,
                ""
            )
            .trim();


    /*
    =============================================
    VALIDATE
    =============================================
    */

    try {

        const parsed =
            new URL(
                clean
            );


        return parsed.toString();

    }
    catch (_) {

        return null;
    }

}


/*
=====================================================

SAFE NUMBER PARSER

=====================================================
*/

function parsePrice(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return null;
    }


    const digits =
        String(value)
            .replace(
                /[^\d.]/g,
                ""
            );


    if (
        !digits
    ) {

        return null;
    }


    const number =
        Number(
            digits
        );


    return Number.isFinite(
        number
    )
        ? number
        : null;

}


/*
=====================================================

SAFE RATING PARSER

Examples:

"4.4 out of 5 stars"
"4.5"

=====================================================
*/

function parseRating(value) {

    if (
        !value
    ) {

        return null;
    }


    const match =
        String(value).match(
            /\d+(?:\.\d+)?/
        );


    if (
        !match
    ) {

        return null;
    }


    const rating =
        Number(
            match[0]
        );


    return Number.isFinite(
        rating
    )
        ? rating
        : null;

}


/*
=====================================================

SAFE REVIEW COUNT

=====================================================
*/

function parseReviewCount(value) {

    if (
        !value
    ) {

        return null;
    }


    const digits =
        String(value)
            .replace(
                /[^\d]/g,
                ""
            );


    if (
        !digits
    ) {

        return null;
    }


    const count =
        Number(
            digits
        );


    return Number.isFinite(
        count
    )
        ? count
        : null;

}


/*
=====================================================

AMAZON SCRAPER

Performance-focused implementation.

Important:

    We KEEP the existing architecture:

        getBrowser()
            ↓
        browser.newPage()

    We do NOT use browserPool here.

=====================================================
*/

async function scrape(
    url
) {

    const started =
        Date.now();


    const normalizedInputUrl =
        normalizeUrl(url);

    if (
        !normalizedInputUrl
    ) {

        throw new Error(
            `Invalid Amazon URL: ${url}`
        );

    }

    const cleanInputUrl =
        unwrapAmazonProductUrl(
            normalizedInputUrl
        );

    console.log(
        "Amazon normalized product URL:",
        cleanInputUrl
    );


    if (
        !cleanInputUrl
    ) {

        throw new Error(
            `Invalid Amazon URL: ${url}`
        );

    }


    console.log(
        `Amazon scraper: Starting ${cleanInputUrl}`
    );


    /*
    =============================================
    GET EXISTING BROWSER
    =============================================
    */

    const browserStarted =
        Date.now();


    const browser =
        await getBrowser();


    const page =
        await browser.newPage();


    console.log(
        `Amazon scraper browser/page setup: ${Date.now() -
        browserStarted
        } ms`
    );


    try {

        const navigationStarted =
            Date.now();

        /*
        =====================================================
        FAST NAVIGATION + READINESS
        =====================================================
        
        Start navigation and product-title detection
        at the same time.
        
        This keeps the existing extraction logic
        unchanged while reducing unnecessary waiting.
        =====================================================
        */

        const titlePromise =
            page
                .waitForSelector(
                    "#productTitle",
                    {
                        state:
                            "attached",

                        timeout:
                            3000
                    }
                )
                .catch(
                    () => null
                );


        const navigationPromise =
            page
                .goto(
                    cleanInputUrl,
                    {
                        waitUntil:
                            "commit",

                        timeout:
                            8000
                    }
                )
                .catch(
                    error => {

                        console.log(
                            "Amazon scraper navigation warning:",
                            error.message
                        );

                        return null;

                    }
                );


        await navigationPromise;

        const initialTitle =
            await titlePromise;


        /*
        ==================================================
        COLD-START READINESS RECOVERY
        
        On slow Amazon responses, navigation can complete
        slightly after the initial 3000 ms title watcher.
        
        Do one small bounded retry instead of failing
        immediately.
        
        Warm runs are unaffected because the first watcher
        already succeeds.
        ==================================================
        */

        if (
            !initialTitle
        ) {

            console.log(
                "⚠️ Amazon product title not ready yet. Running short readiness recovery..."
            );


            await page
                .waitForSelector(
                    "#productTitle",
                    {
                        state:
                            "attached",

                        timeout:
                            1500
                    }
                )
                .catch(
                    () => null
                );

        }


        console.log(
            `Amazon scraper navigation/readiness: ${Date.now() -
            navigationStarted
            } ms`
        );


        console.log(
            "Current URL:",
            page.url()
        );


        /*
        =============================================
        PRODUCT READINESS CHECK
        =============================================
        */

        const titleAvailable =
            await page
                .locator(
                    "#productTitle"
                )
                .count()
                .catch(
                    () => 0
                );


        if (
            titleAvailable === 0
        ) {

            throw new Error(
                "Amazon product title was not available"
            );

        }

        /*
        =============================================
        ONE-SHOT EXTRACTION

        Everything is collected inside ONE
        browser-side evaluation.

        =============================================
        */

        const extractionStarted =
            Date.now();


        const raw =
            await page.evaluate(
                () => {

                    /*
                    -------------------------------------
                    TEXT HELPER
                    -------------------------------------
                    */

                    function text(
                        selector
                    ) {

                        const element =
                            document.querySelector(
                                selector
                            );


                        if (
                            !element
                        ) {

                            return null;
                        }


                        return (
                            element.textContent ||
                            ""
                        )
                            .replace(
                                /\s+/g,
                                " "
                            )
                            .trim();

                    }


                    /*
                    -------------------------------------
                    ATTRIBUTE HELPER
                    -------------------------------------
                    */

                    function attribute(
                        selector,
                        name
                    ) {

                        const element =
                            document.querySelector(
                                selector
                            );


                        if (
                            !element
                        ) {

                            return null;
                        }


                        return (
                            element.getAttribute(
                                name
                            ) ||
                            null
                        );

                    }


                    /*
                    =====================================
                    TITLE
                    =====================================
                    */

                    const title =
                        text(
                            "#productTitle"
                        );


                    /*
                    =====================================
                    PRICE
                    =====================================
                    */

                    let price =
                        text(
                            "span.a-price-whole"
                        );


                    if (
                        !price
                    ) {

                        price =
                            text(
                                ".a-price .a-offscreen"
                            );

                    }


                    /*
                    =====================================
                    IMAGE
                    =====================================
                    */

                    let image =
                        attribute(
                            "#landingImage",
                            "src"
                        );


                    if (
                        !image
                    ) {

                        image =
                            attribute(
                                "#landingImage",
                                "data-old-hires"
                            );

                    }


                    /*
                    =====================================
                    RATING
                    =====================================
                    */

                    const rating =
                        text(
                            "span.a-icon-alt"
                        );


                    /*
                    =====================================
                    REVIEWS
                    =====================================
                    */

                    const reviews =
                        text(
                            "#acrCustomerReviewText"
                        );


                    /*
                    =====================================
                    AVAILABILITY
                    =====================================
                    */

                    const availability =
                        text(
                            "#availability span"
                        );


                    /*
                    =====================================
                    RETURN RAW VALUES
                    =====================================
                    */

                    return {

                        title,

                        price,

                        image,

                        rating,

                        reviews,

                        availability

                    };

                }
            );


        console.log(
            `Amazon scraper extraction: ${Date.now() -
            extractionStarted
            } ms`
        );


        /*
        =============================================
        NORMALIZE TITLE
        =============================================
        */

        const cleanTitle =
            raw.title
                ? raw.title
                    .replace(
                        /\|\|/g,
                        " "
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim()
                : null;


        /*
        =============================================
        PRICE
        =============================================
        */

        const currentPrice =
            parsePrice(
                raw.price
            );


        /*
        =============================================
        IMAGE
        =============================================
        */

        const cleanImage =
            normalizeImageUrl(
                raw.image
            );


        /*
        =============================================
        RATING
        =============================================
        */

        const cleanRating =
            parseRating(
                raw.rating
            );


        /*
        =============================================
        REVIEWS
        =============================================
        */

        const reviewCount =
            parseReviewCount(
                raw.reviews
            );


        /*
        =============================================
        AVAILABILITY
        =============================================
        */

        const stockStatus =
            raw.availability
                ? raw.availability
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim()
                : "Unknown";


        /*
        =============================================
        CANONICAL URL

        Always use the original normalized
        product URL.

        =============================================
        */

        const canonicalUrl =
            normalizeUrl(
                cleanInputUrl
            );


        /*
        =============================================
        VALIDATION
        =============================================
        */

        if (
            !cleanTitle
        ) {

            throw new Error(
                "Amazon product title could not be extracted"
            );

        }


        /*
        =============================================
        CLOSE PAGE
        =============================================
        */

        await page.close();


        /*
        =============================================
        FINAL PERFORMANCE LOG
        =============================================
        */

        console.log(
            `Amazon scraper total: ${Date.now() -
            started
            } ms`
        );


        /*
        =============================================
        RETURN CLEAN DATA
        =============================================
        */

        return {

            platform:
                "Amazon",

            url:
                canonicalUrl,

            title:
                cleanTitle,

            currentPrice,

            image:
                cleanImage,

            rating:
                cleanRating,

            reviewCount,

            availability:
                stockStatus

        };

    }

    catch (
    err
    ) {

        await page
            .close()
            .catch(
                () => { }
            );


        console.error(
            "Amazon scraper failed:",
            err.message
        );


        throw err;

    }

}


/*
=====================================================

EXPORT

=====================================================
*/

module.exports = {
    scrape
};