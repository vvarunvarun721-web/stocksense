const {
    getPage,
    closePage
} = require("../../../utils/browserPool");

const BaseAdapter =
    require("./baseAdapter");


class MeeshoAdapter extends BaseAdapter {

    constructor() {

        super("Meesho");


        /*
        =====================================================
        CACHE
        =====================================================
        */

        this.searchCache =
            new Map();


        this.cacheTtl =
            60 * 1000;


        /*
        Maximum candidates returned to the global
        candidate collector.
        */

        this.maxResults =
            20;


        /*
        Maximum normal API wait after navigation.
        */

        this.apiWaitTimeout =
            4000;

    }


    /*
    =====================================================
    BASIC TEXT
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
            );


        /*
        Drink800
        ->
        Drink 800
        */

        value =
            value.replace(
                /([a-zA-Z])(\d)/g,
                "$1 $2"
            );


        /*
        800g
        ->
        800 g
        */

        value =
            value.replace(
                /(\d)([a-zA-Z])/g,
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


        if (
            typeof value ===
            "number"
        ) {

            return Number.isFinite(
                value
            )
                ? value
                : null;

        }


        const match =
            String(
                value
            ).match(
                /₹?\s*([\d,]+(?:\.\d+)?)/
            );


        if (
            !match
        ) {

            return null;

        }


        const price =
            Number(
                match[1].replace(
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
    IMAGE
    =====================================================
    */

    normalizeImageUrl(
        value
    ) {

        if (
            !value ||
            typeof value !==
            "string"
        ) {

            return null;

        }


        if (
            value.startsWith("//")
        ) {

            return (
                "https:" +
                value
            );

        }


        return value;

    }


    /*
    =====================================================
    TOKENIZATION
    =====================================================
    */

    getQueryTokens(
        query
    ) {

        return String(
            query ?? ""
        )
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                " "
            )
            .split(
                /\s+/
            )
            .filter(
                token =>
                    token.length >= 2
            );

    }


    /*
    =====================================================
    WHOLE PHRASE MATCH
    =====================================================
    */

    containsWholePhrase(
        title,
        value
    ) {

        if (
            !title ||
            !value
        ) {

            return false;

        }


        const titleTokens =
            new Set(
                String(
                    title
                )
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9]+/g,
                        " "
                    )
                    .split(
                        /\s+/
                    )
                    .filter(Boolean)
            );


        const valueTokens =
            this.getQueryTokens(
                value
            );


        if (
            valueTokens.length ===
            0
        ) {

            return false;

        }


        return valueTokens.every(
            token =>
                titleTokens.has(
                    token
                )
        );

    }


    /*
    =====================================================
    RELEVANCE
    =====================================================
    */

    calculateRelevance(
        title,
        query
    ) {

        const queryTokens =
            this.getQueryTokens(
                query
            );


        if (
            !title ||
            queryTokens.length ===
            0
        ) {

            return 0;

        }


        const titleTokens =
            new Set(
                String(
                    title
                )
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9]+/g,
                        " "
                    )
                    .split(
                        /\s+/
                    )
                    .filter(Boolean)
            );


        let matched =
            0;


        for (
            const token
            of queryTokens
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
    IDENTITY SCORE
    =====================================================

    PRE-SCREEN only.

    Final exact variant verification stays with the
    global StockSense candidate/verification layer.
    =====================================================
    */

    calculateIdentityScore(
        product,
        originalProduct
    ) {

        if (
            !product ||
            !product.title ||
            !originalProduct
        ) {

            return 0;

        }


        const title =
            product.title
                .toLowerCase();


        let score =
            0;


        /*
        -------------------------------------------------
        BRAND
        -------------------------------------------------
        */

        let brandMatch =
            false;


        if (
            originalProduct.brand
        ) {

            brandMatch =
                this.containsWholePhrase(
                    title,
                    originalProduct.brand
                );


            if (
                brandMatch
            ) {

                score +=
                    50;

            }

        }


        /*
        -------------------------------------------------
        CORE PRODUCT NAME
        -------------------------------------------------
        */

        const productTokens =
            this.getQueryTokens(
                originalProduct.productName
            );


        const titleTokens =
            new Set(
                title
                    .replace(
                        /[^a-z0-9]+/g,
                        " "
                    )
                    .split(
                        /\s+/
                    )
                    .filter(Boolean)
            );


        let matchedProductTokens =
            0;


        for (
            const token
            of productTokens
        ) {

            if (
                titleTokens.has(
                    token
                )
            ) {

                matchedProductTokens++;

            }

        }


        const fullCoreMatch =
            productTokens.length >
            0 &&
            matchedProductTokens ===
            productTokens.length;


        if (
            fullCoreMatch
        ) {

            score +=
                40;

        }
        else if (
            matchedProductTokens >
            0
        ) {

            score +=
                5;

        }


        /*
        -------------------------------------------------
        MODEL
        -------------------------------------------------
        */

        if (
            originalProduct.model &&
            this.containsWholePhrase(
                title,
                originalProduct.model
            )
        ) {

            score +=
                10;

        }


        /*
        -------------------------------------------------
        VARIANT
        -------------------------------------------------
        */

        if (
            originalProduct.variant &&
            this.containsWholePhrase(
                title,
                originalProduct.variant
            )
        ) {

            score +=
                5;

        }


        /*
        -------------------------------------------------
        FLAVOUR
        -------------------------------------------------
        */

        if (
            originalProduct.flavour &&
            this.containsWholePhrase(
                title,
                originalProduct.flavour
            )
        ) {

            score +=
                3;

        }


        /*
        -------------------------------------------------
        WEIGHT
        -------------------------------------------------
        */

        if (
            originalProduct.weight &&
            this.containsWholePhrase(
                title,
                originalProduct.weight
            )
        ) {

            score +=
                2;

        }


        /*
        -------------------------------------------------
        STRONG IDENTITY
        -------------------------------------------------
        */

        if (
            brandMatch &&
            (
                fullCoreMatch ||
                productTokens.length ===
                0
            )
        ) {

            return 90;

        }


        /*
        Unbranded exact core match.
        */

        if (
            !originalProduct.brand &&
            fullCoreMatch
        ) {

            return 50;

        }


        return Math.min(
            score,
            15
        );

    }


    /*
    =====================================================
    CACHE KEY
    =====================================================
    */

    getCacheKey(
        query,
        originalProduct
    ) {

        const product =
            originalProduct ||
            {};


        const identity = [

            product.brand ||
            "",

            product.productName ||
            "",

            product.model ||
            "",

            product.variant ||
            "",

            product.weight ||
            "",

            product.flavour ||
            "",

            product.color ||
            ""

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
        Generic search.
        */

        if (
            identity.replace(
                /\|/g,
                ""
            ).length ===
            0
        ) {

            return (
                "query|" +
                this.normalizeSearchQuery(
                    query
                )
                    .toLowerCase()
            );

        }


        /*
        Specific product.

        Equivalent generated queries therefore share
        one completed Meesho search session.
        */

        return (
            "product|" +
            identity
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
    CACHE SET
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
        Prevent unlimited cache growth.
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
                firstKey ===
                undefined
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
    BUILD QUERY LADDER
    =====================================================
    */

    buildSearchQueries(
        originalQuery,
        originalProduct
    ) {

        const product =
            originalProduct ||
            {};


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
        Q1 - MOST SPECIFIC
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
        Q2 - CORE + FLAVOUR
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
        Q3 - BRAND + CORE
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
        GENERIC FALLBACK
        */

        if (
            queries.length ===
            0 &&
            originalQuery
        ) {

            queries.push(
                this.normalizeSearchQuery(
                    originalQuery
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
    PRODUCT OBJECT DISCOVERY
    =====================================================
    */

    collectProductObjects(
        value,
        output = [],
        visited = new Set()
    ) {

        if (
            value === null ||
            value === undefined
        ) {

            return output;

        }


        if (
            typeof value !==
            "object"
        ) {

            return output;

        }


        if (
            visited.has(
                value
            )
        ) {

            return output;

        }


        visited.add(
            value
        );


        if (
            Array.isArray(
                value
            )
        ) {

            for (
                const item
                of value
            ) {

                this.collectProductObjects(
                    item,
                    output,
                    visited
                );

            }


            return output;

        }


        const hasProductId =
            value.product_id !==
            undefined ||
            value.productId !==
            undefined ||
            value.catalogId !==
            undefined ||
            value.catalog_id !==
            undefined;


        const hasProductName =
            value.hero_product_name !==
            undefined ||
            value.product_name !==
            undefined ||
            value.productName !==
            undefined ||
            value.name !==
            undefined ||
            value.description !==
            undefined;


        const hasProductPrice =
            value.min_product_price !==
            undefined ||
            value.min_catalog_price !==
            undefined ||
            value.original_price !==
            undefined ||
            value.price !==
            undefined;


        if (
            hasProductId &&
            hasProductName &&
            hasProductPrice
        ) {

            output.push(
                value
            );

        }


        for (
            const child
            of Object.values(
                value
            )
        ) {

            if (
                child &&
                typeof child ===
                "object"
            ) {

                this.collectProductObjects(
                    child,
                    output,
                    visited
                );

            }

        }


        return output;

    }


    /*
    =====================================================
    PRODUCT URL
    =====================================================
    */

    buildProductUrl(
        item
    ) {

        if (
            !item ||
            typeof item !==
            "object"
        ) {

            return null;

        }


        const productId =
            item.product_id ||
            item.productId;


        const slug =
            item.slug ||
            item.original_slug;


        if (
            productId ===
            null ||
            productId ===
            undefined
        ) {

            return null;

        }


        if (
            slug
        ) {

            return (
                "https://www.meesho.com/" +
                encodeURI(
                    String(
                        slug
                    ).trim()
                ) +
                "/p/" +
                encodeURIComponent(
                    String(
                        productId
                    ).trim()
                )
            );

        }


        /*
        Numeric fallback.
        */

        if (
            /^\d+$/.test(
                String(
                    productId
                )
            )
        ) {

            return (
                "https://www.meesho.com/p/" +
                encodeURIComponent(
                    String(
                        productId
                    )
                )
            );

        }


        return null;

    }


    /*
    =====================================================
    NORMALIZE PRODUCT
    =====================================================
    */

    normalizeProduct(
        item
    ) {

        if (
            !item ||
            typeof item !==
            "object"
        ) {

            return null;

        }


        const title =
            this.cleanText(
                item.hero_product_name ||
                item.product_name ||
                item.productName ||
                item.name ||
                item.description
            );


        if (
            !title
        ) {

            return null;

        }


        const price =
            this.parsePrice(
                item.min_product_price ??
                item.min_catalog_price ??
                item.price ??
                item.selling_price ??
                item.sellingPrice
            );


        if (
            !Number.isFinite(
                price
            )
        ) {

            return null;

        }


        const url =
            this.buildProductUrl(
                item
            );


        if (
            !url
        ) {

            return null;

        }


        let image =
            item.image ||
            item.collage_image ||
            null;


        if (
            !image &&
            Array.isArray(
                item.images
            ) &&
            item.images.length >
            0
        ) {

            image =
                item.images[0];

        }


        if (
            !image &&
            Array.isArray(
                item.product_images
            ) &&
            item.product_images.length >
            0
        ) {

            const first =
                item.product_images[0];


            image =
                first &&
                    typeof first ===
                    "object"
                    ? (
                        first.url ||
                        null
                    )
                    : first;

        }


        image =
            this.normalizeImageUrl(
                image
            );


        let availability =
            true;


        if (
            typeof item.valid ===
            "boolean"
        ) {

            availability =
                item.valid;

        }


        if (
            item.pre_booking ===
            true
        ) {

            availability =
                false;

        }


        const reviewSummary =
            item.catalog_reviews_summary ||
            {};


        const rating =
            Number(
                reviewSummary.average_rating ||
                0
            );


        const reviews =
            Number(
                reviewSummary.review_count ||
                reviewSummary.rating_count ||
                0
            );


        return {

            platform:
                "Meesho",

            title,

            price,

            image,

            url,

            availability,

            productId:
                item.product_id ||
                item.productId ||
                null,

            catalogId:
                item.catalogId ||
                item.catalog_id ||
                null,

            brand:
                item.brand_name ||
                item.brand ||
                item.brandname ||
                null,

            mrp:
                this.parsePrice(
                    item.original_price
                ),

            rating,

            reviews

        };

    }


    /*
    =====================================================
    DEDUPLICATION
    =====================================================
    */

    deduplicate(
        products
    ) {

        const seen =
            new Set();


        const result = [];


        for (
            const product
            of products
        ) {

            if (
                !product ||
                !product.url
            ) {

                continue;

            }


            const key =
                product.url
                    .toLowerCase()
                    .trim();


            if (
                seen.has(
                    key
                )
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


    /* =====================================================
   MEESHO SEARCH API
===================================================== */

    async searchApi(
        page,
        query,
        options = {}
    ) {

        const normalizedQuery =
            this.normalizeSearchQuery(
                query
            );

        const deadline =
            Number.isFinite(
                options?.deadline
            )
                ? options.deadline
                : null;

        const abortSignal =
            options?.signal || null;


        /*
        =====================================================
        PRODUCT RESPONSE VALIDATION
        =====================================================
    
        Meesho fires many POST requests while loading
        the search page.
    
        We must NOT assume that every /api/ request
        containing "product" is the actual product-search
        response.
    
        feedFilterConfig is one such example.
    
        We therefore inspect the response JSON and only
        accept it when it actually contains product-shaped
        objects.
        =====================================================
        */

        const looksLikeProductObject =
            value => {

                if (
                    !value ||
                    typeof value !== "object" ||
                    Array.isArray(value)
                ) {
                    return false;
                }

                const hasProductId =
                    value.product_id !== undefined ||
                    value.productId !== undefined ||
                    value.catalogId !== undefined ||
                    value.catalog_id !== undefined;

                const hasProductName =
                    value.hero_product_name !== undefined ||
                    value.product_name !== undefined ||
                    value.productName !== undefined ||
                    value.name !== undefined ||
                    value.description !== undefined;

                const hasProductPrice =
                    value.min_product_price !== undefined ||
                    value.min_catalog_price !== undefined ||
                    value.original_price !== undefined ||
                    value.price !== undefined ||
                    value.selling_price !== undefined ||
                    value.sellingPrice !== undefined;

                return (
                    hasProductId &&
                    hasProductName &&
                    hasProductPrice
                );

            };


        /*
        =====================================================
        RECURSIVE PRODUCT DETECTION
        =====================================================
        */

        const containsProductObject =
            (
                value,
                visited = new Set()
            ) => {

                if (
                    value === null ||
                    value === undefined
                ) {
                    return false;
                }

                if (
                    typeof value !== "object"
                ) {
                    return false;
                }

                if (
                    visited.has(value)
                ) {
                    return false;
                }

                visited.add(value);


                if (
                    looksLikeProductObject(
                        value
                    )
                ) {
                    return true;
                }


                if (
                    Array.isArray(value)
                ) {

                    for (
                        const item
                        of value
                    ) {

                        if (
                            containsProductObject(
                                item,
                                visited
                            )
                        ) {
                            return true;
                        }

                    }

                    return false;

                }


                for (
                    const child
                    of Object.values(value)
                ) {

                    if (
                        child &&
                        typeof child === "object" &&
                        containsProductObject(
                            child,
                            visited
                        )
                    ) {

                        return true;

                    }

                }

                return false;

            };


        let capturedResponse =
            null;

        let responseCaptured =
            false;

        let resolveResponse;


        const responsePromise =
            new Promise(
                resolve => {

                    resolveResponse =
                        resolve;

                }
            );


        /*
        =====================================================
        RESPONSE HANDLER
        =====================================================
        */

        const responseHandler =
            async response => {

                try {

                    /*
                    ---------------------------------------------
                    ABORT CHECK
                    ---------------------------------------------
                    */

                    if (
                        abortSignal &&
                        abortSignal.aborted
                    ) {

                        return;

                    }


                    const url =
                        response.url();

                    const method =
                        response.request().method();

                    const status =
                        response.status();


                    const lowerUrl =
                        url.toLowerCase();


                    /*
                    ---------------------------------------------
                    ONLY POST API RESPONSES
                    ---------------------------------------------
                    */

                    if (
                        method !== "POST" ||
                        !lowerUrl.includes("/api/")
                    ) {

                        return;

                    }


                    /*
                    ---------------------------------------------
                    IGNORE KNOWN NON-PRODUCT ENDPOINTS
                    ---------------------------------------------
                    */

                    const ignoredEndpoint =
                        lowerUrl.includes(
                            "feedfilterconfig"
                        ) ||
                        lowerUrl.includes(
                            "filterconfig"
                        ) ||
                        lowerUrl.includes(
                            "recommendation"
                        ) ||
                        lowerUrl.includes(
                            "recommendations"
                        ) ||
                        lowerUrl.includes(
                            "autocomplete"
                        ) ||
                        lowerUrl.includes(
                            "suggestion"
                        ) ||
                        lowerUrl.includes(
                            "suggestions"
                        );


                    if (
                        ignoredEndpoint
                    ) {

                        return;

                    }


                    /*
                    ---------------------------------------------
                    CANDIDATE LOG
                    ---------------------------------------------
                    */

                    const looksLikeSearchEndpoint =
                        lowerUrl.includes("product") ||
                        lowerUrl.includes("search") ||
                        lowerUrl.includes("catalog") ||
                        lowerUrl.includes("feed");


                    if (
                        !looksLikeSearchEndpoint
                    ) {

                        return;

                    }


                    console.log(
                        `🔎 Meesho API candidate: ` +
                        `${status} ${url}`
                    );


                    /*
                    ---------------------------------------------
                    STATUS
                    ---------------------------------------------
                    */

                    if (
                        status < 200 ||
                        status >= 300
                    ) {

                        return;

                    }


                    /*
                    ---------------------------------------------
                    READ JSON
                    ---------------------------------------------
                    */

                    let data;

                    try {

                        data =
                            await response.json();

                    }
                    catch (error) {

                        console.log(
                            `⚠️ Meesho API JSON parse failed: ` +
                            `${error.message}`
                        );

                        return;

                    }


                    if (
                        !data
                    ) {

                        return;

                    }


                    /*
                    ---------------------------------------------
                    ACTUAL PRODUCT VALIDATION
                    ---------------------------------------------
                    */

                    const hasProducts =
                        containsProductObject(
                            data
                        );


                    if (
                        !hasProducts
                    ) {

                        console.log(
                            `↪️ Meesho API ignored ` +
                            `(no product objects): ${url}`
                        );

                        return;

                    }


                    /*
                    ---------------------------------------------
                    CAPTURE FIRST REAL PRODUCT RESPONSE
                    ---------------------------------------------
                    */

                    if (
                        !responseCaptured
                    ) {

                        responseCaptured =
                            true;

                        capturedResponse =
                            data;


                        console.log(
                            `✅ Meesho PRODUCT API captured for ` +
                            `"${normalizedQuery}"`
                        );


                        resolveResponse(
                            capturedResponse
                        );

                    }

                }
                catch (error) {

                    console.log(
                        `⚠️ Meesho response handler error: ` +
                        `${error.message}`
                    );

                }

            };


        /*
        =====================================================
        ATTACH LISTENER BEFORE NAVIGATION
        =====================================================
        */

        page.on(
            "response",
            responseHandler
        );


        try {

            /*
            =============================================
            ABORT BEFORE NAVIGATION
            =============================================
            */

            if (
                abortSignal &&
                abortSignal.aborted
            ) {

                return null;

            }


            /*
            =============================================
            SEARCH URL
            =============================================
            */

            const searchUrl =
                "https://www.meesho.com/search?q=" +
                encodeURIComponent(
                    normalizedQuery
                );


            const navigationStarted =
                Date.now();


            /*
            =============================================
            NAVIGATION
            =============================================
            */

            const navigationPromise =
                page.goto(
                    searchUrl,
                    {
                        waitUntil:
                            "domcontentloaded",

                        timeout:
                            30000
                    }
                )
                    .catch(
                        error => {

                            console.log(
                                `⚠️ Meesho navigation warning ` +
                                `"${normalizedQuery}": ` +
                                `${error.message}`
                            );

                            return null;

                        }
                    );


            /*
            =============================================
            WAIT STRATEGY
            =============================================
    
            Product API response wins immediately.
    
            Otherwise navigation completes and we give
            Meesho a bounded amount of time to fire the
            actual product API.
    
            We do NOT close the page from a timer here.
            searchSingleQuery() owns page cleanup.
            =============================================
            */

            const navigationResult =
                await navigationPromise;


            /*
            =============================================
            ABORT CHECK
            =============================================
            */

            if (
                abortSignal &&
                abortSignal.aborted
            ) {

                return null;

            }


            /*
            =============================================
            CALCULATE REMAINING TIME
            =============================================
            */

            let remaining =
                this.apiWaitTimeout;


            if (
                Number.isFinite(
                    deadline
                )
            ) {

                remaining =
                    Math.max(
                        1,
                        deadline -
                        Date.now()
                    );

            }


            /*
            =============================================
            IF NAVIGATION FAILED AND NO RESPONSE
            =============================================
            */

            if (
                navigationResult === null &&
                !capturedResponse
            ) {

                /*
                Give an already-running response handler
                a very small grace period.
                */

                remaining =
                    Math.min(
                        remaining,
                        500
                    );

            }


            /*
            =============================================
            BOUNDED API WAIT
            =============================================
            */

            if (
                !capturedResponse &&
                remaining > 0
            ) {

                const timeoutPromise =
                    new Promise(
                        resolve => {

                            setTimeout(
                                () => {

                                    resolve(
                                        null
                                    );

                                },
                                remaining
                            );

                        }
                    );


                const result =
                    await Promise.race(
                        [
                            responsePromise,
                            timeoutPromise
                        ]
                    );


                if (
                    result
                ) {

                    capturedResponse =
                        result;

                }

            }


            /*
            =============================================
            FINAL ABORT CHECK
            =============================================
            */

            if (
                abortSignal &&
                abortSignal.aborted
            ) {

                return null;

            }


            console.log(
                `⏱ Meesho API/navigation ` +
                `"${normalizedQuery}": ` +
                `${Date.now() - navigationStarted} ms`
            );


            /*
            =============================================
            RESULT
            =============================================
            */

            return (
                capturedResponse ||
                null
            );

        }
        finally {

            /*
            IMPORTANT:
            Remove only our listener.
    
            Page lifecycle is handled by
            searchSingleQuery().
            */

            try {

                page.off(
                    "response",
                    responseHandler
                );

            }
            catch (_) { }

        }

    }


    /* =====================================================
    SEARCH ONE QUERY
 ===================================================== */

    async searchSingleQuery(
        query,
        originalProduct,
        options = {}
    ) {

        const normalizedQuery =
            this.normalizeSearchQuery(
                query
            );


        const started =
            Date.now();


        /*
        =====================================================
        OPTIONS
        =====================================================
        */

        const abortSignal =
            options &&
                options.signal
                ? options.signal
                : null;


        const deadline =
            options &&
                Number.isFinite(
                    options.deadline
                )
                ? options.deadline
                : null;


        /*
        =====================================================
        EARLY ABORT
        =====================================================
        */

        if (
            abortSignal &&
            abortSignal.aborted
        ) {

            console.log(
                `⏹ Meesho: Query aborted before start ` +
                `"${normalizedQuery}"`
            );

            return [];

        }


        /*
        =====================================================
        GET PAGE
        =====================================================
        */

        let page = null;


        try {

            page =
                await getPage();


            /*
            =============================================
            SECOND ABORT CHECK
            =============================================
            */

            if (
                abortSignal &&
                abortSignal.aborted
            ) {

                return [];

            }


            console.log(
                `Meesho: Query "${normalizedQuery}"`
            );


            /*
            =============================================
            SEARCH API
            =============================================
            */

            const data =
                await this.searchApi(
                    page,
                    normalizedQuery,
                    {
                        deadline,
                        signal:
                            abortSignal
                    }
                );


            /*
            =============================================
            ABORT CHECK
            =============================================
            */

            if (
                abortSignal &&
                abortSignal.aborted
            ) {

                console.log(
                    `⏹️ Meesho: Query aborted ` +
                    `"${normalizedQuery}"`
                );

                return [];

            }


            /*
            =============================================
            NO DATA
            =============================================
            */

            if (
                !data
            ) {

                console.log(
                    `Meesho: No PRODUCT API response for ` +
                    `"${normalizedQuery}"`
                );

                return [];

            }


            /*
            =============================================
            COLLECT PRODUCT OBJECTS
            =============================================
            */

            const objects =
                this.collectProductObjects(
                    data
                );


            console.log(
                `Meesho: ${normalizedQuery} → ` +
                `${objects.length} API products`
            );


            /*
            =============================================
            NO PRODUCT OBJECTS
            =============================================
            */

            if (
                objects.length === 0
            ) {

                console.log(
                    `Meesho: ${normalizedQuery} → ` +
                    `0 valid product objects`
                );

                return [];

            }


            /*
            =============================================
            NORMALIZE
            =============================================
            */

            const normalized =
                objects
                    .map(
                        item =>
                            this.normalizeProduct(
                                item
                            )
                    )
                    .filter(
                        Boolean
                    );


            console.log(
                `Meesho: ${normalizedQuery} → ` +
                `${normalized.length} normalized`
            );


            /*
            =============================================
            ABORT CHECK
            =============================================
            */

            if (
                abortSignal &&
                abortSignal.aborted
            ) {

                return [];

            }


            /*
            =============================================
            NO NORMALIZED PRODUCTS
            =============================================
            */

            if (
                normalized.length === 0
            ) {

                return [];

            }


            /*
            =============================================
            SCORE PRODUCTS
            =============================================
            */

            const scored =
                normalized.map(
                    product => ({

                        ...product,

                        relevance:
                            this.calculateRelevance(
                                product.title,
                                normalizedQuery
                            ),

                        identityScore:
                            this.calculateIdentityScore(
                                product,
                                originalProduct
                            )

                    })
                );


            /*
            =============================================
            FINAL ABORT CHECK
            =============================================
            */

            if (
                abortSignal &&
                abortSignal.aborted
            ) {

                return [];

            }


            console.log(
                `⏱ Meesho query ` +
                `"${normalizedQuery}": ` +
                `${Date.now() - started} ms`
            );


            /*
            =============================================
            DEDUPLICATE
            =============================================
            */

            return this.deduplicate(
                scored
            );

        }
        catch (err) {

            /*
            =============================================
            ABORT ERRORS
            =============================================
            */

            if (
                abortSignal &&
                abortSignal.aborted
            ) {

                console.log(
                    `⏹️ Meesho: Query aborted ` +
                    `"${normalizedQuery}"`
                );

                return [];

            }


            /*
            =============================================
            NORMAL ERROR
            =============================================
            */

            console.error(
                `Meesho query failed ` +
                `"${normalizedQuery}":`,
                err.message
            );


            return [];

        }
        finally {

            /*
            =================================================
            PAGE CLEANUP
            =================================================
    
            IMPORTANT:
            There is NO deadline timer here.
    
            We intentionally do not call page.close()
            from a timeout while page.goto() or the API
            listener may still be using the page.
    
            getPage()/closePage() owns the browser-pool
            lifecycle.
            =================================================
            */

            if (
                page
            ) {

                try {

                    await closePage(
                        page
                    );

                }
                catch (closeError) {

                    console.log(
                        `⚠️ Meesho page cleanup warning:`,
                        closeError.message
                    );

                }

            }

        }

    }

    /*
    =====================================================
    SORT
    =====================================================
    */

    sortProducts(
        products
    ) {

        return [
            ...products
        ]
            .sort(
                (
                    a,
                    b
                ) => {

                    if (
                        b.identityScore !==
                        a.identityScore
                    ) {

                        return (
                            b.identityScore -
                            a.identityScore
                        );

                    }


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
                        a.price -
                        b.price
                    );

                }
            );

    }


    /*
    =====================================================
    FAST SEARCH
    =====================================================

    Used by SearchManager when a strict real-time deadline
    is active.

    The fast path starts the most useful Meesho queries in
    parallel and returns the first product-bearing result.

    It does NOT wait for every query to complete.

    =====================================================
    */

    async searchFast(
        query,
        originalProduct = {},
        options = {}
    ) {

        const started =
            Date.now();

        const requestedDeadline =
            Number.isFinite(
                options.deadline
            )
                ? options.deadline
                : started +
                (
                    Number(options.timeout) ||
                    3500
                );

        const deadline =
            Math.min(
                requestedDeadline,
                started +
                (
                    Number(options.timeout) ||
                    3500
                )
            );

        const cacheKey =
            this.getCacheKey(
                query,
                originalProduct
            );

        const cached =
            this.getCached(
                cacheKey
            );

        if (
            cached !== null
        ) {
            console.log(
                `Meesho: FAST cache hit → ${cached.length} products`
            );

            return cached;
        }

        const queries =
            this.buildSearchQueries(
                query,
                originalProduct
            );

        if (
            !queries.length
        ) {
            return [];
        }

        const fastQueries =
            queries.slice(
                0,
                3
            );

        const controllers =
            fastQueries.map(
                () =>
                    new AbortController()
            );

        return new Promise(
            resolve => {

                let settled =
                    false;

                let completed =
                    0;

                const deadlineTimer =
                    setTimeout(
                        () => {

                            if (
                                settled
                            ) {
                                return;
                            }

                            settled =
                                true;

                            controllers.forEach(
                                controller => {

                                    try {
                                        controller.abort();
                                    }
                                    catch (_) { }

                                }
                            );

                            resolve([]);

                        },
                        Math.max(
                            1,
                            deadline -
                            Date.now()
                        )
                    );


                const finish =
                    (
                        products,
                        winnerIndex = -1
                    ) => {

                        if (
                            settled
                        ) {
                            return;
                        }

                        if (
                            !Array.isArray(
                                products
                            ) ||
                            products.length === 0
                        ) {

                            completed++;

                            if (
                                completed ===
                                fastQueries.length
                            ) {

                                settled =
                                    true;

                                clearTimeout(
                                    deadlineTimer
                                );

                                resolve([]);

                            }

                            return;
                        }


                        settled =
                            true;

                        clearTimeout(
                            deadlineTimer
                        );


                        controllers.forEach(
                            (
                                controller,
                                index
                            ) => {

                                if (
                                    index !==
                                    winnerIndex
                                ) {

                                    try {
                                        controller.abort();
                                    }
                                    catch (_) { }

                                }

                            }
                        );


                        const finalProducts =
                            this
                                .sortProducts(
                                    products
                                )
                                .slice(
                                    0,
                                    this.maxResults
                                );


                        this.setCached(
                            cacheKey,
                            finalProducts
                        );


                        console.log(
                            `⚡ Meesho FAST: returning ${finalProducts.length} products in ${Date.now() - started} ms`
                        );


                        resolve(
                            finalProducts
                        );

                    };


                fastQueries.forEach(
                    (
                        searchQuery,
                        index
                    ) => {

                        this.searchSingleQuery(
                            searchQuery,
                            originalProduct,
                            {
                                deadline,
                                timeout:
                                    Math.max(
                                        300,
                                        deadline -
                                        Date.now()
                                    ),
                                signal:
                                    controllers[
                                        index
                                    ].signal
                            }
                        )
                            .then(
                                products =>
                                    finish(
                                        products,
                                        index
                                    )
                            )
                            .catch(
                                () =>
                                    finish(
                                        [],
                                        index
                                    )
                            );

                    }
                );

            }
        );
    }


    /*
    =====================================================
    MAIN SEARCH
    =====================================================

    This remains the deeper/full Meesho search path.

    =====================================================
    */

    async search(
        query,
        originalProduct
    ) {

        const started =
            Date.now();


        console.log(
            `Meesho: Searching "${query}"`
        );


        /*
        =============================================
        CACHE
        =============================================
        */

        const cacheKey =
            this.getCacheKey(
                query,
                originalProduct
            );


        const cached =
            this.getCached(
                cacheKey
            );


        if (
            cached !== null
        ) {

            console.log(
                "Meesho: Using cached search session."
            );


            console.log(
                `Meesho: Returning ${cached.length} cached products`
            );


            return cached;

        }


        /*
        =============================================
        SEARCH TYPE
        =============================================
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
            "Meesho: Candidate search queries:",
            queries
        );


        let allProducts =
            [];


        /*
        =================================================
        SPECIFIC PRODUCT SEARCH
        =================================================

        Existing deep search behavior is preserved.

        Q1 + Q2 + Q3 still run in parallel here.
        =================================================
        */

        if (
            specificSearch
        ) {

            const searchQueries =
                queries.slice(
                    0,
                    3
                );


            const uniqueQueries =
                [
                    ...new Set(
                        searchQueries
                            .filter(Boolean)
                    )
                ];


            if (
                uniqueQueries.length >
                0
            ) {

                console.log(
                    "⚡ Meesho: Running all specific-product queries in parallel:",
                    uniqueQueries
                );


                const parallelQueries =
                    uniqueQueries.slice(
                        0,
                        3
                    );


                console.log(
                    "⚡ Meesho: Running all specific-product queries in parallel:",
                    parallelQueries
                );


                const parallelStarted =
                    Date.now();


                const queryResults =
                    await Promise.all(
                        parallelQueries.map(
                            searchQuery =>
                                this.searchSingleQuery(
                                    searchQuery,
                                    originalProduct
                                )
                        )
                    );


                console.log(
                    `⏱ Meesho parallel search: ${Date.now() -
                    parallelStarted
                    } ms`
                );


                /*
                COLLECT ALL RESULTS
                */

                for (
                    const results
                    of queryResults
                ) {

                    if (
                        Array.isArray(
                            results
                        )
                    ) {

                        allProducts.push(
                            ...results
                        );

                    }

                }


                /*
                FINAL DEDUPLICATION
                */

                allProducts =
                    this.deduplicate(
                        allProducts
                    );

            }

        }
        else if (
            queries.length >
            0
        ) {

            /*
            =================================================
            GENERIC SEARCH
            =================================================

            Preserve existing behavior.
            =================================================
            */

            const firstResults =
                await this.searchSingleQuery(
                    queries[0],
                    originalProduct
                );


            allProducts =
                this.deduplicate(
                    firstResults
                );


            if (
                queries.length >
                1
            ) {

                const fallbackQueries =
                    queries.slice(
                        1,
                        3
                    );


                console.log(
                    "⚡ Meesho: Running generic fallback queries in parallel:",
                    fallbackQueries
                );


                const fallbackResults =
                    await Promise.all(
                        fallbackQueries.map(
                            searchQuery =>
                                this.searchSingleQuery(
                                    searchQuery,
                                    originalProduct
                                )
                        )
                    );


                for (
                    const results
                    of fallbackResults
                ) {

                    if (
                        Array.isArray(
                            results
                        )
                    ) {

                        allProducts.push(
                            ...results
                        );

                    }

                }


                allProducts =
                    this.deduplicate(
                        allProducts
                    );

            }

        }


        /*
        =================================================
        FINAL RESULT FILTER
        =================================================
        */

        let results;


        if (
            specificSearch
        ) {

            /*
            A specific product must have:

                meaningful identity
                AND
                some relevance
            */

            results =
                this.sortProducts(
                    allProducts.filter(
                        product =>
                            product.identityScore >=
                            40 &&
                            product.relevance >
                            0
                    )
                )
                    .slice(
                        0,
                        this.maxResults
                    );

        }
        else {

            results =
                this.sortProducts(
                    allProducts.filter(
                        product =>
                            product.relevance >
                            0
                    )
                )
                    .slice(
                        0,
                        this.maxResults
                    );

        }


        /*
        =================================================
        REMOVE INTERNAL SCORE
        =================================================
        */

        const finalProducts =
            results.map(
                product => {

                    const {
                        identityScore,
                        ...cleanProduct
                    } = product;


                    return cleanProduct;

                }
            );


        /*
        =================================================
        CACHE
        =================================================
        */

        this.setCached(
            cacheKey,
            finalProducts
        );


        /*
        =================================================
        FINAL LOG
        =================================================
        */

        console.log(
            `Meesho: Final candidate products: ${finalProducts.length}`
        );


        for (
            const product
            of finalProducts
        ) {

            console.log(
                `Meesho: ${product.title} → ₹${product.price}`
            );

        }


        console.log(
            `Meesho: Returning ${finalProducts.length} products`
        );


        console.log(
            `⏱ Meesho: ${Date.now() -
            started
            } ms`
        );


        return finalProducts;

    }

}


module.exports =
    new MeeshoAdapter();