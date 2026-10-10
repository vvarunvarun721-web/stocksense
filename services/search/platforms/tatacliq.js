"use strict";

const axios = require("axios");
const BaseAdapter = require("./baseAdapter");

/*
=========================================================
OPTIONAL PLAYWRIGHT
=========================================================
*/

let chromium = null;

try {
    const playwright = require("playwright");
    chromium = playwright.chromium;
} catch (error) {
    console.log(
        "⚠️ TataCliq: Playwright not available. Browser fallback disabled."
    );
}


/*
=========================================================
CONFIGURATION
=========================================================
*/

const TATACLIQ_CONFIG = {

    API_URL:
        "https://searchbff.tatacliq.com/products/mpl/search",

    SITE_URL:
        "https://www.tatacliq.com",

    /*
    API must be the primary retrieval method.
    */

    API_MIN_TIMEOUT:
        200,

    API_MAX_TIMEOUT:
        1800,

    /*
    Browser is ONLY a fallback.
    */

    BROWSER_MIN_REMAINING:
        1000,

    BROWSER_NAVIGATION_MAX:
        900,

    BROWSER_WAIT_MAX:
        300,

    BROWSER_SELECTOR_MAX:
        400,

    BROWSER_SCROLL_WAIT:
        100,

    MAX_PRODUCTS:
        30,

    RETURN_PRODUCTS:
        20,

    USER_AGENT:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/149.0.0.0 Safari/537.36"
};


/*
=========================================================
TIME HELPERS
=========================================================
*/

function now() {
    return Date.now();
}


function sleep(
    ms,
    signal = null
) {

    if (
        !Number.isFinite(ms) ||
        ms <= 0
    ) {
        return Promise.resolve();
    }

    if (
        signal?.aborted
    ) {
        return Promise.reject(
            new Error(
                "TataCliq operation aborted"
            )
        );
    }

    return new Promise(
        (resolve, reject) => {

            let finished = false;

            const timer =
                setTimeout(
                    () => {

                        if (finished) {
                            return;
                        }

                        finished = true;

                        if (signal) {
                            signal.removeEventListener(
                                "abort",
                                onAbort
                            );
                        }

                        resolve();

                    },
                    ms
                );


            const onAbort =
                () => {

                    if (finished) {
                        return;
                    }

                    finished = true;

                    clearTimeout(timer);

                    if (signal) {
                        signal.removeEventListener(
                            "abort",
                            onAbort
                        );
                    }

                    reject(
                        new Error(
                            "TataCliq operation aborted"
                        )
                    );
                };


            if (signal) {

                signal.addEventListener(
                    "abort",
                    onAbort,
                    {
                        once: true
                    }
                );
            }

        }
    );
}


/*
=========================================================
TATACLIQ ADAPTER
=========================================================
*/

class TatacliqAdapter extends BaseAdapter {

    constructor() {

        super(
            "Tatacliq"
        );

        this.platform =
            "Tatacliq";
    }


    /*
    =====================================================
    DEADLINE
    =====================================================
    */

    getDeadline(
        options = {}
    ) {

        if (
            Number.isFinite(
                options.deadline
            )
        ) {
            return Number(
                options.deadline
            );
        }

        return now() + 3000;
    }


    remaining(
        options = {}
    ) {

        return Math.max(
            0,
            this.getDeadline(options) -
            now()
        );
    }


    isAborted(
        options = {}
    ) {

        return Boolean(
            options.signal?.aborted ||
            this.remaining(options) <= 0
        );
    }


    ensureTime(
        options = {}
    ) {

        if (
            options.signal?.aborted
        ) {

            throw new Error(
                "TataCliq operation aborted"
            );
        }


        if (
            this.remaining(options) <= 0
        ) {

            throw new Error(
                "TataCliq deadline exceeded"
            );
        }
    }


    /*
    =====================================================
    TEXT
    =====================================================
    */

    cleanText(
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


    /*
    =====================================================
    PRICE
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

        const price =
            Number(
                String(value)
                    .replace(
                        /[₹,\s]/g,
                        ""
                    )
                    .replace(
                        /[^\d.]/g,
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
    PRODUCT URL
    =====================================================
    */

    normalizeProductUrl(
        value
    ) {

        if (
            !value ||
            typeof value !== "string"
        ) {
            return null;
        }

        try {

            const parsed =
                new URL(
                    value,
                    TATACLIQ_CONFIG.SITE_URL
                );

            if (
                !parsed.pathname.includes(
                    "/p-mp"
                )
            ) {
                return null;
            }

            return (
                TATACLIQ_CONFIG.SITE_URL +
                parsed.pathname
            );

        } catch (_) {

            return null;
        }
    }


    /*
    =====================================================
    IMAGE
    =====================================================
    */

    isUsableImage(
        value
    ) {

        if (
            !value ||
            typeof value !== "string"
        ) {
            return false;
        }

        const image =
            value.trim();

        if (!image) {
            return false;
        }

        const lower =
            image.toLowerCase();


        /*
        Reject non-image placeholder sources.
        */

        if (
            lower.startsWith("data:") ||
            lower.startsWith("blob:")
        ) {
            return false;
        }


        const invalidPatterns = [

            "icon-512x512",
            "icon_512x512",

            "favicon",

            "logo",

            "placeholder",
            "place-holder",

            "default-image",
            "default_image",
            "defaultimage",

            "no-image",
            "no_image",
            "noimage",

            "transparent.gif",
            "transparent.png",

            "1x1",

            "loader.gif",
            "loading.gif",
            "spinner",

            "fallback-image",
            "fallback_image"

        ];


        if (
            invalidPatterns.some(
                pattern =>
                    lower.includes(
                        pattern
                    )
            )
        ) {
            return false;
        }


        return true;
    }


    normalizeImageUrl(
        value
    ) {

        if (
            !this.isUsableImage(
                value
            )
        ) {
            return null;
        }


        const image =
            String(value)
                .trim();


        if (
            image.startsWith("//")
        ) {
            return (
                "https:" +
                image
            );
        }


        if (
            image.startsWith("/")
        ) {
            return (
                TATACLIQ_CONFIG.SITE_URL +
                image
            );
        }


        return image;
    }


    /*
    =====================================================
    QUERY TOKENS
    =====================================================
    */

    getQueryTokens(
        query
    ) {

        return String(
            query || ""
        )
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                " "
            )
            .split(/\s+/)
            .filter(
                token =>
                    token.length >= 2
            );
    }


    getTitleTokens(
        title
    ) {

        return new Set(
            String(
                title || ""
            )
                .toLowerCase()
                .replace(
                    /[^a-z0-9]+/g,
                    " "
                )
                .split(/\s+/)
                .filter(Boolean)
        );
    }


    /*
    =====================================================
    RELEVANCE
    =====================================================
    */

    calculateRelevance(
        title,
        queryTokens
    ) {

        if (
            !title ||
            !Array.isArray(
                queryTokens
            ) ||
            queryTokens.length === 0
        ) {
            return 0;
        }


        const titleTokens =
            this.getTitleTokens(
                title
            );


        const numericTokens =
            queryTokens.filter(
                token =>
                    /\d/.test(token)
            );


        const normalTokens =
            queryTokens.filter(
                token =>
                    !/\d/.test(token)
            );


        let matched = 0;


        /*
        =================================================
        NUMERIC / MODEL TOKENS ARE MANDATORY
        =================================================

        This is the important protection.

        Example:

        Query:
        titan 90155 ap 03

        Candidate:
        Samsung Galaxy Watch8

        Missing:
        90155
        03

        Result:
        0

        It must NOT reach the relaxed fallback.
        */

        for (
            const token
            of numericTokens
        ) {

            if (
                !titleTokens.has(
                    token
                )
            ) {
                return 0;
            }

            matched++;
        }


        /*
        =================================================
        NORMAL TOKENS
        =================================================
        */

        for (
            const token
            of normalTokens
        ) {

            if (
                titleTokens.has(
                    token
                )
            ) {
                matched++;
            }
        }


        return (
            matched /
            queryTokens.length
        );
    }


    /*
    =====================================================
    API SEARCH
    =====================================================
    */

    async searchApi(
        query,
        options = {}
    ) {

        this.ensureTime(
            options
        );


        const remaining =
            this.remaining(
                options
            );


        /*
        Never spend the entire global budget
        inside TataCliq API.
        */

        const timeout =
            Math.max(
                TATACLIQ_CONFIG.API_MIN_TIMEOUT,

                Math.min(
                    TATACLIQ_CONFIG.API_MAX_TIMEOUT,
                    Math.max(
                        0,
                        remaining - 100
                    )
                )
            );


        if (
            timeout <= 0
        ) {
            return null;
        }


        const response =
            await axios.get(
                TATACLIQ_CONFIG.API_URL,
                {

                    params: {

                        searchText:
                            `${String(query).trim()}` +
                            ":relevance:inStockFlag:true",

                        isKeywordRedirect:
                            "false",

                        isKeywordRedirectEnabled:
                            "true",

                        channel:
                            "WEB",

                        isMDE:
                            "true",

                        isTextSearch:
                            "false",

                        isFilter:
                            "false",

                        qc:
                            "false",

                        test:
                            "invizbff.qpsv3-inviz.ab",

                        page:
                            0,

                        mcvid:
                            "",

                        customerId:
                            "",

                        isSuggested:
                            "false",

                        isFilterDataRequired:
                            "true",

                        isPwa:
                            "true",

                        pageSize:
                            40,

                        typeID:
                            "all"
                    },

                    headers: {

                        Accept:
                            "application/json, text/plain, */*",

                        "User-Agent":
                            TATACLIQ_CONFIG.USER_AGENT,

                        "Accept-Language":
                            "en-IN,en;q=0.9",

                        Referer:
                            `https://www.tatacliq.com/search/?searchCategory=all&text=${encodeURIComponent(
                                query
                            )}`,

                        Origin:
                            "https://www.tatacliq.com"
                    },

                    timeout,

                    signal:
                        options.signal ||
                        undefined,

                    validateStatus:
                        status =>
                            status >= 200 &&
                            status < 500
                }
            );


        console.log(
            `Tatacliq API status: ${response.status}`
        );


        if (
            response.status < 200 ||
            response.status >= 300
        ) {

            throw new Error(
                `TataCliq API HTTP ${response.status}`
            );
        }


        return response.data;
    }


    /*
    =====================================================
    NORMALIZE API PRODUCT
    =====================================================
    */

    normalizeProduct(
        item
    ) {

        if (
            !item ||
            typeof item !== "object"
        ) {
            return null;
        }


        const title =
            this.cleanText(
                item.productTitle ||
                item.productname ||
                item.title ||
                item.name
            );


        if (!title) {
            return null;
        }


        const price =
            this.parsePrice(
                item?.price?.sellingPrice?.doubleValue ??
                item?.price?.sellingPrice ??
                item?.sellingPrice ??
                item?.price
            );


        if (
            !Number.isFinite(
                price
            )
        ) {
            return null;
        }


        const url =
            this.normalizeProductUrl(
                item.webURL ||
                item.url ||
                item.productUrl
            );


        if (!url) {
            return null;
        }


        const image =
            this.normalizeImageUrl(
                item.imageURL ||
                item?.productImages?.[0] ||
                item?.image
            );


        return {

            platform:
                "Tatacliq",

            title,

            productName:
                title,

            price,

            image,

            url,

            productUrl:
                url,

            availability:
                item.inStockFlag !== false,

            productId:
                item.productId ||
                item.id ||
                null,

            brand:
                item.brandname ||
                item.brand ||
                null,

            mrp:
                this.parsePrice(
                    item?.price?.mrpPrice?.doubleValue ??
                    item?.price?.mrpPrice ??
                    item?.mrpPrice
                ),

            rating:
                Number(
                    item.ratingCount ||
                    item.rating ||
                    0
                ),

            reviews:
                Number(
                    item.totalNoOfReviews ||
                    item.reviews ||
                    0
                )
        };
    }


    /*
    =====================================================
    BROWSER FALLBACK
    =====================================================
    */

    async searchBrowser(
        query,
        options = {}
    ) {

        if (
            !chromium
        ) {

            console.log(
                "⚠️ TataCliq: Playwright unavailable."
            );

            return [];
        }


        this.ensureTime(
            options
        );


        /*
        Browser startup itself is expensive.

        Don't start it if we don't have enough
        time left.
        */

        const available =
            this.remaining(
                options
            );


        if (
            available <
            TATACLIQ_CONFIG.BROWSER_MIN_REMAINING
        ) {

            console.log(
                `⏭️ TataCliq browser skipped: only ${available}ms remaining`
            );

            return [];
        }


        let browser = null;
        let page = null;

        let abortHandler = null;

        const started =
            now();


        try {

            console.log(
                `🌐 TataCliq browser fallback: Searching "${query}"`
            );


            const searchUrl =
                `https://www.tatacliq.com/search?text=${encodeURIComponent(
                    query
                )}`;


            browser =
                await chromium.launch({
                    headless: true
                });


            this.ensureTime(
                options
            );


            page =
                await browser.newPage({
                    viewport: {
                        width: 1280,
                        height: 800
                    },

                    userAgent:
                        TATACLIQ_CONFIG.USER_AGENT,

                    locale:
                        "en-IN",

                    timezoneId:
                        "Asia/Kolkata"
                });


            await page.setExtraHTTPHeaders({
                "Accept-Language":
                    "en-IN,en;q=0.9"
            });


            /*
            Abort browser immediately when manager
            cancels this adapter.
            */

            if (
                options.signal
            ) {

                abortHandler =
                    () => {

                        Promise.resolve(
                            page?.close()
                        ).catch(
                            () => {}
                        );

                        Promise.resolve(
                            browser?.close()
                        ).catch(
                            () => {}
                        );
                    };


                options.signal.addEventListener(
                    "abort",
                    abortHandler,
                    {
                        once: true
                    }
                );
            }


            this.ensureTime(
                options
            );


            /*
            Navigation gets only a small portion
            of the remaining budget.
            */

            const remaining =
                this.remaining(
                    options
                );


            const navigationTimeout =
                Math.min(
                    TATACLIQ_CONFIG.BROWSER_NAVIGATION_MAX,
                    Math.max(
                        250,
                        remaining - 150
                    )
                );


            await page.goto(
                searchUrl,
                {
                    waitUntil:
                        "domcontentloaded",

                    timeout:
                        navigationTimeout
                }
            );


            this.ensureTime(
                options
            );


            /*
            Short client-side render wait.
            */

            const renderWait =
                Math.min(
                    TATACLIQ_CONFIG.BROWSER_WAIT_MAX,
                    Math.max(
                        0,
                        this.remaining(
                            options
                        ) - 150
                    )
                );


            if (
                renderWait > 0
            ) {

                await sleep(
                    renderWait,
                    options.signal
                );
            }


            this.ensureTime(
                options
            );


            /*
            Quick product selector check.
            */

            try {

                const selectorTimeout =
                    Math.min(
                        TATACLIQ_CONFIG.BROWSER_SELECTOR_MAX,
                        Math.max(
                            150,
                            this.remaining(
                                options
                            ) - 100
                        )
                    );


                await page.waitForSelector(
                    'a[href*="/p-mp"]',
                    {
                        timeout:
                            selectorTimeout
                    }
                );

            } catch (_) {}


            this.ensureTime(
                options
            );


            /*
            One tiny scroll only.
            */

            try {

                await page.evaluate(
                    () => {

                        window.scrollBy(
                            0,
                            500
                        );
                    }
                );


                await sleep(
                    Math.min(
                        TATACLIQ_CONFIG.BROWSER_SCROLL_WAIT,
                        Math.max(
                            0,
                            this.remaining(
                                options
                            ) - 100
                        )
                    ),
                    options.signal
                );

            } catch (_) {}


            this.ensureTime(
                options
            );


            /*
            =================================================
            DOM EXTRACTION
            =================================================
            */

            const rawProducts =
                await page.evaluate(
                    ({
                        maxProducts
                    }) => {

                        const results = [];
                        const seen = new Set();


                        function cleanUrl(
                            value
                        ) {

                            if (!value) {
                                return null;
                            }

                            try {

                                const url =
                                    new URL(
                                        value,
                                        "https://www.tatacliq.com"
                                    );


                                if (
                                    !url.pathname.includes(
                                        "/p-mp"
                                    )
                                ) {
                                    return null;
                                }


                                return (
                                    "https://www.tatacliq.com" +
                                    url.pathname
                                );

                            } catch (_) {

                                return null;
                            }
                        }


                        function getPrice(
                            card
                        ) {

                            const text =
                                String(
                                    card?.innerText ||
                                    ""
                                )
                                    .replace(
                                        /\s+/g,
                                        " "
                                    )
                                    .trim();


                            const matches =
                                text.match(
                                    /(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi
                                );


                            if (
                                !matches
                            ) {
                                return null;
                            }


                            for (
                                const match
                                of matches
                            ) {

                                const numberMatch =
                                    match.match(
                                        /([\d,]+(?:\.\d{1,2})?)/
                                    );


                                if (
                                    !numberMatch
                                ) {
                                    continue;
                                }


                                const value =
                                    Number(
                                        numberMatch[1]
                                            .replace(
                                                /,/g,
                                                ""
                                            )
                                    );


                                if (
                                    Number.isFinite(
                                        value
                                    ) &&
                                    value > 0
                                ) {
                                    return value;
                                }
                            }


                            return null;
                        }


                        function getTitle(
                            anchor,
                            card
                        ) {

                            const candidates = [];


                            const aria =
                                anchor.getAttribute(
                                    "aria-label"
                                );


                            if (aria) {
                                candidates.push(
                                    aria
                                );
                            }


                            const title =
                                anchor.getAttribute(
                                    "title"
                                );


                            if (title) {
                                candidates.push(
                                    title
                                );
                            }


                            for (
                                const img
                                of Array.from(
                                    card.querySelectorAll(
                                        "img"
                                    )
                                )
                            ) {

                                const alt =
                                    img.getAttribute(
                                        "alt"
                                    );


                                if (alt) {
                                    candidates.push(
                                        alt
                                    );
                                }
                            }


                            const titleNodes =
                                Array.from(
                                    card.querySelectorAll(
                                        [
                                            '[class*="title"]',
                                            '[class*="Title"]',
                                            '[class*="product-name"]',
                                            '[class*="ProductName"]',
                                            "h2",
                                            "h3",
                                            "h4"
                                        ].join(",")
                                    )
                                );


                            for (
                                const node
                                of titleNodes
                            ) {

                                const text =
                                    String(
                                        node.innerText ||
                                        node.textContent ||
                                        ""
                                    )
                                        .replace(
                                            /\s+/g,
                                            " "
                                        )
                                        .trim();


                                if (
                                    text.length >= 6
                                ) {

                                    candidates.push(
                                        text
                                    );
                                }
                            }


                            const anchorText =
                                String(
                                    anchor.innerText ||
                                    anchor.textContent ||
                                    ""
                                )
                                    .replace(
                                        /\s+/g,
                                        " "
                                    )
                                    .trim();


                            if (
                                anchorText
                            ) {

                                candidates.push(
                                    anchorText
                                );
                            }


                            const cleaned =
                                candidates
                                    .map(
                                        value =>
                                            String(
                                                value ||
                                                ""
                                            )
                                                .replace(
                                                    /\s+/g,
                                                    " "
                                                )
                                                .trim()
                                    )
                                    .filter(
                                        value =>
                                            value.length >= 6
                                    );


                            cleaned.sort(
                                (a, b) =>
                                    b.length -
                                    a.length
                            );


                            return (
                                cleaned[0] ||
                                ""
                            );
                        }


                        function getImage(
                            card
                        ) {

                            const candidates = [];


                            function add(
                                value
                            ) {

                                if (
                                    !value ||
                                    typeof value !==
                                    "string"
                                ) {
                                    return;
                                }


                                let image =
                                    value.trim();


                                if (!image) {
                                    return;
                                }


                                /*
                                Handle srcset.
                                */

                                if (
                                    image.includes(",")
                                ) {

                                    const parts =
                                        image
                                            .split(",")
                                            .map(
                                                part =>
                                                    part
                                                        .trim()
                                                        .split(
                                                            /\s+/
                                                        )[0]
                                            )
                                            .filter(
                                                Boolean
                                            );


                                    image =
                                        parts[
                                            parts.length - 1
                                        ] ||
                                        parts[0] ||
                                        image;
                                }


                                const lower =
                                    image.toLowerCase();


                                const invalidPatterns = [

                                    "icon-512x512",
                                    "icon_512x512",

                                    "favicon",

                                    "logo",

                                    "placeholder",
                                    "place-holder",

                                    "default-image",
                                    "default_image",
                                    "defaultimage",

                                    "no-image",
                                    "no_image",
                                    "noimage",

                                    "transparent.gif",
                                    "transparent.png",

                                    "1x1",

                                    "loader.gif",
                                    "loading.gif",
                                    "spinner",

                                    "fallback-image",
                                    "fallback_image"

                                ];


                                if (
                                    invalidPatterns.some(
                                        pattern =>
                                            lower.includes(
                                                pattern
                                            )
                                    )
                                ) {
                                    return;
                                }


                                if (
                                    lower.startsWith(
                                        "data:"
                                    ) ||
                                    lower.startsWith(
                                        "blob:"
                                    )
                                ) {
                                    return;
                                }


                                try {

                                    image =
                                        new URL(
                                            image,
                                            location.origin
                                        ).href;

                                } catch (_) {

                                    return;
                                }


                                if (
                                    !/^https?:\/\//i.test(
                                        image
                                    )
                                ) {
                                    return;
                                }


                                if (
                                    !candidates.includes(
                                        image
                                    )
                                ) {

                                    candidates.push(
                                        image
                                    );
                                }
                            }


                            const images =
                                Array.from(
                                    card.querySelectorAll(
                                        "img"
                                    )
                                );


                            for (
                                const img
                                of images
                            ) {

                                /*
                                Prefer lazy-loaded / responsive
                                product sources before src.
                                */

                                add(
                                    img.getAttribute(
                                        "data-src"
                                    )
                                );

                                add(
                                    img.getAttribute(
                                        "data-lazy-src"
                                    )
                                );

                                add(
                                    img.getAttribute(
                                        "data-original"
                                    )
                                );

                                add(
                                    img.getAttribute(
                                        "data-image"
                                    )
                                );

                                add(
                                    img.getAttribute(
                                        "data-image-url"
                                    )
                                );

                                add(
                                    img.getAttribute(
                                        "data-srcset"
                                    )
                                );

                                add(
                                    img.getAttribute(
                                        "srcset"
                                    )
                                );

                                add(
                                    img.currentSrc
                                );

                                add(
                                    img.getAttribute(
                                        "src"
                                    )
                                );
                            }


                            const sources =
                                Array.from(
                                    card.querySelectorAll(
                                        "source"
                                    )
                                );


                            for (
                                const source
                                of sources
                            ) {

                                add(
                                    source.getAttribute(
                                        "data-srcset"
                                    )
                                );

                                add(
                                    source.getAttribute(
                                        "srcset"
                                    )
                                );
                            }


                            return (
                                candidates[0] ||
                                null
                            );
                        }


                        const anchors =
                            Array.from(
                                document.querySelectorAll(
                                    'a[href*="/p-mp"]'
                                )
                            );


                        for (
                            const anchor
                            of anchors
                        ) {

                            if (
                                results.length >=
                                maxProducts
                            ) {
                                break;
                            }


                            const clean =
                                cleanUrl(
                                    anchor.href ||
                                    anchor.getAttribute(
                                        "href"
                                    )
                                );


                            if (
                                !clean ||
                                seen.has(clean)
                            ) {
                                continue;
                            }


                            seen.add(
                                clean
                            );


                            let card =
                                anchor;


                            for (
                                let level = 0;
                                level < 5;
                                level++
                            ) {

                                if (
                                    !card.parentElement
                                ) {
                                    break;
                                }


                                const parent =
                                    card.parentElement;


                                const text =
                                    String(
                                        parent.innerText ||
                                        ""
                                    )
                                        .replace(
                                            /\s+/g,
                                            " "
                                        )
                                        .trim();


                                if (
                                    text.length >= 15 &&
                                    text.length <= 2500
                                ) {

                                    card =
                                        parent;
                                }
                            }


                            const title =
                                getTitle(
                                    anchor,
                                    card
                                );


                            const price =
                                getPrice(
                                    card
                                );


                            if (
                                !title ||
                                !Number.isFinite(
                                    price
                                )
                            ) {
                                continue;
                            }


                            const image =
                                getImage(
                                    card
                                );


                            results.push({

                                title,

                                price,

                                image,

                                url:
                                    clean,

                                rating:
                                    null,

                                reviews:
                                    null,

                                availability:
                                    true
                            });
                        }


                        return results;

                    },
                    {
                        maxProducts:
                            TATACLIQ_CONFIG.MAX_PRODUCTS
                    }
                );


            console.log(
                `🌐 TataCliq browser extracted ${rawProducts.length} products`
            );


            const products =
                rawProducts
                    .map(
                        item => {

                            const title =
                                this.cleanText(
                                    item.title
                                );


                            const price =
                                this.parsePrice(
                                    item.price
                                );


                            const url =
                                this.normalizeProductUrl(
                                    item.url
                                );


                            if (
                                !title ||
                                !Number.isFinite(
                                    price
                                ) ||
                                !url
                            ) {
                                return null;
                            }


                            return {

                                platform:
                                    "Tatacliq",

                                title,

                                productName:
                                    title,

                                price,

                                image:
                                    this.normalizeImageUrl(
                                        item.image
                                    ),

                                url,

                                productUrl:
                                    url,

                                availability:
                                    item.availability !==
                                    false,

                                productId:
                                    null,

                                brand:
                                    null,

                                mrp:
                                    null,

                                rating:
                                    Number(
                                        item.rating ||
                                        0
                                    ),

                                reviews:
                                    Number(
                                        item.reviews ||
                                        0
                                    )
                            };
                        }
                    )
                    .filter(Boolean);


            console.log(
                `⏱ TataCliq browser fallback: ${now() - started}ms`
            );


            return products;

        } catch (error) {

            console.log(
                `⚠️ TataCliq browser stopped: ${error.message}`
            );

            return [];

        } finally {

            if (
                options.signal &&
                abortHandler
            ) {

                try {

                    options.signal.removeEventListener(
                        "abort",
                        abortHandler
                    );

                } catch (_) {}
            }


            try {

                if (page) {
                    await page.close();
                }

            } catch (_) {}


            try {

                if (browser) {
                    await browser.close();
                }

            } catch (_) {}
        }
    }


    /*
    =====================================================
    DEDUPLICATE
    =====================================================
    */

    deduplicate(
        products
    ) {

        const seen =
            new Set();

        const result =
            [];


        for (
            const product
            of Array.isArray(products)
                ? products
                : []
        ) {

            if (
                !product ||
                !product.url
            ) {
                continue;
            }


            const key =
                String(
                    product.url
                )
                    .toLowerCase()
                    .trim();


            if (
                seen.has(key)
            ) {
                continue;
            }


            seen.add(
                key
            );


            result.push(
                product
            );
        }


        return result;
    }


    /*
    =====================================================
    RANK
    =====================================================
    */

    rankProducts(
        products,
        query
    ) {

        if (
            !Array.isArray(
                products
            ) ||
            products.length === 0
        ) {
            return [];
        }


        const queryTokens =
            this.getQueryTokens(
                query
            );


        const ranked =
            products
                .map(
                    product => ({

                        ...product,

                        relevance:
                            this.calculateRelevance(
                                product.title ||
                                product.productName,
                                queryTokens
                            )

                    })
                )
                .filter(
                    product =>
                        product.relevance >
                        0
                )
                .sort(
                    (a, b) => {

                        if (
                            b.relevance !==
                            a.relevance
                        ) {

                            return (
                                b.relevance -
                                a.relevance
                            );
                        }


                        return (
                            Number(
                                a.price || 0
                            ) -
                            Number(
                                b.price || 0
                            )
                        );
                    }
                );


        return this.deduplicate(
            ranked
        ).slice(
            0,
            TATACLIQ_CONFIG.RETURN_PRODUCTS
        );
    }


    /*
    =====================================================
    SEARCH
    =====================================================
    */

    async search(
        query,
        originalProduct,
        options = {}
    ) {

        const started =
            now();


        const deadline =
            this.getDeadline(
                options
            );


        const signal =
            options.signal ||
            null;


        console.log(
            `Tatacliq: Searching "${query}"`
        );


        let products =
            [];


        /*
        =================================================
        STEP 1 — API
        =================================================
        */

        if (
            !this.isAborted(
                options
            )
        ) {

            try {

                const data =
                    await this.searchApi(
                        query,
                        {
                            deadline,
                            signal
                        }
                    );


                const searchResults =
                    Array.isArray(
                        data?.searchresult
                    )
                        ? data.searchresult
                        : [];


                console.log(
                    `Tatacliq: API raw results: ${searchResults.length}`
                );


                products =
                    searchResults
                        .map(
                            item =>
                                this.normalizeProduct(
                                    item
                                )
                        )
                        .filter(Boolean);


                console.log(
                    `Tatacliq: API normalized: ${products.length}`
                );

            } catch (error) {

                console.log(
                    `⚠️ TataCliq API failed: ${error.message}`
                );


                products =
                    [];
            }
        }


        /*
        =================================================
        STEP 2 — BROWSER ONLY IF NECESSARY
        =================================================
        */

        if (
            products.length === 0 &&
            !this.isAborted(
                options
            )
        ) {

            const remaining =
                this.remaining(
                    options
                );


            if (
                remaining >=
                TATACLIQ_CONFIG.BROWSER_MIN_REMAINING
            ) {

                console.log(
                    `🔄 TataCliq: API empty, browser fallback allowed (${remaining}ms remaining)`
                );


                try {

                    products =
                        await this.searchBrowser(
                            query,
                            {
                                deadline,
                                signal
                            }
                        );

                } catch (error) {

                    console.log(
                        `⚠️ TataCliq browser fallback failed: ${error.message}`
                    );


                    products =
                        [];
                }

            } else {

                console.log(
                    `⏭️ TataCliq browser skipped (${remaining}ms remaining)`
                );
            }
        }


        /*
        =================================================
        STEP 3 — NO RESULTS
        =================================================
        */

        if (
            products.length === 0
        ) {

            console.log(
                `Tatacliq: No products for "${query}"`
            );


            console.log(
                `⏱ Tatacliq: ${now() - started}ms`
            );


            return [];
        }


        /*
        =================================================
        STEP 4 — STRICT RANKING
        =================================================
        */

        const ranked =
            this.rankProducts(
                products,
                query
            );


        let output =
            ranked;


        /*
        =================================================
        STEP 5 — SAFE RELAXED FALLBACK
        =================================================

        IMPORTANT:

        If the query contains numeric/model tokens,
        DO NOT return unrelated raw API results when
        strict relevance returns zero.

        Example:

        Query:
        titan 90155 ap 03

        API:
        Samsung Galaxy Watch8

        Strict relevance:
        0

        OLD BEHAVIOR:
        Samsung returned ❌

        NEW BEHAVIOR:
        [] returned ✅

        This allows the upper fallback layer to reject
        the TataCliq fallback instead of poisoning the
        source product identity.
        =================================================
        */

        if (
            output.length === 0
        ) {

            const queryTokens =
                this.getQueryTokens(
                    query
                );


            const numericQueryTokens =
                queryTokens.filter(
                    token =>
                        /\d/.test(token)
                );


            if (
                numericQueryTokens.length > 0
            ) {

                console.log(
                    "❌ TataCliq strict relevance returned 0 for a model-specific query."
                );


                console.log(
                    "   Numeric/model tokens:",
                    numericQueryTokens
                );


                console.log(
                    "   Raw API/browser products will NOT be returned."
                );


                console.log(
                    `⏱ Tatacliq: ${now() - started}ms`
                );


                return [];
            }


            /*
            Generic query without a numeric/model
            identity can still use the relaxed fallback.
            */

            console.log(
                "⚠️ TataCliq strict relevance returned 0; using API/browser results for generic query"
            );


            output =
                this.deduplicate(
                    products
                ).slice(
                    0,
                    TATACLIQ_CONFIG.RETURN_PRODUCTS
                );
        }


        /*
        =================================================
        FINAL PRODUCT LOG
        =================================================
        */

        console.log(
            "🔍 TataCliq FINAL PRODUCTS:",
            output.map(
                product => ({

                    title:
                        product.title,

                    price:
                        product.price,

                    brand:
                        product.brand,

                    productId:
                        product.productId,

                    url:
                        product.url

                })
            )
        );


        console.log(
            `Tatacliq: Returning ${output.length} products`
        );


        console.log(
            `⏱ Tatacliq: ${now() - started}ms`
        );


        return output;
    }
}


/*
=========================================================
EXPORT SINGLETON
=========================================================
*/

module.exports =
    new TatacliqAdapter();