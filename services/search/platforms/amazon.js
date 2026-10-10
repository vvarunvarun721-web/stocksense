const {
    getPage,
    closePage
} = require("../../../utils/browserPool");

const axios =
    require("axios");

const cheerio =
    require("cheerio");

const BaseAdapter =
    require("./baseAdapter");


class AmazonAdapter extends BaseAdapter {

    constructor() {

        super("Amazon");


        /*
        =====================================================
        CACHE
        =====================================================
        */

        this.searchCache =
            new Map();


        /*
        Prevent duplicate concurrent searches for the
        same StockSense product.

        Example:

            search(query1, product)
            search(query2, product)
            search(query3, product)

        can all point to the same in-flight promise.
        */

        this.inFlightSearches =
            new Map();


        this.cacheTtl =
            60 * 1000;


        /*
        Maximum final products returned by this adapter.
        */

        this.maxResults =
            8;

        /*
        =====================================================
        AMAZON QUERY CONCURRENCY
        =====================================================

        Amazon is more stable when we don't navigate too many
        search pages simultaneously.

        This is Amazon-specific.

        Different users can still run concurrently because
        browserPool handles global page concurrency.
        =====================================================
        */

    }




    /*
    =====================================================
    SAFE TEXT CLEANER
    =====================================================
    */

    cleanText(
        value
    ) {

        return String(
            value ?? ""
        )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    }


    /*
    =====================================================
    AMAZON TITLE CLEANER
    =====================================================
    */

    cleanAmazonTitle(
        value
    ) {

        if (
            !value ||
            typeof value !==
            "string"
        ) {

            return "";

        }


        let title =
            value
                .toString()
                .trim();


        /*
        Remove Amazon advertising text.
        */

        title =
            title
                .replace(
                    /Sponsored/gi,
                    " "
                )
                .replace(
                    /You are seeing this ad based on the product'?s relevance to your search query\.?/gi,
                    " "
                )
                .replace(
                    /Let us know/gi,
                    " "
                )
                .replace(
                    /Sponsored Ad\s*-\s*/gi,
                    " "
                );


        /*
        Normalize separators.
        */

        title =
            title
                .replace(
                    /\|\|+/g,
                    " "
                )
                .replace(
                    /\s*\|\s*/g,
                    " | "
                );


        title =
            title.replace(
                /\s*&\s*/g,
                " & "
            );


        /*
        BOOSTChocolate
        ->
        BOOST Chocolate
        */

        title =
            title.replace(
                /([A-Z]{2,})([A-Z][a-z])/g,
                "$1 $2"
            );


        /*
        TimelessEveryday
        ->
        Timeless Everyday
        */

        title =
            title.replace(
                /([a-z])([A-Z])/g,
                "$1 $2"
            );


        /*
        Drink800
        ->
        Drink 800
        */

        title =
            title.replace(
                /([A-Za-z])(\d)/g,
                "$1 $2"
            );


        /*
        800g
        ->
        800 g
        */

        title =
            title.replace(
                /(\d)([A-Za-z])/g,
                "$1 $2"
            );


        title =
            title.replace(
                /(\d)\s*[xX]\s*(\d)/g,
                "$1 x $2"
            );


        title =
            title
                .replace(
                    /\s*,\s*/g,
                    ", "
                )
                .replace(
                    /\s*:\s*/g,
                    ": "
                )
                .replace(
                    /\s*-\s*/g,
                    " - "
                )
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();


        return title;

    }


    /*
    =====================================================
    SAFE PRICE PARSER
    =====================================================
    */

    parsePrice(
        value
    ) {

        if (
            value === null ||
            value === undefined
        ) {

            return null;

        }


        const match =
            String(
                value
            )
                .match(
                    /₹\s*([\d,]+(?:\.\d+)?)/
                );


        if (
            !match
        ) {

            const digits =
                String(
                    value
                )
                    .replace(
                        /[^\d.]/g,
                        ""
                    );


            if (
                !digits
            ) {

                return null;

            }


            const fallback =
                Number(
                    digits
                );


            return Number.isFinite(
                fallback
            )
                ? fallback
                : null;

        }


        const price =
            Number(
                match[1]
                    .replace(
                        /,/g,
                        ""
                    )
            );


        return Number.isFinite(
            price
        )
            ? price
            : null;

    }


    /*
    =====================================================
    NORMALIZE AMAZON PRODUCT URL
    =====================================================
    */

    normalizeProductUrl(
        value
    ) {

        if (
            !value ||
            typeof value !==
            "string"
        ) {

            return null;

        }


        try {

            const parsed =
                new URL(
                    value,
                    "https://www.amazon.in"
                );


            /*
            Reject advertising redirects.
            */

            if (
                parsed.pathname.includes(
                    "/sspa/"
                ) ||
                parsed.pathname.includes(
                    "/slredirect/"
                )
            ) {

                return null;

            }


            const dpMatch =
                parsed.pathname.match(
                    /\/dp\/([A-Z0-9]+)/i
                );


            if (
                dpMatch
            ) {

                return (
                    "https://www.amazon.in/dp/" +
                    dpMatch[1]
                );

            }


            const gpMatch =
                parsed.pathname.match(
                    /\/gp\/product\/([A-Z0-9]+)/i
                );


            if (
                gpMatch
            ) {

                return (
                    "https://www.amazon.in/gp/product/" +
                    gpMatch[1]
                );

            }


            return null;

        }
        catch (_) {

            return null;

        }

    }


    /*
    =====================================================
    BUILD AMAZON QUERY LADDER
    =====================================================

    Specific product:

        Q1 = brand + product + weight + flavour
        Q2 = brand + product + flavour
        Q3 = brand + product

    Generic product:

        Q1 = supplied query

    All specific queries are executed in parallel.
    =====================================================
    */

    buildSearchQueries(
        query,
        originalProduct = {}
    ) {

        const product =
            originalProduct || {};


        const brand =
            this.cleanText(
                product.brand
            );


        const productName =
            this.cleanText(
                product.productName
            );


        const model =
            this.cleanText(
                product.model
            );


        const variant =
            this.cleanText(
                product.variant
            );


        const weight =
            this.cleanText(
                product.weight
            );


        const flavour =
            this.cleanText(
                product.flavour
            );


        const color =
            this.cleanText(
                product.color
            );


        const queries = [];


        /*
        =============================================
        Q1 — MOST SPECIFIC
        =============================================
        */

        const q1 =
            this.normalizeSearchQuery(
                [
                    brand,
                    productName,
                    model,
                    variant,
                    weight,
                    flavour,
                    color
                ]
                    .filter(Boolean)
                    .join(" ")
            );


        if (
            q1
        ) {

            queries.push(
                q1
            );

        }


        /*
        =============================================
        Q2 — CORE + FLAVOUR
        =============================================
        */

        const q2 =
            this.normalizeSearchQuery(
                [
                    brand,
                    productName,
                    model,
                    variant,
                    flavour
                ]
                    .filter(Boolean)
                    .join(" ")
            );


        if (
            q2 &&
            !queries.includes(
                q2
            )
        ) {

            queries.push(
                q2
            );

        }


        /*
        =============================================
        Q3 — BRAND + CORE
        =============================================
        */

        const q3 =
            this.normalizeSearchQuery(
                [
                    brand,
                    productName
                ]
                    .filter(Boolean)
                    .join(" ")
            );


        if (
            q3 &&
            !queries.includes(
                q3
            )
        ) {

            queries.push(
                q3
            );

        }


        /*
        Generic fallback.
        */

        if (
            queries.length === 0 &&
            query
        ) {

            queries.push(
                this.normalizeSearchQuery(
                    query
                )
            );

        }


        return [
            ...new Set(
                queries
                    .filter(Boolean)
            )
        ]
            .slice(
                0,
                3
            );

    }

    /* 
    =====================================================
    NORMALIZE SEARCH QUERY
    =====================================================
    */

    normalizeSearchQuery(
        query
    ) {

        let value =
            String(
                query ?? ""
            )
                .trim();


        /*
        =====================================================
        PROTECT AMAZON ASIN
        =====================================================
    
        Example:
    
            B0DGTTKCJX
    
        MUST remain:
    
            B0DGTTKCJX
    
        It must NOT become:
    
            B 0 DGTTKCJX
        =====================================================
        */

        const asinPlaceholders =
            [];


        value =
            value.replace(
                /\bB0[A-Z0-9]{8}\b/gi,
                match => {

                    const index =
                        asinPlaceholders.length;


                    asinPlaceholders.push(
                        match.toUpperCase()
                    );


                    return (
                        `__STOCKSENSE_ASIN_${index}__`
                    );

                }
            );


        /*
        =====================================================
        NORMAL TEXT NORMALIZATION
        =====================================================
        */

        /*
        800g
        ->
        800 g
        */

        value =
            value.replace(
                /(\d)([A-Za-z])/g,
                "$1 $2"
            );


        /*
        Drink800
        ->
        Drink 800
        */

        value =
            value.replace(
                /([A-Za-z])(\d)/g,
                "$1 $2"
            );


        /*
        =====================================================
        RESTORE AMAZON ASIN
        =====================================================
        */

        value =
            value.replace(
                /__STOCKSENSE_ASIN_(\d+)__/g,
                (
                    _match,
                    index
                ) => {

                    return (
                        asinPlaceholders[
                        Number(index)
                        ] || ""
                    );

                }
            );


        /*
        =====================================================
        FINAL CLEANUP
        =====================================================
        */

        return value
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    }

    /*
=====================================================
DIRECT AMAZON ASIN HTTP RECOVERY
=====================================================

Search-by-ASIN is not guaranteed to render the exact
product as a search-result card.

When that happens, fetch the canonical Amazon product
page directly and extract the product information from
the returned HTML.

This method is used ONLY when an exact ASIN is known.

=====================================================
*/

    async recoverExactAsinProduct(
        asin,
        timeout = 2200
    ) {

        const normalizedAsin =
            String(
                asin || ""
            )
                .trim()
                .toUpperCase();


        if (
            !/^B0[A-Z0-9]{8}$/.test(
                normalizedAsin
            )
        ) {

            return null;

        }


        const started =
            Date.now();


        const url =
            `https://www.amazon.in/dp/${normalizedAsin}`;


        try {

            console.log(
                `🔐 Amazon direct HTTP ASIN recovery starting: ${normalizedAsin}`
            );


            const response =
                await axios.get(
                    url,
                    {

                        timeout:
                            Math.max(
                                500,
                                Number(timeout) || 2200
                            ),

                        maxRedirects:
                            5,

                        headers: {

                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

                            "Accept":
                                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

                            "Accept-Language":
                                "en-IN,en;q=0.9",

                            "Cache-Control":
                                "no-cache",

                            "Pragma":
                                "no-cache"

                        },

                        validateStatus:
                            status =>
                                status >= 200 &&
                                status < 400

                    }
                );


            const html =
                String(
                    response.data || ""
                );


            if (
                html.length < 1000
            ) {

                console.log(
                    `⚠️ Amazon direct HTTP ASIN recovery returned insufficient HTML (${html.length} bytes)`
                );

                return null;

            }


            const $ =
                cheerio.load(
                    html
                );


            const clean =
                value =>
                    String(
                        value || ""
                    )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();


            /*
            =============================================
            TITLE
            =============================================
            */

            let title =
                clean(
                    $("#productTitle")
                        .first()
                        .text()
                );


            if (
                !title
            ) {

                title =
                    clean(
                        $("meta[property='og:title']")
                            .first()
                            .attr("content")
                    );

            }


            if (
                !title
            ) {

                title =
                    clean(
                        $("h1#title")
                            .first()
                            .text()
                    );

            }


            /*
            =============================================
            PRICE
            =============================================
            */

            const priceSelectors = [

                "#corePriceDisplay_desktop_feature_div .a-offscreen",

                "#corePriceDisplay_desktop_feature_div .a-price .a-offscreen",

                "#corePrice_feature_div .a-offscreen",

                "#apex_desktop .a-offscreen",

                "#priceblock_ourprice",

                "#priceblock_dealprice",

                "#priceblock_saleprice",

                "span.a-price span.a-offscreen",

                ".a-price .a-offscreen"

            ];


            let price =
                null;


            for (
                const selector
                of priceSelectors
            ) {

                const raw =
                    clean(
                        $(selector)
                            .first()
                            .text()
                    );


                if (
                    !raw
                ) {

                    continue;

                }


                const match =
                    raw.match(
                        /₹\s*([\d,]+(?:\.\d+)?)/i
                    );


                if (
                    !match
                ) {

                    continue;

                }


                const parsed =
                    Number(
                        match[1]
                            .replace(
                                /,/g,
                                ""
                            )
                    );


                if (
                    Number.isFinite(
                        parsed
                    )
                ) {

                    price =
                        parsed;

                    break;

                }

            }


            /*
            Meta price fallback.
            */

            if (
                !Number.isFinite(
                    price
                )
            ) {

                const metaPrice =
                    clean(
                        $("meta[property='product:price:amount']")
                            .first()
                            .attr("content")
                    );


                const parsedMeta =
                    Number(
                        metaPrice
                    );


                if (
                    Number.isFinite(
                        parsedMeta
                    )
                ) {

                    price =
                        parsedMeta;

                }

            }


            /*
            =============================================
            IMAGE
            =============================================
            */

            let image =
                clean(
                    $("#landingImage")
                        .first()
                        .attr("data-old-hires")
                );


            if (
                !image
            ) {

                image =
                    clean(
                        $("#landingImage")
                            .first()
                            .attr("src")
                    );

            }


            if (
                !image
            ) {

                image =
                    clean(
                        $("meta[property='og:image']")
                            .first()
                            .attr("content")
                    );

            }


            /*
            =============================================
            VALIDATION
            =============================================
            */

            if (
                !title ||
                !Number.isFinite(
                    price
                )
            ) {

                console.log(
                    `⚠️ Amazon direct HTTP ASIN recovery incomplete for ${normalizedAsin}:`,
                    {
                        title:
                            title || null,

                        price:
                            Number.isFinite(
                                price
                            )
                                ? price
                                : null
                    }
                );


                return null;

            }


            title =
                this.cleanAmazonTitle(
                    title
                );


            console.log(
                `✅ Amazon direct HTTP ASIN recovery succeeded: ${normalizedAsin} in ${Date.now() - started}ms`
            );


            return {

                platform:
                    "Amazon",

                title,

                price,

                image:
                    image || null,

                url,

                availability:
                    true

            };

        }
        catch (
        error
        ) {

            console.log(
                `⚠️ Amazon direct HTTP ASIN recovery failed for ${normalizedAsin} after ${Date.now() - started}ms: ${error.message}`
            );


            return null;

        }

    }

    /*
    =====================================================
    EXTRACT RESULTS FROM CURRENT PAGE
    =====================================================
    */

    async extractSearchResults(
        page,
        targetAsin = null
    ) {

        const primarySelector =
            "[data-component-type='s-search-result']";

        const backupSelector =
            "div.s-result-item[data-asin]";

        /*
        =====================================================
        PRODUCT CARD DETECTION

        We do NOT blindly sleep.

        Instead:

            1. Check immediately.
            2. If cards are not ready, wait for the primary
               selector for a short bounded period.
            3. Check backup selector.
            4. Return immediately when cards are available.

        This makes fast Amazon responses faster while still
        protecting slower responses.
        =====================================================
        */

        /*
=====================================================
EXACT ASIN RECOVERY
=====================================================
*/

        const normalizedTargetAsin =
            String(
                targetAsin || ""
            )
                .trim()
                .toUpperCase();


        if (
            /^B0[A-Z0-9]{8}$/.test(
                normalizedTargetAsin
            )
        ) {

            console.log(
                `🎯 Amazon exact ASIN extraction requested: ${normalizedTargetAsin}`
            );


            /*
            =================================================
            STEP 1
            SEARCH-PAGE EXACT MATCH
            =================================================
            */

            const exactProduct =
                await page.evaluate(
                    asin => {

                        function cleanText(
                            value
                        ) {

                            return String(
                                value || ""
                            )
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();

                        }


                        function parsePrice(
                            value
                        ) {

                            if (
                                value === null ||
                                value === undefined
                            ) {

                                return null;

                            }


                            const text =
                                cleanText(
                                    value
                                );


                            const match =
                                text.match(
                                    /₹\s*([\d,]+(?:\.\d+)?)/i
                                );


                            if (
                                !match
                            ) {

                                return null;

                            }


                            const price =
                                Number(
                                    match[1]
                                        .replace(
                                            /,/g,
                                            ""
                                        )
                                );


                            return Number.isFinite(
                                price
                            )
                                ? price
                                : null;

                        }


                        function recoverAsin(
                            href
                        ) {

                            if (
                                !href
                            ) {

                                return null;

                            }


                            const value =
                                String(
                                    href
                                );


                            const direct =
                                value.match(
                                    /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[\/?#]|$)/i
                                );


                            if (
                                direct
                            ) {

                                return direct[1]
                                    .toUpperCase();

                            }


                            const embedded =
                                value.match(
                                    /\b(B0[A-Z0-9]{8})\b/i
                                );


                            if (
                                embedded
                            ) {

                                return embedded[1]
                                    .toUpperCase();

                            }


                            try {

                                const parsed =
                                    new URL(
                                        value,
                                        "https://www.amazon.in"
                                    );


                                const nested =
                                    parsed.searchParams.get(
                                        "url"
                                    );


                                if (
                                    nested
                                ) {

                                    const decoded =
                                        decodeURIComponent(
                                            nested
                                        );


                                    const nestedMatch =
                                        decoded.match(
                                            /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[\/?#]|$)/i
                                        );


                                    if (
                                        nestedMatch
                                    ) {

                                        return nestedMatch[1]
                                            .toUpperCase();

                                    }

                                }

                            }
                            catch (_) { }


                            return null;

                        }


                        function extractTitle(
                            root
                        ) {

                            const selectors = [

                                "[data-cy='title-recipe']",

                                "h2 a span",

                                "h2 span",

                                "h2 a",

                                "h2",

                                "a.a-link-normal span",

                                "img.s-image",

                                "img[alt]"

                            ];


                            for (
                                const selector
                                of selectors
                            ) {

                                const element =
                                    root.querySelector(
                                        selector
                                    );


                                if (
                                    !element
                                ) {

                                    continue;

                                }


                                const value =
                                    element.tagName ===
                                        "IMG"

                                        ? element.getAttribute(
                                            "alt"
                                        )

                                        : element.textContent;


                                const title =
                                    cleanText(
                                        value
                                    );


                                if (
                                    title
                                ) {

                                    return title;

                                }

                            }


                            return null;

                        }


                        function extractPrice(
                            root
                        ) {

                            const selectors = [

                                ".a-price .a-offscreen",

                                "span.a-offscreen",

                                ".a-price-whole",

                                "[data-a-color='price']",

                                ".a-color-price"

                            ];


                            for (
                                const selector
                                of selectors
                            ) {

                                const element =
                                    root.querySelector(
                                        selector
                                    );


                                if (
                                    !element
                                ) {

                                    continue;

                                }


                                const price =
                                    parsePrice(
                                        element.textContent
                                    );


                                if (
                                    Number.isFinite(
                                        price
                                    )
                                ) {

                                    return price;

                                }

                            }


                            return parsePrice(
                                root.textContent
                            );

                        }


                        function extractImage(
                            root
                        ) {

                            const image =
                                root.querySelector(
                                    "img.s-image"
                                ) ||
                                root.querySelector(
                                    "img"
                                );


                            if (
                                !image
                            ) {

                                return null;

                            }


                            return (

                                image.getAttribute(
                                    "src"
                                ) ||

                                image.getAttribute(
                                    "data-src"
                                ) ||

                                image.getAttribute(
                                    "data-old-hires"
                                ) ||

                                null

                            );

                        }


                        function buildProduct(
                            root
                        ) {

                            if (
                                !root
                            ) {

                                return null;

                            }


                            const title =
                                extractTitle(
                                    root
                                );


                            const price =
                                extractPrice(
                                    root
                                );


                            const image =
                                extractImage(
                                    root
                                );


                            if (
                                !title ||
                                !Number.isFinite(
                                    price
                                )
                            ) {

                                return null;

                            }


                            return {

                                asin,

                                title,

                                price,

                                image,

                                url:
                                    `https://www.amazon.in/dp/${asin}`

                            };

                        }


                        /*
                        -----------------------------------------
                        EXACT data-asin
                        -----------------------------------------
                        */

                        const asinNodes =
                            [
                                ...document.querySelectorAll(
                                    "[data-asin]"
                                )
                            ];


                        for (
                            const node
                            of asinNodes
                        ) {

                            const nodeAsin =
                                String(
                                    node.getAttribute(
                                        "data-asin"
                                    ) || ""
                                )
                                    .trim()
                                    .toUpperCase();


                            if (
                                nodeAsin !== asin
                            ) {

                                continue;

                            }


                            const candidates = [

                                node,

                                node.closest(
                                    "[data-component-type='s-search-result']"
                                ),

                                node.closest(
                                    ".s-result-item"
                                ),

                                node.closest(
                                    "[data-asin]"
                                )

                            ];


                            for (
                                const candidate
                                of candidates
                            ) {

                                const product =
                                    buildProduct(
                                        candidate
                                    );


                                if (
                                    product
                                ) {

                                    return product;

                                }

                            }

                        }


                        /*
                        -----------------------------------------
                        EXACT ASIN inside product links
                        -----------------------------------------
                        */

                        const anchors =
                            [
                                ...document.querySelectorAll(
                                    "a[href]"
                                )
                            ];


                        for (
                            const anchor
                            of anchors
                        ) {

                            const href =
                                anchor.getAttribute(
                                    "href"
                                );


                            if (
                                recoverAsin(
                                    href
                                ) !== asin
                            ) {

                                continue;

                            }


                            const candidates = [

                                anchor.closest(
                                    "[data-component-type='s-search-result']"
                                ),

                                anchor.closest(
                                    ".s-result-item"
                                ),

                                anchor.closest(
                                    "[data-asin]"
                                ),

                                anchor.parentElement

                            ];


                            for (
                                const candidate
                                of candidates
                            ) {

                                const product =
                                    buildProduct(
                                        candidate
                                    );


                                if (
                                    product
                                ) {

                                    return product;

                                }

                            }

                        }


                        return null;

                    },
                    normalizedTargetAsin
                );


            console.log(
                "🎯 Amazon exact ASIN extraction result:",
                exactProduct
            );


            /*
            =================================================
            SEARCH PAGE SUCCESS
            =================================================
            */

            if (
                exactProduct &&
                exactProduct.title &&
                Number.isFinite(
                    exactProduct.price
                )
            ) {

                console.log(
                    `✅ Amazon exact ASIN recovered from search page: ${normalizedTargetAsin}`
                );


                return [

                    {
                        platform:
                            "Amazon",

                        title:
                            this.cleanAmazonTitle(
                                exactProduct.title
                            ),

                        price:
                            exactProduct.price,

                        image:
                            exactProduct.image ||
                            null,

                        url:
                            exactProduct.url,

                        availability:
                            true

                    }

                ];

            }


            /*
            =================================================
            STEP 2
            DIRECT AMAZON PRODUCT PAGE
            =================================================
        
            This is the important new recovery path.
        
            Amazon search:
                B0DGTTKCJX
                ↓
                no exact result
        
            Instead of giving up:
                https://www.amazon.in/dp/B0DGTTKCJX
                ↓
                parse product HTML
            =================================================
            */

            console.log(
                `🔁 Amazon exact ASIN not available in search cards; trying direct product HTML: ${normalizedTargetAsin}`
            );


            const directAsinProduct =
                await this.recoverExactAsinProduct(
                    normalizedTargetAsin,
                    2200
                );


            if (
                directAsinProduct
            ) {

                console.log(
                    `✅ Amazon direct ASIN recovery produced a verified product: ${normalizedTargetAsin}`
                );


                return [

                    directAsinProduct

                ];

            }


            /*
            =================================================
            IMPORTANT SAFETY RULE
            =================================================
        
            We have an exact ASIN.
        
            Therefore we must NOT continue into generic
            search-card extraction because those cards may
            represent completely different products.
            =================================================
            */

            console.log(
                `❌ Amazon exact ASIN could not be recovered: ${normalizedTargetAsin}`
            );


            return [];

        }


        let activeCards =
            page.locator(
                primarySelector
            );


        let cardCount =
            await activeCards
                .count()
                .catch(
                    () => 0
                );


        /*
        =====================================================
        IMMEDIATE SUCCESS
        =====================================================
        */

        if (
            cardCount === 0
        ) {

            /*
            =================================================
            SHORT BOUNDED WAIT

            Old:
                7000 ms

            New:
                2500 ms maximum

            But if cards appear in 300 ms, we continue
            at ~300 ms instead of waiting a fixed 900 ms.
            =================================================
            */

            try {

                await page.waitForSelector(
                    primarySelector,
                    {
                        state:
                            "attached",

                        timeout:
                            2500
                    }
                );

            }
            catch (_) {

                /*
                Primary selector did not appear within
                the short fast-path window.

                Continue to backup selector.
                */

            }


            cardCount =
                await activeCards
                    .count()
                    .catch(
                        () => 0
                    );

        }


        /*
        =====================================================
        BACKUP SELECTOR
        =====================================================
        */

        if (
            cardCount === 0
        ) {

            const backupCards =
                page.locator(
                    backupSelector
                );


            let backupCount =
                await backupCards
                    .count()
                    .catch(
                        () => 0
                    );


            /*
            Give the backup selector a small extra window.

            This is intentionally much smaller than the old
            7-second primary-selector wait.
            */

            if (
                backupCount === 0
            ) {

                try {

                    await page.waitForSelector(
                        backupSelector,
                        {
                            state:
                                "attached",

                            timeout:
                                1000
                        }
                    );

                }
                catch (_) { }


                backupCount =
                    await backupCards
                        .count()
                        .catch(
                            () => 0
                        );

            }


            if (
                backupCount > 0
            ) {

                activeCards =
                    backupCards;

                cardCount =
                    backupCount;

            }

        }


        console.log(
            `Amazon: Search cards found: ${cardCount}`
        );


        /*
        =====================================================
        NO RESULTS
        =====================================================
        */

        if (
            cardCount === 0
        ) {

            return [];

        }


        /*
        =====================================================
        EXTRACT
        =====================================================
        */

        const rawProducts =
            await activeCards.evaluateAll(
                cardNodes => {

                    const LIMIT =
                        Math.min(
                            cardNodes.length,
                            12
                        );


                    const products = [];


                    function cleanText(
                        value
                    ) {

                        return (
                            value ||
                            ""
                        )
                            .replace(
                                /\s+/g,
                                " "
                            )
                            .trim();

                    }


                    function cleanAmazonTitle(
                        value
                    ) {

                        if (
                            !value
                        ) {

                            return "";

                        }


                        let title =
                            String(
                                value
                            ).trim();


                        title =
                            title
                                .replace(
                                    /Sponsored/gi,
                                    " "
                                )
                                .replace(
                                    /You are seeing this ad based on the product'?s relevance to your search query\.?/gi,
                                    " "
                                )
                                .replace(
                                    /Let us know/gi,
                                    " "
                                )
                                .replace(
                                    /Sponsored Ad\s*-\s*/gi,
                                    " "
                                );


                        title =
                            title
                                .replace(
                                    /\|\|+/g,
                                    " "
                                )
                                .replace(
                                    /\s*\|\s*/g,
                                    " | "
                                );


                        title =
                            title.replace(
                                /\s*&\s*/g,
                                " & "
                            );


                        title =
                            title.replace(
                                /([A-Z]{2,})([A-Z][a-z])/g,
                                "$1 $2"
                            );


                        title =
                            title.replace(
                                /([a-z])([A-Z])/g,
                                "$1 $2"
                            );


                        title =
                            title.replace(
                                /([A-Za-z])(\d)/g,
                                "$1 $2"
                            );


                        title =
                            title.replace(
                                /(\d)([A-Za-z])/g,
                                "$1 $2"
                            );


                        title =
                            title.replace(
                                /(\d)\s*[xX]\s*(\d)/g,
                                "$1 x $2"
                            );


                        title =
                            title
                                .replace(
                                    /\s*,\s*/g,
                                    ", "
                                )
                                .replace(
                                    /\s*:\s*/g,
                                    ": "
                                )
                                .replace(
                                    /\s*-\s*/g,
                                    " - "
                                )
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                        return title;

                    }


                    function firstText(
                        root,
                        selectors
                    ) {

                        for (
                            const selector
                            of selectors
                        ) {

                            const element =
                                root.querySelector(
                                    selector
                                );


                            if (
                                element
                            ) {

                                const text =
                                    cleanText(
                                        element.textContent
                                    );


                                if (
                                    text
                                ) {

                                    return text;

                                }

                            }

                        }


                        return null;

                    }


                    function firstAttribute(
                        root,
                        selectors,
                        attribute
                    ) {

                        for (
                            const selector
                            of selectors
                        ) {

                            const element =
                                root.querySelector(
                                    selector
                                );


                            if (
                                element
                            ) {

                                const value =
                                    element.getAttribute(
                                        attribute
                                    );


                                if (
                                    value
                                ) {

                                    return value;

                                }

                            }

                        }


                        return null;

                    }


                    for (
                        let i = 0;
                        i < LIMIT;
                        i++
                    ) {

                        const card =
                            cardNodes[i];


                        if (
                            !card
                        ) {

                            continue;

                        }


                        const cardText =
                            cleanText(
                                card.textContent
                            );


                        /*
                        Skip obvious ad-relevance
                        placeholder cards.
                        */

                        if (
                            /you are seeing this ad/i.test(
                                cardText
                            )
                        ) {

                            continue;

                        }


                        /*
                        =================================
                        TITLE
                        =================================
                        */

                        let title =
                            null;


                        const titleElement =
                            card.querySelector(
                                "[data-cy='title-recipe']"
                            );


                        if (
                            titleElement
                        ) {

                            title =
                                cleanText(
                                    titleElement.textContent
                                );

                        }


                        if (
                            !title
                        ) {

                            const h2 =
                                card.querySelector(
                                    "h2"
                                );


                            if (
                                h2
                            ) {

                                const child =
                                    h2.querySelector(
                                        "a span"
                                    ) ||
                                    h2.querySelector(
                                        "span"
                                    ) ||
                                    h2.querySelector(
                                        "a"
                                    );


                                if (
                                    child
                                ) {

                                    title =
                                        cleanText(
                                            child.textContent
                                        );

                                }

                            }

                        }


                        if (
                            !title
                        ) {

                            const image =
                                card.querySelector(
                                    "img.s-image"
                                );


                            if (
                                image
                            ) {

                                title =
                                    cleanText(
                                        image.getAttribute(
                                            "alt"
                                        )
                                    );

                            }

                        }


                        title =
                            cleanAmazonTitle(
                                title
                            );


                        if (
                            !title
                        ) {

                            continue;

                        }


                        /*
                        =================================
                        PRICE
                        =================================
                        */

                        let priceText =
                            firstText(
                                card,
                                [
                                    ".a-price .a-offscreen",
                                    ".a-price-whole"
                                ]
                            );


                        if (
                            !priceText
                        ) {

                            const match =
                                cardText.match(
                                    /₹\s*[\d,]+/
                                );


                            if (
                                match
                            ) {

                                priceText =
                                    match[0];

                            }

                        }


                        if (
                            !priceText
                        ) {

                            continue;

                        }


                        const priceMatch =
                            String(
                                priceText
                            ).match(
                                /₹\s*([\d,]+)/
                            );


                        if (
                            !priceMatch
                        ) {

                            continue;

                        }


                        const price =
                            Number(
                                priceMatch[1]
                                    .replace(
                                        /,/g,
                                        ""
                                    )
                            );


                        if (
                            !Number.isFinite(
                                price
                            )
                        ) {

                            continue;

                        }


                        /*
                        =================================
                        IMAGE
                        =================================
                        */

                        const image =
                            firstAttribute(
                                card,
                                [
                                    "img.s-image",
                                    "img"
                                ],
                                "src"
                            );


                        /* =================================
   PRODUCT URL
   =================================
*/

                        const cardAsin =
                            String(
                                card.getAttribute(
                                    "data-asin"
                                ) || ""
                            )
                                .trim()
                                .toUpperCase();


                        /*
                        Try the normal Amazon product-link selectors
                        first.
                        */
                        let url =
                            firstAttribute(
                                card,
                                [
                                    "h2 a[href*='/dp/']",
                                    "h2 a[href*='/gp/product/']",
                                    "a[href*='/dp/']",
                                    "a[href*='/gp/product/']"
                                ],
                                "href"
                            );


                        /*
                        Sponsored Amazon cards may only expose:
                        
                        /sspa/click?...&url=%2Fdp%2FASIN...
                        
                        So also inspect a generic anchor when
                        the normal selectors did not find one.
                        */
                        if (
                            !url
                        ) {

                            url =
                                firstAttribute(
                                    card,
                                    [
                                        "a[href]"
                                    ],
                                    "href"
                                );

                        }


                        /*
                        Recover ASIN from:
                        
                        1. data-asin
                        2. direct /dp/ URL
                        3. /gp/product/ URL
                        4. sponsored /sspa/ URL
                        5. nested ?url= URL
                        */
                        let recoveredAsin =
                            /^[A-Z0-9]{10}$/.test(
                                cardAsin
                            )
                                ? cardAsin
                                : null;


                        function extractAsinFromHref(
                            href
                        ) {

                            if (
                                !href ||
                                typeof href !== "string"
                            ) {

                                return null;

                            }


                            let value =
                                href.trim();


                            /*
                            Direct URL.
                            */
                            try {

                                const parsed =
                                    new URL(
                                        value,
                                        "https://www.amazon.in"
                                    );


                                const directMatch =
                                    parsed.pathname.match(
                                        /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i
                                    );


                                if (
                                    directMatch
                                ) {

                                    return directMatch[1]
                                        .toUpperCase();

                                }


                                /*
                                Sponsored/tracking URL.
                                */
                                const nestedUrl =
                                    parsed.searchParams.get(
                                        "url"
                                    );


                                if (
                                    nestedUrl
                                ) {

                                    const nestedMatch =
                                        String(
                                            nestedUrl
                                        )
                                            .match(
                                                /(?:dp|gp\/product)[\/%]+([A-Z0-9]{10})/i
                                            );


                                    if (
                                        nestedMatch
                                    ) {

                                        return nestedMatch[1]
                                            .toUpperCase();

                                    }


                                    const decodedNested =
                                        decodeURIComponent(
                                            String(
                                                nestedUrl
                                            )
                                        );


                                    const decodedMatch =
                                        decodedNested.match(
                                            /(?:dp|gp\/product)\/([A-Z0-9]{10})/i
                                        );


                                    if (
                                        decodedMatch
                                    ) {

                                        return decodedMatch[1]
                                            .toUpperCase();

                                    }

                                }

                            }
                            catch (_) {

                                /*
                                Continue with regex fallback.
                                */

                            }


                            /*
                            Last-resort ASIN search.
                            */
                            const genericMatch =
                                value.match(
                                    /\bB0[A-Z0-9]{8}\b/i
                                );


                            if (
                                genericMatch
                            ) {

                                return genericMatch[0]
                                    .toUpperCase();

                            }


                            return null;

                        }


                        if (
                            !recoveredAsin
                        ) {

                            recoveredAsin =
                                extractAsinFromHref(
                                    url
                                );

                        }


                        /*
                        If we recovered the exact ASIN from the
                        card, always prefer its canonical URL.
                        
                        This deliberately happens BEFORE any
                        /sspa/ rejection.
                        */
                        let finalUrl =
                            null;


                        if (
                            recoveredAsin
                        ) {

                            finalUrl =
                                `https://www.amazon.in/dp/${recoveredAsin}`;

                        }


                        /*
                        If ASIN recovery failed, try the normal
                        canonical URL path.
                        */
                        if (
                            !finalUrl &&
                            url
                        ) {

                            try {

                                const parsed =
                                    new URL(
                                        url,
                                        "https://www.amazon.in"
                                    );


                                const dpMatch =
                                    parsed.pathname.match(
                                        /\/dp\/([A-Z0-9]{10})/i
                                    );


                                const gpMatch =
                                    parsed.pathname.match(
                                        /\/gp\/product\/([A-Z0-9]{10})/i
                                    );


                                if (
                                    dpMatch
                                ) {

                                    finalUrl =
                                        `https://www.amazon.in/dp/${dpMatch[1].toUpperCase()}`;

                                }
                                else if (
                                    gpMatch
                                ) {

                                    finalUrl =
                                        `https://www.amazon.in/gp/product/${gpMatch[1].toUpperCase()}`;

                                }

                            }
                            catch (_) {

                                finalUrl =
                                    null;

                            }

                        }


                        /*
                        Do NOT reject /sspa/ here.
                        
                        The redirect may have contained the
                        actual product ASIN, which we already
                        recovered above.
                        */
                        if (
                            !finalUrl
                        ) {

                            continue;

                        }


                        /*
                        =================================
                        PRODUCT OBJECT
                        =================================
                        */

                        products.push({

                            platform:
                                "Amazon",

                            title,

                            price,

                            image:
                                image ||
                                null,

                            url:
                                finalUrl,

                            availability:
                                true

                        });

                    }


                    return products;

                }
            );


        return rawProducts;

    }

    /*
=====================================================
AMAZON HTTP PREFETCH
=====================================================

Downloads Amazon search HTML without touching the
Playwright page.

This can run concurrently with page.goto().

The HTML is only loaded into the page if the
Playwright navigation fails.
=====================================================
*/

    async fetchSearchHtml(
        searchUrl,
        remainingMs
    ) {

        const budget =
            Math.max(
                0,
                Number(
                    remainingMs || 0
                )
            );


        if (
            budget < 500
        ) {

            return {

                success:
                    false,

                html:
                    null

            };

        }


        const timeout =
            Math.min(
                1800,
                Math.max(
                    400,
                    budget - 100
                )
            );


        const started =
            Date.now();


        console.log(
            `🔄 Amazon HTTP PREFETCH starting with ${timeout}ms budget`
        );


        try {

            const response =
                await axios.get(
                    searchUrl,
                    {

                        timeout,

                        headers: {

                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

                            "Accept":
                                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

                            "Accept-Language":
                                "en-IN,en;q=0.9"

                        },

                        validateStatus:
                            status =>
                                status >= 200 &&
                                status < 400

                    }
                );


            const html =
                String(
                    response.data ||
                    ""
                );


            if (
                html.length < 1000
            ) {

                console.log(
                    `⚠️ Amazon HTTP PREFETCH returned insufficient HTML (${html.length} bytes)`
                );


                return {

                    success:
                        false,

                    html:
                        null

                };

            }


            console.log(
                `✅ Amazon HTTP PREFETCH received ${html.length} bytes in ${Date.now() - started}ms`
            );


            return {

                success:
                    true,

                html

            };

        }
        catch (error) {

            console.log(
                `❌ Amazon HTTP PREFETCH failed after ${Date.now() - started}ms: ${error.message}`
            );


            return {

                success:
                    false,

                html:
                    null

            };

        }

    }

    /*
=====================================================
AMAZON HTTP SEARCH FALLBACK
=====================================================

Sometimes Amazon's Playwright navigation fails with:

    page.goto: Download is starting

and the page becomes:

    chrome-error://chromewebdata/

When that happens, fetch the same search page
directly with HTTP and load the returned HTML
into the existing Playwright page.

This preserves:

    browserPool
    Playwright
    extractSearchResults()
    existing Amazon architecture
=====================================================
*/

    async fetchSearchHtmlFallback(
        page,
        searchUrl,
        remainingMs
    ) {

        const budget =
            Math.max(
                0,
                Number(
                    remainingMs || 0
                )
            );


        /*
        We need enough time for:
            HTTP request
            HTML loading
            extraction
        */

        if (
            budget < 500
        ) {

            console.log(
                "⏭️ Amazon HTTP FALLBACK skipped: insufficient budget"
            );

            return false;

        }


        /*
        Keep fallback bounded by the remaining
        Amazon platform deadline.
        */

        const timeout =
            Math.min(
                1800,
                Math.max(
                    400,
                    budget - 100
                )
            );


        console.log(
            `🔄 Amazon HTTP FALLBACK starting with ${timeout}ms budget`
        );


        const fallbackStarted =
            Date.now();


        try {

            const response =
                await axios.get(
                    searchUrl,
                    {
                        timeout,

                        headers: {

                            "User-Agent":
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

                            "Accept":
                                "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

                            "Accept-Language":
                                "en-IN,en;q=0.9"

                        },

                        validateStatus:
                            status =>
                                status >= 200 &&
                                status < 400

                    }
                );


            const html =
                String(
                    response.data ||
                    ""
                );


            /*
            Reject obviously invalid responses.
            */

            if (
                html.length < 1000
            ) {

                console.log(
                    `Amazon HTTP FALLBACK returned insufficient HTML (${html.length} bytes)`
                );

                return false;

            }


            console.log(
                `Amazon HTTP FALLBACK received ${html.length} bytes in ${Date.now() - fallbackStarted}ms`
            );


            /*
            Remaining time for Playwright to parse
            the downloaded HTML.
            */

            const elapsed =
                Date.now() -
                fallbackStarted;


            const remainingForContent =
                deadline !== null
                    ? Math.max(
                        0,
                        deadline -
                        Date.now()
                    )
                    : 800;

            if (
                deadline !== null &&
                remainingForContent < 600
            ) {

                console.log(
                    `⏭️ Amazon HTTP FALLBACK skipped: only ${remainingForContent}ms remaining`
                );

                return {
                    success: false,
                    products: [],
                    timedOut: true
                };

            }


            console.log(
                `✅ Amazon HTTP FALLBACK loaded search HTML in ${Date.now() - fallbackStarted}ms`
            );


            return true;

        }
        catch (error) {

            console.log(
                `❌ Amazon HTTP FALLBACK failed after ${Date.now() - fallbackStarted}ms:`,
                error.message
            );


            return false;

        }

    }

    /*
=====================================================
SEARCH ONE QUERY
=====================================================

FAST PATH OPTIMIZATION:

When fastPath === true:

    navigation
        +
    result-card detection
        +
    result extraction

are allowed to overlap.

The moment Amazon result cards exist,
we can extract them.

We do NOT wait unnecessarily for:

    navigation completion
        +
    page title
        +
    another selector check

before extraction.

The normal/deep search path keeps its
existing behavior.

=====================================================
*/

    async searchSingleQuery(
        query,
        options = {}
    ) {

        const normalizedQuery =
            this.normalizeSearchQuery(
                query
            );




        /*
        =====================================================
        EXACT AMAZON ASIN CONTEXT
        =====================================================
        
        A bare ASIN query is an exact-identity lookup.
        
        Keep that identity available to every extraction
        path inside this query attempt.
        =====================================================
        */

        const asinMatch =
            normalizedQuery.match(
                /^B0[A-Z0-9]{8}$/i
            );


        const targetAsin =
            asinMatch
                ? asinMatch[0]
                    .toUpperCase()
                : null;


        if (
            targetAsin
        ) {

            console.log(
                `🎯 Amazon search target ASIN: ${targetAsin}`
            );

        }


        const started =
            Date.now();


        const hasDeadline =
            Number.isFinite(
                options.deadline
            );


        const deadline =
            hasDeadline
                ? Number(
                    options.deadline
                )
                : null;


        const fastPath =
            options.fastPath === true;


        if (
            deadline !== null &&
            deadline <= Date.now()
        ) {

            return [];

        }

        /*



        /* 
=====================================================
AMAZON RESULT SELECTOR
=====================================================
*/

        const resultSelector =
            "[data-component-type='s-search-result']";




        /*
        =====================================================
        DETECT CHROME ERROR PAGE
        =====================================================
        */

        const isChromeErrorPage =
            page => {

                try {

                    return String(
                        page.url() ||
                        ""
                    ).startsWith(
                        "chrome-error://"
                    );

                }
                catch (_) {

                    return false;

                }

            };


        /*
        =====================================================
        RUN ONE ATTEMPT
        =====================================================
        */

        const runAttempt =
            async (
                attempt,
                searchUrl
            ) => {

                if (
                    deadline !== null &&
                    deadline <= Date.now()
                ) {

                    return {

                        success:
                            false,

                        products:
                            [],

                        timedOut:
                            true

                    };

                }


                const page =
                    await getPage();


                let deadlineTimer =
                    null;

                let deadlineReached =
                    false;

                let abortHandler = null;

                if (options.signal) {

                    if (options.signal.aborted) {

                        return {
                            success: false,
                            products: [],
                            aborted: true
                        };

                    }

                    abortHandler = async () => {

                        try {
                            await page.close();
                        }
                        catch (_) { }

                    };

                    options.signal.addEventListener(
                        "abort",
                        abortHandler,
                        { once: true }
                    );
                }

                try {

                    console.log(
                        `Amazon: Query "${normalizedQuery}" - attempt ${attempt}`
                    );


                    /*
                    =============================================
                    NAVIGATION
                    =============================================
                    */

                    const navigationStarted =
                        Date.now();


                    const remainingTime =
                        deadline !== null
                            ? Math.max(
                                500,
                                deadline -
                                Date.now() -
                                50
                            )
                            : 15000;


                    const navigationTimeout =
                        Math.min(
                            15000,
                            remainingTime
                        );

                    /*
=================================================
START HTTP PREFETCH CONCURRENTLY
=================================================

Both paths now start together:

    Playwright navigation
    +
    HTTP HTML request
=================================================
*/

                    const httpPrefetchPromise =
                        this.fetchSearchHtml(
                            searchUrl,
                            remainingTime
                        );


                    const navigationPromise =
                        page.goto(
                            searchUrl,
                            {
                               waitUntil: "domcontentloaded",

                                timeout:
                                    navigationTimeout
                            }
                        )
                            .then(
                                () => {

                                    return {
                                        succeeded:
                                            true,

                                        error:
                                            null
                                    };

                                }
                            )
                            .catch(
                                error => {

                                    console.log(
                                        `Amazon navigation warning "${normalizedQuery}" attempt ${attempt}: ${error.message}`
                                    );

                                    return {
                                        succeeded:
                                            false,

                                        error:
                                            error
                                    };

                                }
                            );


                    /*
                    =============================================
                    RESULT CARD READINESS
                    =============================================
    
                    Start immediately.
    
                    =============================================
                    */

                    const readinessTimeout =
                        deadline !== null
                            ? Math.max(
                                300,
                                Math.min(
                                    7000,
                                    deadline -
                                    Date.now() -
                                    50
                                )
                            )
                            : 7000;


                    const cardsReadyPromise =
                        page
                            .waitForSelector(
                                resultSelector,
                                {
                                    state:
                                        "attached",

                                    timeout:
                                        readinessTimeout
                                }
                            )
                            .catch(
                                () => null
                            );
                    /*
=================================================
NAVIGATION FAILURE FALLBACK
=================================================

Do NOT wait for result cards when Amazon
navigation itself has already failed.

Download is starting
        ↓
navigationPromise = failed
        ↓
HTTP fallback starts immediately
=================================================
*/

                    const navigationFailurePromise =
                        navigationPromise.then(
                            async navigationResult => {

                                /*
                                Navigation succeeded.
                    
                                The HTTP prefetch may still be running,
                                but we don't need it.
                                */

                                if (
                                    navigationResult &&
                                    navigationResult.succeeded === true
                                ) {

                                    return new Promise(
                                        () => { }
                                    );

                                }


                                /*
                                =============================================
                                PLAYWRIGHT NAVIGATION FAILED
                                =============================================
                    
                                The HTTP request has already been running
                                concurrently.
                    
                                Now we simply wait for that existing request.
                                =============================================
                                */

                                console.log(
                                    `🔄 Amazon navigation failed for "${normalizedQuery}" attempt ${attempt}; using concurrent HTTP prefetch.`
                                );


                                const remainingForFallback =
                                    deadline !== null
                                        ? Math.max(
                                            0,
                                            deadline -
                                            Date.now()
                                        )
                                        : 1800;


                                let fallbackResult;


                                if (
                                    remainingForFallback <= 0
                                ) {

                                    return {

                                        success:
                                            false,

                                        products:
                                            [],

                                        timedOut:
                                            true

                                    };

                                }


                                /*
                                Wait for the HTTP request that was already
                                started when Playwright navigation started.
                                */

                                fallbackResult =
                                    await Promise.race([
                                        httpPrefetchPromise,

                                        new Promise(
                                            resolve => {

                                                setTimeout(
                                                    () => {

                                                        resolve({

                                                            success:
                                                                false,

                                                            html:
                                                                null,

                                                            timedOut:
                                                                true

                                                        });

                                                    },
                                                    remainingForFallback
                                                );

                                            }
                                        )
                                    ]);


                                if (
                                    !fallbackResult ||
                                    !fallbackResult.success ||
                                    !fallbackResult.html
                                ) {

                                    console.log(
                                        "❌ Amazon concurrent HTTP fallback did not return usable HTML"
                                    );


                                    return {

                                        success:
                                            false,

                                        products:
                                            [],

                                        timedOut:
                                            Boolean(
                                                fallbackResult &&
                                                fallbackResult.timedOut
                                            )

                                    };

                                }


                                /*
                                =============================================
                                LOAD DOWNLOADED HTML INTO PLAYWRIGHT
                                =============================================
                                */

                                const setContentStarted =
                                    Date.now();


                                const remainingForContent =
                                    deadline !== null
                                        ? Math.max(
                                            250,
                                            deadline -
                                            Date.now()
                                        )
                                        : 1200;


                                try {

                                    await page.setContent(
    fallbackResult.html,
    {
        waitUntil: "commit",

        timeout:
            Math.min(
                900,
                Math.max(
                    300,
                    remainingForContent
                )
            )
    }
);

                                }
                                catch (error) {

                                    console.log(
                                        `❌ Amazon concurrent fallback page.setContent failed after ${Date.now() - setContentStarted}ms: ${error.message}`
                                    );


                                    return {

                                        success:
                                            false,

                                        products:
                                            [],

                                        timedOut:
                                            false

                                    };

                                }


                                console.log(
                                    `✅ Amazon concurrent HTTP HTML loaded into Playwright in ${Date.now() - setContentStarted}ms`
                                );


                                /*
                                =============================================
                                EXTRACT
                                =============================================
                                */

                                const extractionStarted =
                                    Date.now();


                                const fallbackProducts =
                                    await this.extractSearchResults(
                                        page,
                                        targetAsin
                                    );


                                console.log(
                                    `⏱ Amazon concurrent HTTP extraction "${normalizedQuery}" attempt ${attempt}: ${Date.now() - extractionStarted}ms`
                                );


                                if (
                                    Array.isArray(
                                        fallbackProducts
                                    ) &&
                                    fallbackProducts.length > 0
                                ) {

                                    console.log(
                                        `✅ Amazon concurrent HTTP FALLBACK produced ${fallbackProducts.length} products`
                                    );


                                    return {

                                        success:
                                            true,

                                        products:
                                            fallbackProducts,

                                        timedOut:
                                            false

                                    };

                                }


                                console.log(
                                    `⚠️ Amazon concurrent HTTP FALLBACK produced 0 products`
                                );


                                return {

                                    success:
                                        false,

                                    products:
                                        [],

                                    timedOut:
                                        false

                                };

                            }
                        );

                    /*
                    =============================================
                    DEADLINE WATCHER
                    =============================================
                    */

                    if (
                        deadline !== null
                    ) {

                        const remaining =
                            Math.max(
                                1,
                                deadline -
                                Date.now()
                            );


                        deadlineTimer =
                            setTimeout(
                                () => {

                                    deadlineReached =
                                        true;

                                },
                                remaining
                            );

                    }


                    /*
                    =================================================
                    FAST PATH
                    =================================================
    
                    As soon as result cards appear:
    
                        cards ready
                            ↓
                        extract immediately
    
                    We deliberately do NOT wait for
                    navigationPromise to finish first.
    
                    This is the important performance change.
    
                    =================================================
                    */

                    if (
                        fastPath
                    ) {

                        const fastExtractionPromise =
                            cardsReadyPromise.then(
                                async cardsReady => {

                                    if (
                                        !cardsReady
                                    ) {

                                        return {

                                            ready:
                                                false,

                                            products:
                                                []

                                        };

                                    }


                                    /*
                                    ---------------------------------
                                    CHROME ERROR CHECK
                                    ---------------------------------
                                    */

                                    /*
 =============================================
 CHROME ERROR
 =============================================
 */

                                    if (
                                        isChromeErrorPage(
                                            page
                                        )
                                    ) {

                                        console.log(
                                            `Amazon: Query "${normalizedQuery}" attempt ${attempt} reached chrome-error.`
                                        );


                                        /*
                                        Calculate the amount of Amazon's
                                        remaining deadline available for
                                        the direct HTTP fallback.
                                        */

                                        const remainingForFallback =
                                            deadline !== null
                                                ? deadline -
                                                Date.now()
                                                : 1800;


                                        /*
                                        Try direct HTTP retrieval of the
                                        Amazon search HTML.
                                        */

                                        const fallbackLoaded =
                                            await this.fetchSearchHtmlFallback(
                                                page,
                                                searchUrl,
                                                remainingForFallback
                                            );


                                        /*
                                        HTTP fallback failed.
                                        */

                                        if (
                                            !fallbackLoaded
                                        ) {

                                            return {

                                                success:
                                                    false,

                                                products:
                                                    [],

                                                timedOut:
                                                    deadline !== null &&
                                                    deadline <= Date.now()

                                            };

                                        }


                                        /*
                                        =========================================
                                        EXTRACT FROM FALLBACK HTML
                                        =========================================
                                        */

                                        const fallbackExtractionStarted =
                                            Date.now();


                                        const fallbackProducts =
                                            await this.extractSearchResults(
                                                page
                                            );


                                        console.log(
                                            `Amazon HTTP FALLBACK extraction: ${fallbackProducts.length} products in ${Date.now() - fallbackExtractionStarted}ms`
                                        );


                                        /*
                                        Successfully recovered Amazon results.
                                        */

                                        if (
                                            fallbackProducts.length > 0
                                        ) {

                                            console.log(
                                                `✅ Amazon HTTP FALLBACK produced ${fallbackProducts.length} products`
                                            );


                                            return {

                                                success:
                                                    true,

                                                products:
                                                    fallbackProducts,

                                                timedOut:
                                                    false

                                            };

                                        }


                                        /*
                                        Fallback HTML loaded successfully,
                                        but no products were extracted.
                                        */

                                        console.log(
                                            "⚠️ Amazon HTTP FALLBACK loaded HTML but produced 0 products"
                                        );


                                        return {

                                            success:
                                                false,

                                            products:
                                                [],

                                            timedOut:
                                                false

                                        };

                                    }

                                    const extractionStarted =
                                        Date.now();


                                    const products =
                                        await this.extractSearchResults(
                                            page,
                                            targetAsin
                                        );


                                    const extractionTime =
                                        Date.now() -
                                        extractionStarted;


                                    console.log(
                                        `⏱ Amazon FAST extraction "${normalizedQuery}" attempt ${attempt}: ${extractionTime} ms`
                                    );


                                    return {

                                        ready:
                                            true,

                                        products:
                                            Array.isArray(
                                                products
                                            )
                                                ? products
                                                : []

                                    };

                                }
                            )
                                .catch(
                                    error => {

                                        console.log(
                                            `Amazon FAST extraction failed "${normalizedQuery}" attempt ${attempt}: ${error.message}`
                                        );


                                        return {

                                            ready:
                                                false,

                                            products:
                                                []

                                        };

                                    }
                                );


                        /*
                        ---------------------------------------------
                        FAST DEADLINE RACE
                        ---------------------------------------------
                        */

                        const remaining =
                            deadline !== null
                                ? Math.max(
                                    1,
                                    deadline -
                                    Date.now()
                                )
                                : 15000;


                        const fastDeadlinePromise =
                            new Promise(
                                resolve => {

                                    setTimeout(
                                        () => {

                                            resolve({
                                                timedOut:
                                                    true
                                            });

                                        },
                                        remaining
                                    );

                                }
                            );


                        const fastResult =
                            await Promise.race([
                                navigationFailurePromise,
                                fastExtractionPromise,
                                fastDeadlinePromise
                            ]);


                        /*
                        ---------------------------------------------
                        SUCCESS
                        ---------------------------------------------
                        */

                        if (
                            fastResult &&
                            !fastResult.timedOut &&
                            Array.isArray(
                                fastResult.products
                            ) &&
                            fastResult.products.length > 0
                        ) {

                            console.log(
                                `⚡ Amazon FAST PATH extracted ${fastResult.products.length} products from "${normalizedQuery}" in ${Date.now() - started}ms`
                            );


                            return {

                                success:
                                    true,

                                products:
                                    fastResult.products

                            };

                        }


                        /*
                        ---------------------------------------------
                        DEADLINE REACHED
                        ---------------------------------------------
                        */

                        if (
                            deadline !== null &&
                            deadline <= Date.now()
                        ) {

                            return {

                                success:
                                    false,

                                products:
                                    [],

                                timedOut:
                                    true

                            };

                        }

                        /*
                        ---------------------------------------------
                        FAST PATH HAD NO PRODUCTS
    
                        Fall through to the normal flow so
                        the existing retry mechanism remains
                        available.
                        ---------------------------------------------
                        */

                    }


                    /*
                    =================================================
                    NORMAL PATH
                    =================================================
    
                    Used by deep/full searches and as the
                    fallback after an empty fast extraction.
    
                    =================================================
                    */

                    if (
                        deadline !== null
                    ) {

                        const remaining =
                            Math.max(
                                1,
                                deadline -
                                Date.now()
                            );


                        await Promise.race([
                            Promise.all([
                                navigationPromise,
                                cardsReadyPromise
                            ]),

                            new Promise(
                                resolve =>
                                    setTimeout(
                                        () =>
                                            resolve(
                                                "deadline"
                                            ),
                                        remaining
                                    )
                            )

                        ]);

                    }
                    else {

                        await Promise.all([
                            navigationPromise,
                            cardsReadyPromise
                        ]);

                    }


                    if (
                        deadline !== null &&
                        (
                            deadlineReached ||
                            deadline <= Date.now()
                        )
                    ) {

                        /*
                        =============================================
                        LAST-MOMENT CARD CHECK
                        =============================================
                    
                        Amazon may have attached the search cards
                        exactly at the deadline.
                    
                        Do one immediate check before giving up.
                        =============================================
                        */

                        const readyCards =
                            await page
                                .locator(
                                    resultSelector
                                )
                                .count()
                                .catch(
                                    () => 0
                                );


                        if (
                            readyCards > 0
                        ) {

                            console.log(
                                `✅ Amazon: ${readyCards} result cards available at deadline; performing safe final extraction.`
                            );


                            const lateExtractionStarted =
                                Date.now();


                            const lateProducts =
                                await this
                                    .extractSearchResults(
                                        page,
                                        targetAsin
                                    )
                                    .catch(
                                        error => {

                                            console.log(
                                                `Amazon final extraction after deadline failed: ${error.message}`
                                            );

                                            return [];

                                        }
                                    );


                            console.log(
                                `⏱ Amazon final extraction after deadline: ${Date.now() - lateExtractionStarted} ms`
                            );


                            if (
                                Array.isArray(
                                    lateProducts
                                ) &&
                                lateProducts.length > 0
                            ) {

                                console.log(
                                    `✅ Amazon: Safe deadline extraction produced ${lateProducts.length} products.`
                                );


                                return {

                                    success:
                                        true,

                                    products:
                                        lateProducts

                                };

                            }

                        }


                        return {

                            success:
                                false,

                            products:
                                [],

                            timedOut:
                                true

                        };

                    }


                    const navigationTime =
                        Date.now() -
                        navigationStarted;


                    console.log(
                        `⏱ Amazon navigation "${normalizedQuery}" attempt ${attempt}: ${navigationTime} ms`
                    );


                    console.log(
                        `Amazon query "${normalizedQuery}" URL:`,
                        page.url()
                    );


                    /*
                    =============================================
                    CHROME ERROR
                    =============================================
                    */

                    if (
                        isChromeErrorPage(
                            page
                        )
                    ) {

                        console.log(
                            `Amazon: Query "${normalizedQuery}" attempt ${attempt} reached chrome-error.`
                        );


                        return {

                            success:
                                false,

                            products:
                                []

                        };

                    }


                    /*
                    =============================================
                    QUICK PAGE TITLE
    
                    Keep only for the normal/deep path.
                    =============================================
                    */

                    const title =
                        await page
                            .title()
                            .catch(
                                () => ""
                            );


                    console.log(
                        `Amazon query "${normalizedQuery}" title:`,
                        title
                    );


                    /*
                    =============================================
                    EXTRACTION
                    =============================================
                    */

                    const extractionStarted =
                        Date.now();


                    const products =
                        await this.extractSearchResults(
                            page,
                            targetAsin
                        );


                    const extractionTime =
                        Date.now() -
                        extractionStarted;


                    console.log(
                        `⏱ Amazon extraction "${normalizedQuery}" attempt ${attempt}: ${extractionTime} ms`
                    );


                    if (
                        Array.isArray(
                            products
                        ) &&
                        products.length > 0
                    ) {

                        return {

                            success:
                                true,

                            products

                        };

                    }


                    return {

                        success:
                            false,

                        products:
                            []

                    };

                }

                catch (
                error
                ) {

                    console.log(
                        `Amazon query "${normalizedQuery}" attempt ${attempt} failed:`,
                        error.message
                    );


                    return {

                        success:
                            false,

                        products:
                            []

                    };

                }

                finally {

                    if (
                        deadlineTimer
                    ) {

                        clearTimeout(
                            deadlineTimer
                        );

                    }

                    if (
                        options.signal &&
                        abortHandler
                    ) {

                        try {

                            options.signal.removeEventListener(
                                "abort",
                                abortHandler
                            );

                        }
                        catch (_) { }

                    }

                    await closePage(
                        page
                    );

                }

            };


        /*
        =====================================================
        ATTEMPT 1
        =====================================================
        */

        const firstUrl =
            `https://www.amazon.in/s?k=${encodeURIComponent(
                normalizedQuery
            )}`;


        const firstAttempt =
            await runAttempt(
                1,
                firstUrl
            );


        if (
            firstAttempt.success
        ) {

            console.log(
                `Amazon: "${normalizedQuery}" succeeded on attempt 1`
            );


            console.log(
                `⏱ Amazon query "${normalizedQuery}": ${Date.now() -
                started
                } ms`
            );


            return firstAttempt.products;

        }


        /*
        =====================================================
        DO NOT RETRY AFTER DEADLINE
        =====================================================
        */

        if (
            firstAttempt.timedOut
        ) {

            return [];

        }


        if (
            deadline !== null &&
            deadline <= Date.now()
        ) {

            return [];

        }


        /*
        =====================================================
        ATTEMPT 2
        =====================================================
        */

        console.log(
            `Amazon: "${normalizedQuery}" retrying with fresh page...`
        );


        const retryUrl =
            `https://www.amazon.in/s?k=${encodeURIComponent(
                normalizedQuery
            )}&ref=nb_sb_noss`;


        const secondAttempt =
            await runAttempt(
                2,
                retryUrl
            );


        if (
            secondAttempt.success
        ) {

            console.log(
                `Amazon: "${normalizedQuery}" succeeded on attempt 2`
            );


            console.log(
                `⏱ Amazon query "${normalizedQuery}": ${Date.now() -
                started
                } ms`
            );


            return secondAttempt.products;

        }


        /*
        =====================================================
        FINAL FAILURE
        =====================================================
        */

        console.log(
            `Amazon: "${normalizedQuery}" failed after 2 attempts.`
        );


        console.log(
            `⏱ Amazon query "${normalizedQuery}": ${Date.now() -
            started
            } ms`
        );


        return [];

    }


    /*
    =====================================================
    MERGE QUERY RESULTS
    =====================================================
    */

    mergeProducts(
        resultSets
    ) {

        const products = [];


        const seen =
            new Map();


        for (
            const results
            of resultSets
        ) {

            if (
                !Array.isArray(
                    results
                )
            ) {

                continue;

            }


            for (
                const product
                of results
            ) {

                if (
                    !product ||
                    !product.url
                ) {

                    continue;

                }


                const key =
                    this.normalizeProductUrl(
                        product.url
                    );


                if (
                    !key
                ) {

                    continue;

                }


                const existingIndex =
                    seen.get(
                        key
                    );


                /*
                If the same product appeared in multiple
                query results, keep the cheaper observation.
                */

                if (
                    existingIndex !==
                    undefined
                ) {

                    if (
                        Number(
                            product.price
                        ) <
                        Number(
                            products[
                                existingIndex
                            ].price
                        )
                    ) {

                        products[
                            existingIndex
                        ] =
                            product;

                    }


                    continue;

                }


                seen.set(
                    key,
                    products.length
                );


                products.push(
                    {

                        ...product,

                        url:
                            key

                    }
                );

            }

        }


        return products;

    }


    /*
    =====================================================
    FINALIZE PRODUCTS
    =====================================================
    */

    finalizeProducts(
        rawProducts
    ) {

        const products = [];


        const seen =
            new Map();


        for (
            const product
            of rawProducts
        ) {

            if (
                !product ||
                !product.title ||
                !Number.isFinite(
                    Number(
                        product.price
                    )
                ) ||
                !product.url
            ) {

                continue;

            }


            const key =
                this.normalizeProductUrl(
                    product.url
                );


            if (
                !key
            ) {

                continue;

            }


            const existingIndex =
                seen.get(
                    key
                );


            if (
                existingIndex !==
                undefined
            ) {

                if (
                    Number(
                        product.price
                    ) <
                    Number(
                        products[
                            existingIndex
                        ].price
                    )
                ) {

                    products[
                        existingIndex
                    ] = {

                        ...product,

                        url:
                            key

                    };

                }


                continue;

            }


            seen.set(
                key,
                products.length
            );


            products.push(
                {

                    ...product,

                    url:
                        key

                }
            );

        }


        /*
        ---------------------------------------------
        LOWEST PRICE FIRST
        ---------------------------------------------
        */

        products.sort(
            (
                a,
                b
            ) =>
                Number(
                    a.price
                ) -
                Number(
                    b.price
                )
        );


        /*
        ---------------------------------------------
        LIMIT RESULTS
        ---------------------------------------------
        */

        const limited =
            products.slice(
                0,
                this.maxResults
            );


        /*
        Existing logging behavior.
        */

        for (
            const product
            of limited
        ) {

            console.log(
                `AMAZON FINAL TITLE: ${product.title}`
            );


            console.log(
                `Amazon: ${product.title} → ₹${product.price}`
            );

        }


        console.log(
            `Amazon: Returning ${limited.length} products`
        );


        return limited;

    }


    /*
    =====================================================
    SEARCH CACHE KEY
    =====================================================
    */

    getSearchCacheKey(
        query,
        originalProduct
    ) {

        const product =
            originalProduct || {};


        const identity = [

            product.brand || "",
            product.productName || "",
            product.model || "",
            product.variant || "",
            product.weight || "",
            product.flavour || "",
            product.color || ""

        ]
            .map(
                value =>
                    String(
                        value
                    )
                        .toLowerCase()
                        .trim()
            )
            .join("|");


        /*
        Specific product searches use identity rather than
        the manager's individual generated query.

        This is what lets multiple searchManager calls share
        the same Amazon batch.
        */

        if (
            identity.replace(
                /\|/g,
                ""
            ).length > 0
        ) {

            return (
                "specific|" +
                identity
            );

        }


        return (
            "generic|" +
            this.normalizeSearchQuery(
                query
            )
                .toLowerCase()
        );

    }


    /*
    =====================================================
    GET CACHED RESULT
    =====================================================
    */

    getCached(
        key
    ) {

        const cached =
            this.searchCache.get(
                key
            );


        if (
            !cached
        ) {

            return null;

        }


        if (
            Date.now() -
            cached.timestamp >
            this.cacheTtl
        ) {

            this.searchCache.delete(
                key
            );


            return null;

        }


        return cached.products.map(
            product =>
            ({
                ...product
            })
        );

    }


    /*
    =====================================================
    SET CACHE
    =====================================================
    */

    setCached(
        key,
        products
    ) {

        this.searchCache.set(
            key,
            {

                timestamp:
                    Date.now(),

                products:
                    products.map(
                        product =>
                        ({
                            ...product
                        })
                    )

            }
        );


        /*
        Keep cache bounded.
        */

        while (
            this.searchCache.size >
            100
        ) {

            const oldestKey =
                this.searchCache
                    .keys()
                    .next()
                    .value;


            if (
                oldestKey ===
                undefined
            ) {

                break;

            }


            this.searchCache.delete(
                oldestKey
            );

        }

    }


    /*
    =====================================================
    FAST CANDIDATE CHECK
    =====================================================
    */

    hasStrongCandidate(
        products,
        originalProduct = {}
    ) {

        if (
            !Array.isArray(
                products
            )
        ) {

            return false;

        }


        const normalize =
            value =>
                String(
                    value ?? ""
                )
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9]+/g,
                        " "
                    )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();


        const containsAllTokens =
            (
                title,
                requested
            ) => {

                const value =
                    normalize(
                        requested
                    );


                if (
                    !value
                ) {

                    return true;

                }


                const requiredTokens =
                    value
                        .split(" ")
                        .filter(
                            token =>
                                token.length >= 2
                        );


                return requiredTokens.every(
                    token =>
                        normalize(
                            title
                        ).includes(
                            token
                        )
                );

            };


        const normalizeWeight =
            value =>
                normalize(
                    value
                )
                    .replace(
                        /(\d+)\s*g\b/g,
                        "$1g"
                    )
                    .replace(
                        /(\d+)\s*kg\b/g,
                        "$1kg"
                    );


        const brand =
            normalize(
                originalProduct.brand
            );


        const productName =
            normalize(
                originalProduct.productName
            );


        const weight =
            normalizeWeight(
                originalProduct.weight
            );


        const flavour =
            normalize(
                originalProduct.flavour
            );


        const model =
            normalize(
                originalProduct.model
            );


        const variant =
            normalize(
                originalProduct.variant
            );


        const color =
            normalize(
                originalProduct.color
            );


        return products.some(
            product => {

                if (
                    !product ||
                    !product.title
                ) {

                    return false;

                }


                const title =
                    normalize(
                        product.title
                    );


                if (
                    brand &&
                    !containsAllTokens(
                        title,
                        brand
                    )
                ) {

                    return false;

                }


                if (
                    productName &&
                    !containsAllTokens(
                        title,
                        productName
                    )
                ) {

                    return false;

                }


                /*
                Weight should be checked conservatively.

                Exact numerical conversion is handled later by
                global verification.
                */

                if (
                    weight
                ) {

                    const normalizedTitle =
                        normalizeWeight(
                            title
                        );


                    if (
                        !normalizedTitle.includes(
                            weight
                        )
                    ) {

                        return false;

                    }

                }


                if (
                    flavour &&
                    !containsAllTokens(
                        title,
                        flavour
                    )
                ) {

                    return false;

                }


                if (
                    model &&
                    !containsAllTokens(
                        title,
                        model
                    )
                ) {

                    return false;

                }


                if (
                    variant &&
                    !containsAllTokens(
                        title,
                        variant
                    )
                ) {

                    return false;

                }


                if (
                    color &&
                    !containsAllTokens(
                        title,
                        color
                    )
                ) {

                    return false;

                }


                return true;

            }
        );

    }


    /*
    =====================================================
    SEARCH FAST

    This is the method used by SearchManager when a
    strict platform-search deadline is active.

    IMPORTANT:

        The goal is not to perform the entire deep search.

        The goal is to return useful platform products
        before the global search deadline expires.
    =====================================================
    */

    async searchFast(
        query,
        originalProduct = {},
        options = {}
    ) {

        const started =
            Date.now();


        const managerDeadline =
            Number.isFinite(
                options.deadline
            )
                ? Number(
                    options.deadline
                )
                : Date.now() + 3200;


        /*
        Leave a small safety margin so the manager gets
        the returned data before its own deadline.
        */

        const safetyMargin =
            700;


        const deadline =
            Math.max(
                Date.now() + 250,
                managerDeadline -
                safetyMargin
            );


        console.log(
            `⚡ Amazon: FAST SEARCH starting with ${Math.max(
                0,
                deadline - Date.now()
            )}ms budget`
        );


        const cacheKey =
            this.getSearchCacheKey(
                query,
                originalProduct
            );


        /*
        COMPLETED CACHE
        */

        const cached =
            this.getCached(
                cacheKey
            );


        if (
            cached !== null
        ) {

            console.log(
                `Amazon: FAST SEARCH cache hit → ${cached.length} products`
            );


            return cached;

        }


        /*
        BUILD QUERY LADDER
        */

        const queries =
            this.buildSearchQueries(
                query,
                originalProduct
            );


        if (
            queries.length === 0
        ) {

            return [];

        }


        /*
        SPECIFIC PRODUCT

        We only run the two most valuable searches for
        the fast path.

        Q1:
            brand + product + weight + flavour

        Q2:
            brand + product + flavour
        */

        const specificSearch =
            Boolean(
                originalProduct &&
                (
                    originalProduct.brand ||
                    originalProduct.productName ||
                    originalProduct.model ||
                    originalProduct.variant ||
                    originalProduct.weight ||
                    originalProduct.flavour ||
                    originalProduct.color
                )
            );


        let searchQueries;


        if (
            specificSearch
        ) {

            searchQueries =
                queries.slice(
                    0,
                    2
                );

        }
        else {

            searchQueries =
                queries.slice(
                    0,
                    1
                );

        }


        console.log(
            "⚡ Amazon FAST SEARCH queries:",
            searchQueries
        );


        /*
        =====================================================
        RUN QUERIES IN PARALLEL

        Promise.all() is intentionally NOT used.

        We want whichever query produces a useful result
        first to be able to win and return.
        =====================================================
        */

        let settled =
            false;


        let deadlineTimer =
            null;


        try {

            const queryEntries =
                searchQueries.map(
                    searchQuery => {

                        const controller =
                            typeof AbortController !==
                                "undefined"
                                ? new AbortController()
                                : null;

                        const promise =
                            this.searchSingleQuery(
                                searchQuery,
                                {
                                    deadline,
                                    fastPath: true,
                                    signal:
                                        controller
                                            ? controller.signal
                                            : undefined
                                }
                            )
                                .then(
                                    products => ({

                                        query:
                                            searchQuery,

                                        products:
                                            Array.isArray(
                                                products
                                            )
                                                ? products
                                                : [],

                                        controller

                                    })
                                )
                                .catch(
                                    error => ({

                                        query:
                                            searchQuery,

                                        products:
                                            [],

                                        error,

                                        controller

                                    })
                                );

                        return {
                            promise,
                            controller
                        };

                    }
                );

            const queryPromises =
                queryEntries.map(
                    entry =>
                        entry.promise
                );

            /*
            =================================================
            DEADLINE PROMISE
            =================================================
            */

            const remaining =
                Math.max(
                    1,
                    deadline - Date.now()
                );


            const deadlinePromise =
                new Promise(
                    resolve => {

                        deadlineTimer =
                            setTimeout(
                                () => {

                                    resolve({
                                        deadline:
                                            true
                                    });

                                },
                                remaining
                            );

                    }
                );


            /*
            =================================================
            RACE FOR USEFUL RESULT

            We deliberately wait for the first product-bearing
            query rather than merely the first resolved query.
            =================================================
            */

            const usefulResultPromise =
                new Promise(
                    resolve => {

                        let completed =
                            0;


                        for (
                            const promise
                            of queryPromises
                        ) {

                            promise.then(
                                result => {

                                    completed++;


                                    if (
                                        settled
                                    ) {

                                        return;

                                    }


                                    if (
                                        result.products.length > 0
                                    ) {

                                        settled =
                                            true;

                                        for (
                                            const entry
                                            of queryEntries
                                        ) {

                                            if (
                                                entry.controller &&
                                                entry.controller !== result.controller &&
                                                !entry.controller.signal.aborted
                                            ) {

                                                try {

                                                    entry.controller.abort();

                                                }
                                                catch (_) { }

                                            }

                                        }

                                        resolve(
                                            result
                                        );

                                        return;
                                    }


                                    /*
                                    If every query completed with
                                    zero results, return an empty
                                    result rather than waiting forever.
                                    */

                                    if (
                                        completed ===
                                        queryPromises.length
                                    ) {

                                        settled =
                                            true;


                                        resolve(
                                            {
                                                query:
                                                    null,

                                                products:
                                                    []

                                            }
                                        );

                                    }

                                }
                            );

                        }

                    }
                );


            const winner =
                await Promise.race([
                    usefulResultPromise,
                    deadlinePromise
                ]);


            if (
                winner &&
                winner.deadline
            ) {

                console.log(
                    `⏱ Amazon: FAST SEARCH deadline reached after ${Date.now() - started}ms`
                );


                /*
                =====================================================
                SHORT COMPLETION GRACE
                =====================================================
            
                searchFast keeps a small safety margin before the
                SearchManager deadline.
            
                Use that margin to allow an extraction that has
                already started to finish.
                =====================================================
                */

                const graceMs =
                    Math.max(
                        0,
                        managerDeadline -
                        deadline
                    );


                if (
                    graceMs > 0
                ) {

                    const graceWinner =
                        await Promise.race([
                            usefulResultPromise,

                            new Promise(
                                resolve =>
                                    setTimeout(
                                        () =>
                                            resolve({
                                                graceExpired:
                                                    true
                                            }),
                                        graceMs
                                    )
                            )
                        ]);


                    if (
                        graceWinner &&
                        !graceWinner.graceExpired &&
                        Array.isArray(
                            graceWinner.products
                        ) &&
                        graceWinner.products.length > 0
                    ) {

                        console.log(
                            `✅ Amazon: FAST SEARCH accepted result during ${graceMs}ms extraction grace.`
                        );


                        const finalized =
                            this.finalizeProducts(
                                graceWinner.products
                            );


                        if (
                            finalized.length > 0
                        ) {

                            this.setCached(
                                cacheKey,
                                finalized
                            );


                            return finalized;

                        }

                    }

                }


                return [];
            }


            if (
                winner &&
                Array.isArray(
                    winner.products
                ) &&
                winner.products.length > 0
            ) {

                console.log(
                    `✅ Amazon: FAST SEARCH received ${winner.products.length} products from "${winner.query}" in ${Date.now() - started}ms`
                );


                /*
                We can return the winner immediately.
            
                The manager needs usable candidates, not every
                possible result from every Amazon query.
                */

                const finalized =
                    this.finalizeProducts(
                        winner.products
                    );


                if (
                    finalized.length > 0
                ) {

                    this.setCached(
                        cacheKey,
                        finalized
                    );


                    return finalized;

                }


                return winner.products;

            }


            return [];

        }
        finally {

            settled =
                true;


            if (
                deadlineTimer
            ) {

                clearTimeout(
                    deadlineTimer
                );

            }

            /*
            searchSingleQuery owns page cleanup. The fast method
            does not attempt to manipulate those pages directly.
            */

        }

    }


    /*
    =====================================================
    MAIN SEARCH

    This remains the deeper/full Amazon search path.

    SearchManager normally uses searchFast() during the
    real-time pipeline.
    =====================================================
    */

    async search(
        query,
        originalProduct = {}
    ) {

        const started =
            Date.now();


        console.log(
            `Amazon: Searching "${query}"`
        );


        /*
        =================================================
        CACHE KEY
        =================================================
        */

        const cacheKey =
            this.getSearchCacheKey(
                query,
                originalProduct
            );


        /*
        =================================================
        COMPLETED CACHE
        =================================================
        */

        const cached =
            this.getCached(
                cacheKey
            );


        if (
            cached !== null
        ) {

            console.log(
                "Amazon: Using cached search session."
            );


            console.log(
                `Amazon: Returning ${cached.length} cached products`
            );


            return cached;

        }


        /*
        =================================================
        IN-FLIGHT CACHE
        =================================================
    
        If another request is already processing the same
        product identity, wait for that exact promise.
    
        This is critical for multi-user traffic and for
        SearchManager calling the adapter with multiple
        generated queries.
        =================================================
        */

        const inFlight =
            this.inFlightSearches.get(
                cacheKey
            );


        if (
            inFlight
        ) {

            console.log(
                "Amazon: Waiting for existing in-flight search."
            );


            return inFlight;

        }


        /*
        =================================================
        CREATE SEARCH PROMISE
        =================================================
        */

        const searchPromise =
            (async () => {

                /*
                =========================================
                BUILD QUERIES
                =========================================
                */

                const specificSearch =
                    Boolean(
                        originalProduct &&
                        (
                            originalProduct.brand ||
                            originalProduct.productName ||
                            originalProduct.model ||
                            originalProduct.variant ||
                            originalProduct.weight ||
                            originalProduct.flavour ||
                            originalProduct.color
                        )
                    );


                let queries;


                if (
                    specificSearch
                ) {

                    queries =
                        this.buildSearchQueries(
                            query,
                            originalProduct
                        );

                }
                else {

                    queries = [

                        this.normalizeSearchQuery(
                            query
                        )

                    ];

                }


                /*
                =========================================
                FALLBACK SAFETY
                =========================================
                */

                if (
                    queries.length === 0
                ) {

                    console.log(
                        "Amazon: No usable search query."
                    );


                    this.setCached(
                        cacheKey,
                        []
                    );


                    return [];

                }


                console.log(
                    "Amazon: Candidate search queries:",
                    queries
                );


                /*
                =========================================
                ALL QUERIES IN PARALLEL
                =========================================
                */

                console.log(
                    "⚡ Amazon: Running all search queries in parallel:",
                    queries
                );


                /*
                =====================================================
                ADAPTIVE AMAZON QUERY EXECUTION
    
                Specific product:
    
                    Wave 1:
                        Q1 + Q2 in parallel
    
                    Wave 2:
                        Q3 only when Wave 1 is not strong enough.
    
                Generic search:
    
                    execute the supplied query normally.
    
                IMPORTANT:
    
                This controls SEARCH DEPTH only.
    
                It does NOT replace the existing final
                merge/finalization logic.
                =====================================================
                */


                /*
                =====================================================
                LIGHTWEIGHT EARLY-STOP MATCHER
    
                This is intentionally conservative.
    
                For the requested product we require:
    
                    brand
                    product name
                    weight
                    flavour
    
                Optional fields:
    
                    model
                    variant
                    color
    
                This prevents a generic Boost result such as
                "Boost 200 g" from stopping the search when
                "Boost 800 g Chocolate" was requested.
                =====================================================
                */

                const hasStrongCandidate =
                    products => {

                        if (
                            !Array.isArray(
                                products
                            )
                        ) {

                            return false;

                        }


                        /*
                        ---------------------------------------------
                        NORMALIZER
                        ---------------------------------------------
                        */

                        const normalize =
                            value =>
                                String(
                                    value ?? ""
                                )
                                    .toLowerCase()
                                    .replace(
                                        /[^a-z0-9]+/g,
                                        " "
                                    )
                                    .replace(
                                        /\s+/g,
                                        " "
                                    )
                                    .trim();


                        /*
                        ---------------------------------------------
                        TOKEN CHECK
                        ---------------------------------------------
                        */

                        const containsAllTokens =
                            (
                                title,
                                requested
                            ) => {

                                const value =
                                    normalize(
                                        requested
                                    );


                                if (
                                    !value
                                ) {

                                    return true;

                                }


                                const requiredTokens =
                                    value
                                        .split(" ")
                                        .filter(
                                            token =>
                                                token.length >= 2
                                        );


                                return requiredTokens.every(
                                    token =>
                                        title.includes(
                                            token
                                        )
                                );

                            };


                        /*
                        ---------------------------------------------
                        WEIGHT NORMALIZER
                        ---------------------------------------------
                        */

                        const normalizeWeight =
                            value =>
                                normalize(
                                    value
                                )
                                    .replace(
                                        /(\d+)\s*g\b/g,
                                        "$1g"
                                    )
                                    .replace(
                                        /(\d+)\s*kg\b/g,
                                        "$1kg"
                                    );


                        /*
                        ---------------------------------------------
                        REQUESTED IDENTITY
                        ---------------------------------------------
                        */

                        const brand =
                            normalize(
                                originalProduct.brand
                            );


                        const productName =
                            normalize(
                                originalProduct.productName
                            );


                        const weight =
                            normalizeWeight(
                                originalProduct.weight
                            );


                        const flavour =
                            normalize(
                                originalProduct.flavour
                            );


                        const model =
                            normalize(
                                originalProduct.model
                            );


                        const variant =
                            normalize(
                                originalProduct.variant
                            );


                        const color =
                            normalize(
                                originalProduct.color
                            );


                        /*
                        ---------------------------------------------
                        CHECK EACH PRODUCT
                        ---------------------------------------------
                        */

                        return products.some(
                            product => {

                                if (
                                    !product ||
                                    !product.title
                                ) {

                                    return false;

                                }


                                const title =
                                    normalize(
                                        product.title
                                    );


                                /*
                                Brand
                                */

                                if (
                                    brand &&
                                    !containsAllTokens(
                                        title,
                                        brand
                                    )
                                ) {

                                    return false;

                                }


                                /*
                                Product name
                                */

                                if (
                                    productName &&
                                    !containsAllTokens(
                                        title,
                                        productName
                                    )
                                ) {

                                    return false;

                                }


                                /*
                                Weight
                                */

                                if (
                                    weight &&
                                    !normalizeWeight(
                                        title
                                    ).includes(
                                        weight
                                    )
                                ) {

                                    return false;

                                }


                                /*
                                Flavour
                                */

                                if (
                                    flavour &&
                                    !containsAllTokens(
                                        title,
                                        flavour
                                    )
                                ) {

                                    return false;

                                }


                                /*
                                Optional model
                                */

                                if (
                                    model &&
                                    !containsAllTokens(
                                        title,
                                        model
                                    )
                                ) {

                                    return false;

                                }


                                /*
                                Optional variant
                                */

                                if (
                                    variant &&
                                    !containsAllTokens(
                                        title,
                                        variant
                                    )
                                ) {

                                    return false;

                                }


                                /*
                                Optional colour
                                */

                                if (
                                    color &&
                                    !containsAllTokens(
                                        title,
                                        color
                                    )
                                ) {

                                    return false;

                                }


                                /*
                                Every requested identity field matched.
                                */

                                return true;

                            }
                        );

                    };


                /*
                =========================================
                GENERIC SEARCH
                =========================================
                */

                let resultSets = [];


                if (
                    !specificSearch
                ) {

                    /*
                    Generic searches only have the supplied query.
                    */

                    resultSets =
                        await Promise.all(
                            queries.map(
                                searchQuery =>
                                    this.searchSingleQuery(
                                        searchQuery
                                    )
                            )
                        );

                }
                else {

                    /*
                    =================================================
                    WAVE 1
                    =================================================
    
                    Q1 + Q2 run together.
                    */

                    const wave1Queries =
                        queries.slice(
                            0,
                            Math.min(
                                2,
                                queries.length
                            )
                        );


                    console.log(
                        "⚡ Amazon: Wave 1 queries in parallel:",
                        wave1Queries
                    );


                    const wave1Started =
                        Date.now();


                    const wave1Results =
                        await Promise.all(
                            wave1Queries.map(
                                searchQuery =>
                                    this.searchSingleQuery(
                                        searchQuery
                                    )
                            )
                        );


                    console.log(
                        `⏱ Amazon Wave 1: ${Date.now() -
                        wave1Started
                        } ms`
                    );


                    /*
                    =================================================
                    CHECK WAVE 1
                    =================================================
                    */

                    const strongWave1Candidate =
                        wave1Results.some(
                            results =>
                                hasStrongCandidate(
                                    results
                                )
                        );


                    /*
                    =================================================
                    WAVE 1 SUCCESS
                    =================================================
                    */

                    if (
                        strongWave1Candidate
                    ) {

                        console.log(
                            "🎯 Amazon: Strong candidate found in Wave 1. Skipping Q3."
                        );


                        resultSets =
                            wave1Results;

                    }
                    else if (
                        queries.length > 2
                    ) {

                        /*
                        =============================================
                        WAVE 2
                        =============================================
    
                        Q3 is only launched when Q1 + Q2 were
                        insufficient.
                        */

                        const q3 =
                            queries[2];


                        console.log(
                            `🔄 Amazon: Wave 1 insufficient. Running Q3: "${q3}"`
                        );


                        const q3Started =
                            Date.now();


                        const q3Results =
                            await this.searchSingleQuery(
                                q3
                            );


                        console.log(
                            `⏱ Amazon Q3: ${Date.now() -
                            q3Started
                            } ms`
                        );


                        resultSets =
                            [
                                ...wave1Results,
                                q3Results
                            ];

                    }
                    else {

                        /*
                        Only Q1/Q2 existed.
                        */

                        resultSets =
                            wave1Results;

                    }

                }


                /*
                =========================================
                MERGE
                =========================================
                */

                const merged =
                    this.mergeProducts(
                        resultSets
                    );


                console.log(
                    `Amazon: Total unique products after query merge: ${merged.length}`
                );


                /*
                =========================================
                FINALIZE
                =========================================
                */

                const finalProducts =
                    this.finalizeProducts(
                        merged
                    );


                /*
                =========================================
                CACHE
                =========================================
                */

                this.setCached(
                    cacheKey,
                    finalProducts
                );


                /*
                =========================================
                FINAL TIMING
                =========================================
                */

                console.log(
                    `Amazon: Batch search completed in ${Date.now() -
                    started
                    } ms`
                );


                return finalProducts;

            })();


        /*
        =================================================
        SAVE IN-FLIGHT PROMISE
        =================================================
        */

        this.inFlightSearches.set(
            cacheKey,
            searchPromise
        );


        try {

            return await searchPromise;

        }
        finally {

            /*
            Remove only this exact promise.
            */

            if (
                this.inFlightSearches.get(
                    cacheKey
                ) ===
                searchPromise
            ) {

                this.inFlightSearches.delete(
                    cacheKey
                );

            }

        }

    }

}


module.exports =
    new AmazonAdapter();