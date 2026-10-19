/*
=====================================================

NYKAA PLATFORM ADAPTER

Architecture:

SearchManager
        |
        v
Nykaa Adapter
        |
        +-- Cache
        |
        +-- In-Flight Protection
        |
        +-- Query Ladder
        |       Q1 -> Most Specific
        |       Q2 -> Core + Important Attributes
        |       Q3 -> Brand + Product
        |
        +-- Wave 1
        |       Q1 + Q2 Parallel
        |
        +-- Wave 2
        |       Q3 only if necessary
        |
        +-- Nykaa Search
        |
        +-- Product Extraction
        |
        +-- Identity Scoring
        |
        +-- Deduplication
        |
        +-- Final Sorting
        |
        +-- Cache Results

=====================================================
*/


const {
    getPage,
    closePage
} = require(
    "../../../utils/browserPool"
);


const BaseAdapter =
    require("./baseAdapter");



class NykaaAdapter extends BaseAdapter {


    constructor() {

        super("Nykaa");


        /*
        =================================================
        CACHE
        =================================================
        */

        this.searchCache =
            new Map();


        /*
        Prevent duplicate concurrent searches.

        If multiple requests search for the same product,
        they share the same running promise.
        */

        this.inFlightSearches =
            new Map();


        /*
        Cache results for 60 seconds.

        Product prices can change, so we should not keep
        platform search results cached for too long.
        */

        this.cacheTtl =
            60 * 1000;


        /*
        Maximum products returned by Nykaa.
        */

        this.maxResults =
            20;

    }



    /*
    =====================================================
    BASIC TEXT CLEANER
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
        Example:

        50ml
        ->
        50 ml
        */

        value =
            value.replace(
                /(\d)([a-zA-Z])/g,
                "$1 $2"
            );


        /*
        Example:

        Serum30
        ->
        Serum 30
        */

        value =
            value.replace(
                /([a-zA-Z])(\d)/g,
                "$1 $2"
            );


        return value
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    }



    /*
    =====================================================
    BUILD INTELLIGENT SEARCH QUERY
    =====================================================

    Used when the adapter needs to reconstruct
    product identity from normalized product data.
    */

    buildSearchQuery(
        query,
        originalProduct = {}
    ) {

        const parts = [];


        if (
            originalProduct.brand
        ) {

            parts.push(
                this.cleanText(
                    originalProduct.brand
                )
            );

        }


        if (
            originalProduct.productName
        ) {

            parts.push(
                this.cleanText(
                    originalProduct.productName
                )
            );

        }


        if (
            originalProduct.model
        ) {

            parts.push(
                this.cleanText(
                    originalProduct.model
                )
            );

        }


        if (
            originalProduct.variant
        ) {

            parts.push(
                this.cleanText(
                    originalProduct.variant
                )
            );

        }


        if (
            originalProduct.weight
        ) {

            parts.push(
                this.cleanText(
                    originalProduct.weight
                )
            );

        }


        if (
            originalProduct.flavour
        ) {

            parts.push(
                this.cleanText(
                    originalProduct.flavour
                )
            );

        }


        if (
            originalProduct.color
        ) {

            parts.push(
                this.cleanText(
                    originalProduct.color
                )
            );

        }


        const intelligentQuery =
            this.normalizeSearchQuery(
                parts
                    .filter(Boolean)
                    .join(" ")
            );


        if (
            intelligentQuery
        ) {

            return intelligentQuery;

        }


        return this.normalizeSearchQuery(
            query
        );

    }



    /*
    =====================================================
    BUILD NYKAA QUERY LADDER
    =====================================================

    Q1
    Most specific search.

    brand
    + productName
    + model
    + variant
    + weight
    + flavour
    + color


    Q2
    Core product identity.

    brand
    + productName
    + model
    + variant
    + flavour


    Q3
    Broad identity.

    brand
    + productName

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
        =================================================
        Q1 — MOST SPECIFIC
        =================================================
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
        =================================================
        Q2 — CORE IDENTITY
        =================================================
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
            !queries.includes(q2)
        ) {

            queries.push(
                q2
            );

        }



        /*
        =================================================
        Q3 — BROAD SEARCH
        =================================================
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
            !queries.includes(q3)
        ) {

            queries.push(
                q3
            );

        }



        /*
        =================================================
        GENERIC FALLBACK
        =================================================
        */

        if (
            queries.length === 0 &&
            query
        ) {

            const fallback =
                this.normalizeSearchQuery(
                    query
                );


            if (
                fallback
            ) {

                queries.push(
                    fallback
                );

            }

        }


        return [
            ...new Set(
                queries.filter(Boolean)
            )
        ]
            .slice(
                0,
                3
            );

    }



    /*
    =====================================================
    SEARCH CACHE KEY
    =====================================================
    */

    getSearchCacheKey(
        query,
        originalProduct = {}
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
                    String(value)
                        .toLowerCase()
                        .trim()
            )
            .join("|");


        /*
        Specific StockSense product.
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


        /*
        Generic search.
        */

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
    CACHE GET
    =====================================================
    */

    getCached(
        key
    ) {

        const entry =
            this.searchCache.get(
                key
            );


        if (
            !entry
        ) {

            return null;

        }


        /*
        Cache expired.
        */

        if (
            Date.now() -
            entry.timestamp >
            this.cacheTtl
        ) {

            this.searchCache.delete(
                key
            );

            return null;

        }


        /*
        Return copies.

        Prevent accidental mutation of cached objects.
        */

        return entry.products.map(
            product => ({
                ...product
            })
        );

    }



    /*
    =====================================================
    CACHE SET
    =====================================================
    */

    setCached(
        key,
        products = []
    ) {

        this.searchCache.set(
            key,
            {

                timestamp:
                    Date.now(),

                products:
                    products.map(
                        product => ({
                            ...product
                        })
                    )

            }
        );


        /*
        Prevent unlimited memory growth.
        */

        while (
            this.searchCache.size >
            100
        ) {

            const firstKey =
                this.searchCache
                    .keys()
                    .next()
                    .value;


            if (
                firstKey === undefined
            ) {

                break;

            }


            this.searchCache.delete(
                firstKey
            );

        }

    }



    /*
    =====================================================
    PARSE PRICE
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


        const text =
            String(value)
                .replace(
                    /,/g,
                    ""
                );


        /*
        ₹1,299
        ₹ 1299
        */

        const match =
            text.match(
                /₹\s*([\d]+(?:\.\d+)?)/i
            );


        if (
            match
        ) {

            const price =
                Number(
                    match[1]
                );


            return Number.isFinite(price)
                ? price
                : null;

        }


        /*
        Fallback.

        Remove everything except digits and decimal.
        */

        const digits =
            text.replace(
                /[^\d.]/g,
                ""
            );


        if (
            !digits
        ) {

            return null;

        }


        const price =
            Number(digits);


        return Number.isFinite(price)
            ? price
            : null;

    }



    /*
    =====================================================
    NORMALIZE NYKAA PRODUCT URL
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
                    "https://www.nykaa.com"
                );


            /*
            Only allow Nykaa product pages.
            */

            if (
                !parsed.hostname
                    .toLowerCase()
                    .includes("nykaa.com")
            ) {

                return null;

            }


            /*
            Remove tracking parameters.

            Keep only clean product URL.
            */

            parsed.search = "";


            parsed.hash = "";


            return parsed.toString();

        }

        catch (_) {

            return null;

        }

    }



    /*
    =====================================================
    NORMALIZE IMAGE URL
    =====================================================
    */

    normalizeImageUrl(
        value
    ) {

        if (
            !value ||
            typeof value !== "string"
        ) {

            return null;

        }


        const image =
            value.trim();


        if (
            !image
        ) {

            return null;

        }


        if (
            image.startsWith("//")
        ) {

            return (
                "https:" +
                image
            );

        }


        try {

            return new URL(
                image,
                "https://www.nykaa.com"
            ).toString();

        }

        catch (_) {

            return null;

        }

    }



    /*
    =====================================================
    CLEAN NYKAA TITLE
    =====================================================
    */

    cleanNykaaTitle(
        value
    ) {

        let title =
            this.cleanText(
                value
            );


        if (
            !title
        ) {

            return "";

        }


        /*
        Remove obvious UI noise.
        */

        title =
            title
                .replace(
                    /\bSponsored\b/gi,
                    " "
                )
                .replace(
                    /\bBest Seller\b/gi,
                    " "
                )
                .replace(
                    /\bNew\b/gi,
                    " "
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
    EXTRACT RESULTS FROM CURRENT PAGE
    =====================================================

    Nykaa can change class names frequently.

    Therefore we use:

    1. Multiple card selectors
    2. Multiple title selectors
    3. Multiple price selectors
    4. Generic fallback extraction

    =====================================================
    */

    async extractSearchResults(
        page
    ) {

        /*
        =================================================
        PRODUCT CARD SELECTORS
        =================================================
        */

        const cardSelectors = [

            "[data-testid='product-card']",

            "div[class*='productWrapper']",

            "div[class*='ProductCard']",

            "a[href*='/p/']"

        ];


        let cards = null;

        let cardCount = 0;


        /*
        =================================================
        FIND FIRST WORKING SELECTOR
        =================================================
        */

        for (
            const selector
            of cardSelectors
        ) {

            const locator =
                page.locator(
                    selector
                );


            const count =
                await locator
                    .count()
                    .catch(
                        () => 0
                    );


            if (
                count > 0
            ) {

                cards =
                    locator;

                cardCount =
                    count;

                break;

            }

        }



        /*
        =================================================
        SHORT WAIT
        =================================================
        */

        if (
            !cards ||
            cardCount === 0
        ) {

            for (
                const selector
                of cardSelectors
            ) {

                try {

                    await page.waitForSelector(
                        selector,
                        {

                            state:
                                "attached",

                            timeout:
                                2500

                        }
                    );

                }

                catch (_) {

                    continue;

                }


                const locator =
                    page.locator(
                        selector
                    );


                const count =
                    await locator
                        .count()
                        .catch(
                            () => 0
                        );


                if (
                    count > 0
                ) {

                    cards =
                        locator;

                    cardCount =
                        count;

                    break;

                }

            }

        }


        console.log(
            `Nykaa: Search cards found: ${cardCount}`
        );


        if (
            !cards ||
            cardCount === 0
        ) {

            return [];

        }



        /*
        =================================================
        EXTRACT RAW PRODUCTS
        =================================================
        */

        const rawProducts =
            await cards.evaluateAll(
                nodes => {


                    const LIMIT =
                        Math.min(
                            nodes.length,
                            30
                        );


                    const products = [];


                    function clean(
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


                    function getText(
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

                                const value =
                                    clean(
                                        element.textContent
                                    );


                                if (
                                    value
                                ) {

                                    return value;

                                }

                            }

                        }


                        return "";

                    }


                    function getAttribute(
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


                        return "";

                    }


                    for (
                        let index = 0;
                        index < LIMIT;
                        index++
                    ) {

                        const node =
                            nodes[index];


                        /*
                        =====================================
                        LINK
                        =====================================
                        */

                        let linkElement =
                            null;


                        if (
                            node.tagName === "A" &&
                            node.href
                        ) {

                            linkElement =
                                node;

                        }

                        else {

                            linkElement =
                                node.querySelector(
                                    "a[href]"
                                );

                        }


                        const href =
                            linkElement
                                ? linkElement.href
                                : "";


                        /*
                        =====================================
                        TITLE
                        =====================================
                        */

                        let title =
                            getText(
                                node,
                                [

                                    "[data-testid='product-title']",

                                    "div[class*='productName']",

                                    "div[class*='ProductName']",

                                    "h2",

                                    "h3",

                                    "a[title]"

                                ]
                            );


                        /*
                        Fallback:
                        title attribute.
                        */

                        if (
                            !title
                        ) {

                            title =
                                getAttribute(
                                    node,
                                    [

                                        "a[title]"

                                    ],

                                    "title"
                                );

                        }


                        /*
                        =====================================
                        BRAND
                        =====================================
                        */

                        const brand =
                            getText(
                                node,
                                [

                                    "[data-testid='product-brand']",

                                    "div[class*='brandName']",

                                    "span[class*='brand']"

                                ]
                            );


                        /*
                        =====================================
                        PRICE
                        =====================================
                        */

                        const priceText =
                            getText(
                                node,
                                [

                                    "[data-testid='selling-price']",

                                    "span[class*='sellingPrice']",

                                    "div[class*='sellingPrice']",

                                    "span[class*='price']",

                                    "div[class*='price']"

                                ]
                            );


                        /*
                        =====================================
                        ORIGINAL PRICE
                        =====================================
                        */

                        const originalPriceText =
                            getText(
                                node,
                                [

                                    "[data-testid='original-price']",

                                    "span[class*='originalPrice']",

                                    "span[class*='mrp']",

                                    "div[class*='mrp']"

                                ]
                            );


                        /*
                        =====================================
                        IMAGE
                        =====================================
                        */

                        const imageElement =
                            node.querySelector(
                                "img"
                            );


                        const image =
                            imageElement
                                ? (
                                    imageElement.currentSrc ||
                                    imageElement.src ||
                                    imageElement.getAttribute(
                                        "data-src"
                                    ) ||
                                    ""
                                )
                                : "";


                        /*
                        =====================================
                        RATING
                        =====================================
                        */

                        const rating =
                            getText(
                                node,
                                [

                                    "[data-testid='rating']",

                                    "span[class*='rating']",

                                    "div[class*='rating']"

                                ]
                            );


                        /*
                        =====================================
                        VALIDATION
                        =====================================
                        */

                        if (
                            !title ||
                            !href
                        ) {

                            continue;

                        }


                        /*
                        Avoid navigation links,
                        category links, etc.
                        */

                        if (
                            !href.includes(
                                "nykaa.com"
                            )
                        ) {

                            continue;

                        }


                        products.push({

                            title,

                            brand,

                            priceText,

                            originalPriceText,

                            image,

                            url:
                                href,

                            rating

                        });

                    }


                    return products;

                }
            );


        /*
        =================================================
        NORMALIZE RESULTS
        =================================================
        */

        const products = [];


        for (
            const raw
            of rawProducts
        ) {

            const title =
                this.cleanNykaaTitle(
                    raw.title
                );


            if (
                !title
            ) {

                continue;

            }


            const url =
                this.normalizeProductUrl(
                    raw.url
                );


            if (
                !url
            ) {

                continue;

            }


            const price =
                this.parsePrice(
                    raw.priceText
                );


            const originalPrice =
                this.parsePrice(
                    raw.originalPriceText
                );


            const image =
                this.normalizeImageUrl(
                    raw.image
                );


            const ratingMatch =
                String(
                    raw.rating || ""
                ).match(
                    /(\d+(?:\.\d+)?)/
                );


            const rating =
                ratingMatch
                    ? Number(
                        ratingMatch[1]
                    )
                    : null;


            products.push({

                platform:
                    "Nykaa",

                title,

                brand:
                    this.cleanText(
                        raw.brand
                    ),

                price,

                originalPrice,

                image,

                url,

                rating,

                availability:
                    "UNKNOWN"

            });

        }


        return products;

    }



    /*
    =====================================================
    SEARCH SINGLE QUERY
    =====================================================
    */

    async searchSingleQuery(
        query
    ) {

        if (
            !query
        ) {

            return [];

        }


        let page = null;


        const started =
            Date.now();


        try {

            page =
                await getPage();


            const searchUrl =
                `https://www.nykaa.com/search/result/?q=${encodeURIComponent(
                    query
                )}`;


            console.log(
                `🔎 Nykaa searching: "${query}"`
            );


            /*
            =================================================
            NAVIGATION
            =================================================
            */

            await page.goto(
                searchUrl,
                {

                    waitUntil:
                        "domcontentloaded",

                    timeout:
                        15000

                }
            );


            /*
            Small bounded wait for client-side rendering.
            */

            await page.waitForLoadState(
                "domcontentloaded"
            )
                .catch(
                    () => { }
                );


            const results =
                await this.extractSearchResults(
                    page
                );


            console.log(
                `Nykaa: "${query}" returned ${results.length} products in ${Date.now() - started} ms`
            );


            return results;

        }

        catch (
        error
        ) {

            console.error(
                `❌ Nykaa query failed: "${query}"`
            );


            console.error(
                error.message
            );


            return [];

        }

        finally {

            if (
                page
            ) {

                await closePage(
                    page
                )
                    .catch(
                        () => { }
                    );

            }

        }

    }



    /*
    =====================================================
    SCORE PRODUCT IDENTITY
    =====================================================

    This is NOT the final Product Intelligence layer.

    CandidateCollector remains the main authority.

    This score only helps Nykaa decide:

        - which products are stronger
        - whether Q3 is needed
        - final sorting

    =====================================================
    */

    scoreProductIdentity(
        candidate,
        originalProduct = {}
    ) {

        const title =
            this.cleanText(
                candidate.title
            )
                .toLowerCase();


        const requested =
            originalProduct || {};


        let score = 0;


        const checks = [];


        function includesValue(
            value
        ) {

            if (
                value === null ||
                value === undefined ||
                String(value).trim() === ""
            ) {

                return false;

            }


            return title.includes(
                String(value)
                    .toLowerCase()
                    .trim()
            );

        }



        /*
        =================================================
        BRAND
        =================================================
        */

        if (
            requested.brand
        ) {

            const matched =
                includesValue(
                    requested.brand
                );


            checks.push({

                field:
                    "brand",

                matched

            });


            if (
                matched
            ) {

                score += 30;

            }

        }



        /*
        =================================================
        PRODUCT NAME
        =================================================
        */

        if (
            requested.productName
        ) {

            const words =
                this.cleanText(
                    requested.productName
                )
                    .toLowerCase()
                    .split(/\s+/)
                    .filter(
                        word =>
                            word.length >= 3
                    );


            if (
                words.length > 0
            ) {

                const matchedWords =
                    words.filter(
                        word =>
                            title.includes(word)
                    ).length;


                const ratio =
                    matchedWords /
                    words.length;


                checks.push({

                    field:
                        "productName",

                    ratio

                });


                if (
                    ratio === 1
                ) {

                    score += 30;

                }

                else if (
                    ratio >= 0.7
                ) {

                    score += 22;

                }

                else if (
                    ratio >= 0.5
                ) {

                    score += 12;

                }

            }

        }



        /*
        =================================================
        MODEL
        =================================================
        */

        if (
            requested.model
        ) {

            const matched =
                includesValue(
                    requested.model
                );


            checks.push({

                field:
                    "model",

                matched

            });


            if (
                matched
            ) {

                score += 20;

            }

        }



        /*
        =================================================
        VARIANT
        =================================================
        */

        if (
            requested.variant
        ) {

            const matched =
                includesValue(
                    requested.variant
                );


            checks.push({

                field:
                    "variant",

                matched

            });


            if (
                matched
            ) {

                score += 10;

            }

        }



        /*
        =================================================
        WEIGHT
        =================================================
        */

        if (
            requested.weight
        ) {

            const normalizedWeight =
                this.normalizeSearchQuery(
                    requested.weight
                )
                    .toLowerCase();


            const matched =
                title.includes(
                    normalizedWeight
                );


            checks.push({

                field:
                    "weight",

                matched

            });


            if (
                matched
            ) {

                score += 15;

            }

        }



        /*
        =================================================
        FLAVOUR
        =================================================
        */

        if (
            requested.flavour
        ) {

            const matched =
                includesValue(
                    requested.flavour
                );


            checks.push({

                field:
                    "flavour",

                matched

            });


            if (
                matched
            ) {

                score += 10;

            }

        }



        /*
        =================================================
        COLOR
        =================================================
        */

        if (
            requested.color
        ) {

            const matched =
                includesValue(
                    requested.color
                );


            checks.push({

                field:
                    "color",

                matched

            });


            if (
                matched
            ) {

                score += 5;

            }

        }


        return {

            score,

            checks

        };

    }



    /*
    =====================================================
    ADD IDENTITY SCORES
    =====================================================
    */

    scoreProducts(
        products = [],
        originalProduct = {}
    ) {

        return products.map(
            product => {

                const identity =
                    this.scoreProductIdentity(
                        product,
                        originalProduct
                    );


                return {

                    ...product,

                    identityScore:
                        identity.score,

                    identityChecks:
                        identity.checks

                };

            }
        );

    }



    /*
    =====================================================
    STRONG CANDIDATE CHECK
    =====================================================

    Score >= 60 means Wave 1 probably found
    a useful candidate.

    CandidateCollector still performs final verification.
    */

    hasStrongCandidate(
        products = []
    ) {

        return products.some(
            product =>
                Number(
                    product.identityScore || 0
                ) >= 60
        );

    }



    /*
    =====================================================
    DEDUPLICATE PRODUCTS
    =====================================================
    */

    deduplicateProducts(
        products = []
    ) {

        const seen =
            new Map();


        for (
            const product
            of products
        ) {

            if (
                !product ||
                !product.title
            ) {

                continue;

            }


            const url =
                String(
                    product.url || ""
                )
                    .trim()
                    .toLowerCase();


            const title =
                this.cleanText(
                    product.title
                )
                    .toLowerCase();


            const key =
                url
                    ? `url:${url}`
                    : `title:${title}`;


            const existing =
                seen.get(key);


            /*
            Keep stronger duplicate.
            */

            if (
                !existing
            ) {

                seen.set(
                    key,
                    product
                );

                continue;

            }


            const existingScore =
                Number(
                    existing.identityScore || 0
                );


            const newScore =
                Number(
                    product.identityScore || 0
                );


            if (
                newScore >
                existingScore
            ) {

                seen.set(
                    key,
                    product
                );

            }

        }


        return [
            ...seen.values()
        ];

    }



    /*
    =====================================================
    MERGE QUERY RESULT SETS
    =====================================================
    */

    mergeProducts(
        resultSets = []
    ) {

        const allProducts =
            resultSets.flatMap(
                results =>
                    Array.isArray(results)
                        ? results
                        : []
            );


        return this.deduplicateProducts(
            allProducts
        );

    }



    /*
    =====================================================
    FINALIZE PRODUCTS
    =====================================================
    */

    finalizeProducts(
        products = []
    ) {

        const deduplicated =
            this.deduplicateProducts(
                products
            );


        return deduplicated

            .filter(
                product =>
                    product.title &&
                    product.url
            )

            .sort(
                (
                    a,
                    b
                ) => {

                    const scoreDifference =
                        Number(
                            b.identityScore || 0
                        ) -
                        Number(
                            a.identityScore || 0
                        );


                    if (
                        scoreDifference !== 0
                    ) {

                        return scoreDifference;

                    }


                    /*
                    Prefer products with valid prices.
                    */

                    const aHasPrice =
                        Number.isFinite(
                            a.price
                        )
                            ? 1
                            : 0;


                    const bHasPrice =
                        Number.isFinite(
                            b.price
                        )
                            ? 1
                            : 0;


                    return (
                        bHasPrice -
                        aHasPrice
                    );

                }
            )

            .slice(
                0,
                this.maxResults
            )

            .map(
                product => ({

                    ...product,

                    platform:
                        "Nykaa"

                })
            );

    }



    /*
    =====================================================
    MAIN SEARCH
    =====================================================
    */

    async search(
        query,
        originalProduct = {}
    ) {

        const started =
            Date.now();


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
        CACHE HIT
        =================================================
        */

        const cached =
            this.getCached(
                cacheKey
            );


        if (
            cached
        ) {

            console.log(
                `⚡ Nykaa cache hit: ${cached.length} products`
            );


            return cached;

        }



        /*
        =================================================
        IN-FLIGHT HIT
        =================================================
        */

        const existingSearch =
            this.inFlightSearches.get(
                cacheKey
            );


        if (
            existingSearch
        ) {

            console.log(
                "⏳ Nykaa: Reusing in-flight search"
            );


            return existingSearch;

        }



        /*
        =================================================
        CREATE SEARCH PROMISE
        =================================================
        */

        const searchPromise =
            (
                async () => {


                    /*
                    =============================================
                    BUILD QUERY LADDER
                    =============================================
                    */

                    const queries =
                        this.buildSearchQueries(
                            query,
                            originalProduct
                        );


                    console.log(
                        "🔎 Nykaa Query Ladder:",
                        queries
                    );


                    if (
                        queries.length === 0
                    ) {

                        return [];

                    }


                    let resultSets =
                        [];


                    /*
                    =============================================
                    ONE QUERY ONLY
                    =============================================
                    */

                    if (
                        queries.length === 1
                    ) {

                        const results =
                            await this.searchSingleQuery(
                                queries[0]
                            );


                        const scored =
                            this.scoreProducts(
                                results,
                                originalProduct
                            );


                        resultSets =
                            [
                                scored
                            ];

                    }



                    /*
                    =============================================
                    WAVE 1

                    Q1 + Q2 PARALLEL
                    =============================================
                    */

                    else {

                        const wave1Queries =
                            queries.slice(
                                0,
                                2
                            );


                        console.log(
                            `🚀 Nykaa Wave 1: ${wave1Queries.join(" | ")}`
                        );


                        const waveStarted =
                            Date.now();


                        const wave1Raw =
                            await Promise.all(

                                wave1Queries.map(
                                    queryItem =>
                                        this.searchSingleQuery(
                                            queryItem
                                        )
                                )

                            );


                        const wave1Results =
                            wave1Raw.map(
                                results =>
                                    this.scoreProducts(
                                        results,
                                        originalProduct
                                    )
                            );


                        console.log(
                            `⏱ Nykaa Wave 1: ${Date.now() - waveStarted} ms`
                        );


                        /*
                        =========================================
                        CHECK WAVE 1
                        =========================================
                        */

                        const strongCandidate =
                            wave1Results.some(
                                results =>
                                    this.hasStrongCandidate(
                                        results
                                    )
                            );


                        /*
                        =========================================
                        STRONG RESULT FOUND

                        Skip Q3.
                        =========================================
                        */

                        if (
                            strongCandidate
                        ) {

                            console.log(
                                "🎯 Nykaa: Strong candidate found in Wave 1. Skipping Q3."
                            );


                            resultSets =
                                wave1Results;

                        }



                        /*
                        =========================================
                        WAVE 2

                        Run Q3 only when necessary.
                        =========================================
                        */

                        else if (
                            queries.length > 2
                        ) {

                            const q3 =
                                queries[2];


                            console.log(
                                `🔄 Nykaa: Wave 1 insufficient. Running Q3: "${q3}"`
                            );


                            const q3Started =
                                Date.now();


                            const q3Raw =
                                await this.searchSingleQuery(
                                    q3
                                );


                            const q3Results =
                                this.scoreProducts(
                                    q3Raw,
                                    originalProduct
                                );


                            console.log(
                                `⏱ Nykaa Q3: ${Date.now() - q3Started} ms`
                            );


                            resultSets =
                                [

                                    ...wave1Results,

                                    q3Results

                                ];

                        }



                        /*
                        =========================================
                        ONLY Q1 + Q2 EXISTED
                        =========================================
                        */

                        else {

                            resultSets =
                                wave1Results;

                        }

                    }



                    /*
                    =============================================
                    MERGE RESULTS
                    =============================================
                    */

                    const merged =
                        this.mergeProducts(
                            resultSets
                        );


                    console.log(
                        `Nykaa: Total unique products after query merge: ${merged.length}`
                    );



                    /*
                    =============================================
                    FINALIZE
                    =============================================
                    */

                    const finalProducts =
                        this.finalizeProducts(
                            merged
                        );


                    console.log(
                        `✅ Nykaa: Final products: ${finalProducts.length}`
                    );



                    /*
                    =============================================
                    CACHE
                    =============================================
                    */

                    this.setCached(
                        cacheKey,
                        finalProducts
                    );


                    console.log(
                        `⏱ Nykaa search completed in ${Date.now() - started} ms`
                    );


                    return finalProducts;

                }
            )();



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



/*
=====================================================
EXPORT
=====================================================
*/

module.exports =
    new NykaaAdapter();