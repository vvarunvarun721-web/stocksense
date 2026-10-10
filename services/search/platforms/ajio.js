const BaseAdapter =
    require("./baseAdapter");

const axios =
    require("axios");


class AjioAdapter extends BaseAdapter {

    constructor() {

        super("Ajio");


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
        =====================================================
        RESULT LIMIT
        =====================================================
        */

        this.maxResults =
            20;


        /*
        =====================================================
        AJIO SEARCH API
        =====================================================

        This is the catalog/search endpoint currently used
        by third-party AJIO catalog integrations.

        It is NOT an official public developer API.
        =====================================================
        */

        this.apiUrl =
            "https://www.ajio.com/api/search";


        this.pageSize =
            45;


        this.requestTimeout =
            8000;


        /*
        =====================================================
        HTML FALLBACK
        =====================================================
        */

        this.htmlTimeout =
            8000;


        /*
        =====================================================
        USER AGENT
        =====================================================
        */

        this.userAgent =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/139.0.0.0 Safari/537.36";

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
            )
                .trim();


        /*
        800g -> 800 g
        */

        value =
            value.replace(
                /(\d)([A-Za-z])/g,
                "$1 $2"
            );


        /*
        Drink800 -> Drink 800
        */

        value =
            value.replace(
                /([A-Za-z])(\d)/g,
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
    NUMBER PARSER
    =====================================================
    */

    parseNumber(
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


        const text =
            String(
                value
            )
                .replace(
                    /,/g,
                    ""
                );


        const match =
            text.match(
                /-?\d+(?:\.\d+)?/
            );


        if (
            !match
        ) {

            return null;

        }


        const number =
            Number(
                match[0]
            );


        return Number.isFinite(
            number
        )
            ? number
            : null;

    }


    /*
    =====================================================
    EXTRACT VALUE FROM PRICE OBJECT
    =====================================================
    */

    parsePriceValue(
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
            "object"
        ) {

            /*
            Prefer numeric value.
            */

            const direct =
                this.parseNumber(
                    value.value
                );


            if (
                direct !== null
            ) {

                return direct;

            }


            const display =
                this.parseNumber(
                    value.displayformattedValue
                );


            if (
                display !== null
            ) {

                return display;

            }


            const formatted =
                this.parseNumber(
                    value.displayFormattedValue
                );


            if (
                formatted !== null
            ) {

                return formatted;

            }

        }


        return this.parseNumber(
            value
        );

    }


    /*
    =====================================================
    NORMALIZE IMAGE
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


        const clean =
            value.trim();


        if (
            clean.startsWith("//")
        ) {

            return (
                "https:" +
                clean
            );

        }


        return clean;

    }


    /*
    =====================================================
    NORMALIZE PRODUCT URL
    =====================================================
    */

    normalizeProductUrl(
        value
    ) {

        if (
            !value
        ) {

            return null;

        }


        try {

            const parsed =
                new URL(
                    value,
                    "https://www.ajio.com"
                );


            if (
                !parsed.pathname.includes(
                    "/p/"
                )
            ) {

                return null;

            }


            /*
            Strip tracking/query parameters.

            Keep canonical product pathname.
            */

            return (
                "https://www.ajio.com" +
                parsed.pathname
            );

        }
        catch (_) {

            return null;

        }

    }


    /*
    =====================================================
    PRODUCT ID
    =====================================================
    */

    extractProductId(
        product
    ) {

        if (
            !product
        ) {

            return null;

        }


        const direct =
            product.code ||
            product.product_id ||
            product.productId ||
            product.sku ||
            null;


        if (
            direct
        ) {

            return String(
                direct
            );

        }


        const url =
            this.normalizeProductUrl(
                product.url
            );


        if (
            !url
        ) {

            return null;

        }


        const match =
            url.match(
                /\/p\/([^/?#]+)/i
            );


        return match
            ? match[1]
            : null;

    }


    /*
    =====================================================
    GET BRAND
    =====================================================
    */

    extractBrand(
        product
    ) {

        if (
            !product
        ) {

            return null;

        }


        if (
            product.brand
        ) {

            return this.cleanText(
                product.brand
            );

        }


        if (
            product.brandTypeName
        ) {

            return this.cleanText(
                product.brandTypeName
            );

        }


        if (
            product.fnlColorVariantData &&
            product.fnlColorVariantData.brandName
        ) {

            return this.cleanText(
                product
                    .fnlColorVariantData
                    .brandName
            );

        }


        return null;

    }


    /*
    =====================================================
    GET TITLE
    =====================================================
    */

    extractTitle(
        product
    ) {

        if (
            !product
        ) {

            return null;

        }


        return this.cleanText(

            product.name ||

            product.product_name ||

            product.productName ||

            product.title ||

            null

        ) || null;

    }


    /*
    =====================================================
    GET IMAGE
    =====================================================
    */

    extractImage(
        product
    ) {

        if (
            !product
        ) {

            return null;

        }


        const directCandidates = [

            product.image_url,

            product.imageUrl,

            product.image,

            product.primary_image,

            product.primaryImage

        ];


        for (
            const value
            of directCandidates
        ) {

            if (
                typeof value ===
                "string" &&
                value.trim()
            ) {

                return this.normalizeImageUrl(
                    value
                );

            }

        }


        /*
        Array-based images.
        */

        const imageArrays = [

            product.images,

            product.imageList,

            product.media

        ];


        for (
            const images
            of imageArrays
        ) {

            if (
                !Array.isArray(
                    images
                )
            ) {

                continue;

            }


            for (
                const image
                of images
            ) {

                if (
                    typeof image ===
                    "string"
                ) {

                    return this.normalizeImageUrl(
                        image
                    );

                }


                if (
                    image &&
                    typeof image ===
                    "object"
                ) {

                    const value =

                        image.url ||

                        image.imageUrl ||

                        image.src ||

                        image.image_url ||

                        null;


                    if (
                        value
                    ) {

                        return this.normalizeImageUrl(
                            value
                        );

                    }

                }

            }

        }


        return null;

    }


    /*
    =====================================================
    GET CURRENT PRICE
    =====================================================
    */

    extractCurrentPrice(
        product
    ) {

        if (
            !product
        ) {

            return null;

        }


        /*
        Offer price has priority.
        */

        const offerPrice =
            this.parsePriceValue(
                product.offerPrice
            );


        if (
            offerPrice !== null &&
            offerPrice > 0
        ) {

            return offerPrice;

        }


        /*
        Some responses expose sale/discount price
        directly.
        */

        const directCandidates = [

            product.sellingPrice,

            product.salePrice,

            product.discountPrice,

            product.currentPrice,

            product.buyPrice

        ];


        for (
            const candidate
            of directCandidates
        ) {

            const parsed =
                this.parsePriceValue(
                    candidate
                );


            if (
                parsed !== null &&
                parsed > 0
            ) {

                return parsed;

            }

        }


        /*
        Standard AJIO price object.
        */

        const price =
            this.parsePriceValue(
                product.price
            );


        if (
            price !== null &&
            price > 0
        ) {

            return price;

        }


        return null;

    }


    /*
    =====================================================
    GET MRP
    =====================================================
    */

    extractMrp(
        product
    ) {

        if (
            !product
        ) {

            return null;

        }


        const wasPrice =
            this.parsePriceValue(
                product.wasPriceData
            );


        if (
            wasPrice !== null &&
            wasPrice > 0
        ) {

            return wasPrice;

        }


        const directCandidates = [

            product.mrp,

            product.originalPrice,

            product.listPrice,

            product.list_price,

            product.original_price

        ];


        for (
            const candidate
            of directCandidates
        ) {

            const parsed =
                this.parsePriceValue(
                    candidate
                );


            if (
                parsed !== null &&
                parsed > 0
            ) {

                return parsed;

            }

        }


        return null;

    }


    /*
    =====================================================
    DISCOUNT %
    =====================================================
    */

    extractDiscountPercent(
        product,
        currentPrice,
        mrp
    ) {

        if (
            product &&
            product.discountPercent !==
            undefined &&
            product.discountPercent !==
            null
        ) {

            const number =
                this.parseNumber(
                    product.discountPercent
                );


            if (
                number !== null
            ) {

                return number;

            }

        }


        /*
        Compute when MRP and current price exist.
        */

        if (
            Number.isFinite(
                mrp
            ) &&
            mrp > 0 &&
            Number.isFinite(
                currentPrice
            ) &&
            currentPrice >= 0 &&
            currentPrice <= mrp
        ) {

            return Number(
                (
                    (
                        mrp -
                        currentPrice
                    ) /
                    mrp
                ) *
                100
                    .toFixed(2));

        }


        return null;

    }


    /*
    =====================================================
    RATING
    =====================================================
    */

    extractRating(
        product
    ) {

        if (
            !product
        ) {

            return null;

        }


        return this.parseNumber(

            product.averageRating ??

            product.rating ??

            product.avgRating ??

            null

        );

    }


    /*
    =====================================================
    REVIEW COUNT
    =====================================================
    */

    extractReviewCount(
        product
    ) {

        if (
            !product
        ) {

            return null;

        }


        return this.parseNumber(

            product.ratingCount ??

            product.reviewCount ??

            product.review_count ??

            null

        );

    }


    /*
    =====================================================
    AVAILABILITY
    =====================================================
    */

    extractAvailability(
        product
    ) {

        if (
            !product
        ) {

            return true;

        }


        /*
        Explicit boolean fields.
        */

        const booleanCandidates = [

            product.available,

            product.isAvailable,

            product.inStock,

            product.in_stock

        ];


        for (
            const value
            of booleanCandidates
        ) {

            if (
                typeof value ===
                "boolean"
            ) {

                return value;

            }

        }


        /*
        Explicit string states.
        */

        const status =
            String(

                product.stockStatus ??

                product.availability ??

                product.stock ??

                ""

            )
                .toLowerCase();


        if (
            status.includes(
                "out"
            ) &&
            status.includes(
                "stock"
            )
        ) {

            return false;

        }


        if (
            status.includes(
                "unavailable"
            )
        ) {

            return false;

        }


        return true;

    }


    /*
    =====================================================
    BUILD QUERY
    =====================================================
    */

    buildApiUrl(
        query,
        page = 0
    ) {

        const params =
            new URLSearchParams({

                currentPage:
                    String(
                        page
                    ),

                pageSize:
                    String(
                        this.pageSize
                    ),

                format:
                    "json",

                query:
                    this.normalizeSearchQuery(
                        query
                    )

            });


        return (
            this.apiUrl +
            "?" +
            params.toString()
        );

    }


    /*
    =====================================================
    FETCH API
    =====================================================
    */

    async fetchSearchApi(
        query
    ) {

        const url =
            this.buildApiUrl(
                query,
                0
            );


        const started =
            Date.now();


        try {

            const response =
                await axios.get(
                    url,
                    {

                        timeout:
                            this.requestTimeout,

                        maxRedirects:
                            5,

                        validateStatus:
                            () => true,

                        headers: {

                            "User-Agent":
                                this.userAgent,

                            "Accept":
                                "application/json,text/plain,*/*",

                            "Accept-Language":
                                "en-IN,en;q=0.9",

                            "Referer":
                                "https://www.ajio.com/",

                            "Cache-Control":
                                "no-cache",

                            "Pragma":
                                "no-cache"

                        }

                    }
                );


            console.log(
                `Ajio: API HTTP ${response.status} | ${Date.now() -
                started
                } ms`
            );


            if (
                response.status <
                200 ||
                response.status >=
                300
            ) {

                return null;

            }


            if (
                !response.data
            ) {

                return null;

            }


            return response.data;

        }
        catch (
        err
        ) {

            console.log(
                `Ajio: API request failed "${query}": ${err.message}`
            );


            return null;

        }

    }


    /*
    =====================================================
    FIND PRODUCT ARRAY
    =====================================================
    */

    findProductArray(
        value,
        visited = new Set(),
        depth = 0
    ) {

        if (
            value ===
            null ||
            value ===
            undefined
        ) {

            return null;

        }


        if (
            depth >
            8
        ) {

            return null;

        }


        if (
            typeof value !==
            "object"
        ) {

            return null;

        }


        if (
            visited.has(
                value
            )
        ) {

            return null;

        }


        visited.add(
            value
        );


        /*
        Direct arrays first.
        */

        if (
            Array.isArray(
                value
            )
        ) {

            const useful =
                value.filter(
                    item =>
                        item &&
                        typeof item ===
                        "object"
                );


            const productLikeCount =
                useful.filter(
                    item => {

                        const title =
                            this.extractTitle(
                                item
                            );


                        const url =
                            this.normalizeProductUrl(
                                item.url
                            );


                        const price =
                            this.extractCurrentPrice(
                                item
                            );


                        const id =
                            this.extractProductId(
                                item
                            );


                        return (
                            Boolean(
                                title
                            ) &&
                            Boolean(
                                url
                            ) &&
                            (
                                price !==
                                null ||
                                Boolean(
                                    id
                                )
                            )
                        );

                    }
                )
                    .length;


            if (
                productLikeCount >=
                2
            ) {

                return useful;

            }


            for (
                const item
                of value
            ) {

                const found =
                    this.findProductArray(
                        item,
                        visited,
                        depth + 1
                    );


                if (
                    found
                ) {

                    return found;

                }

            }


            return null;

        }


        /*
        Objects.
        */

        const keys =
            Object.keys(
                value
            );


        /*
        Prefer common catalog keys.
        */

        const priorityKeys = [

            "products",

            "product",

            "results",

            "items",

            "records",

            "data",

            "response",

            "result"

        ];


        for (
            const key
            of priorityKeys
        ) {

            if (
                !Object.prototype
                    .hasOwnProperty
                    .call(
                        value,
                        key
                    )
            ) {

                continue;

            }


            const found =
                this.findProductArray(
                    value[key],
                    visited,
                    depth + 1
                );


            if (
                found
            ) {

                return found;

            }

        }


        /*
        Fallback traversal.
        */

        for (
            const key
            of keys
        ) {

            if (
                priorityKeys.includes(
                    key
                )
            ) {

                continue;

            }


            const child =
                value[key];


            if (
                !child ||
                typeof child !==
                "object"
            ) {

                continue;

            }


            const found =
                this.findProductArray(
                    child,
                    visited,
                    depth + 1
                );


            if (
                found
            ) {

                return found;

            }

        }


        return null;

    }


    /*
    =====================================================
    MAP API PRODUCT
    =====================================================
    */

    mapApiProduct(
        product
    ) {

        if (
            !product ||
            typeof product !==
            "object"
        ) {

            return null;

        }


        const title =
            this.extractTitle(
                product
            );


        const url =
            this.normalizeProductUrl(
                product.url
            );


        if (
            !title ||
            !url
        ) {

            return null;

        }


        const currentPrice =
            this.extractCurrentPrice(
                product
            );


        const mrp =
            this.extractMrp(
                product
            );


        const discountPercent =
            this.extractDiscountPercent(
                product,
                currentPrice,
                mrp
            );


        const image =
            this.extractImage(
                product
            );


        const rating =
            this.extractRating(
                product
            );


        const reviews =
            this.extractReviewCount(
                product
            );


        const availability =
            this.extractAvailability(
                product
            );


        return {

            platform:
                this.platform,

            title,

            price:
                currentPrice,

            image,

            url,

            rating,

            reviews,

            availability,

            /*
            Internal metadata.

            Removed before returning from search().
            */

            _ajioProductId:
                this.extractProductId(
                    product
                ),

            _ajioBrand:
                this.extractBrand(
                    product
                ),

            _ajioMrp:
                mrp,

            _ajioDiscountPercent:
                discountPercent

        };

    }


    /*
    =====================================================
    API PRODUCT EXTRACTION
    =====================================================
    */

    extractApiProducts(
        response
    ) {

        const array =
            this.findProductArray(
                response
            );


        if (
            !array
        ) {

            console.log(
                "Ajio: Could not locate API product array."
            );


            return [];

        }


        const mapped =
            [];


        const seen =
            new Set();


        for (
            const item
            of array
        ) {

            if (
                mapped.length >=
                this.maxResults
            ) {

                break;

            }


            const product =
                this.mapApiProduct(
                    item
                );


            if (
                !product
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


            mapped.push(
                product
            );

        }


        return mapped;

    }


    /*
    =====================================================
    SEARCH HTML FALLBACK
    =====================================================
    */

    buildHtmlSearchUrl(
        query
    ) {

        return (
            "https://www.ajio.com/search/?" +
            "text=" +
            encodeURIComponent(
                this.normalizeSearchQuery(
                    query
                )
            )
        );

    }


    /*
    =====================================================
    FETCH HTML
    =====================================================
    */

    async fetchSearchHtml(
        query
    ) {

        const url =
            this.buildHtmlSearchUrl(
                query
            );


        try {

            const response =
                await axios.get(
                    url,
                    {

                        timeout:
                            this.htmlTimeout,

                        maxRedirects:
                            5,

                        validateStatus:
                            () => true,

                        headers: {

                            "User-Agent":
                                this.userAgent,

                            "Accept":
                                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                            "Accept-Language":
                                "en-IN,en;q=0.9",

                            "Referer":
                                "https://www.ajio.com/"

                        }

                    }
                );


            const html =
                String(
                    response.data ||
                    ""
                );


            console.log(
                `Ajio: HTML HTTP ${response.status} | ${html.length} bytes`
            );


            if (
                response.status <
                200 ||
                response.status >=
                300
            ) {

                return null;

            }


            return html;

        }
        catch (
        err
        ) {

            console.log(
                `Ajio: HTML fallback failed "${query}": ${err.message}`
            );


            return null;

        }

    }


    /*
    =====================================================
    EXTRACT JSON-LD
    =====================================================
    */

    extractJsonLdProducts(
        html
    ) {

        const products =
            [];


        const scriptRegex =
            /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;


        let match;


        while (
            (
                match =
                scriptRegex.exec(
                    html
                )
            ) !== null
        ) {

            const raw =
                String(
                    match[1] ||
                    ""
                )
                    .trim();


            if (
                !raw
            ) {

                continue;

            }


            let parsed;


            try {

                parsed =
                    JSON.parse(
                        raw
                    );

            }
            catch (_) {

                continue;

            }


            const schemas =
                Array.isArray(
                    parsed
                )
                    ? parsed
                    : [parsed];


            for (
                const schema
                of schemas
            ) {

                if (
                    !schema ||
                    schema["@type"] !==
                    "ItemList" ||
                    !Array.isArray(
                        schema.itemListElement
                    )
                ) {

                    continue;

                }


                for (
                    const entry
                    of schema.itemListElement
                ) {

                    if (
                        !entry
                    ) {

                        continue;

                    }


                    const title =
                        this.cleanText(
                            entry.name
                        );


                    const image =
                        this.normalizeImageUrl(
                            entry.image
                        );


                    const url =
                        this.normalizeProductUrl(
                            entry.url
                        );


                    const position =
                        Number(
                            entry.position
                        ) || 9999;


                    if (
                        !title ||
                        !url
                    ) {

                        continue;

                    }


                    products.push({

                        title,

                        image,

                        url,

                        position,

                        price:
                            null,

                        availability:
                            true

                    });

                }

            }

        }


        return products;

    }


    /*
    =====================================================
    NORMALIZE PRODUCTS
    =====================================================
    */

    normalizeProducts(
        products
    ) {

        const normalized =
            [];


        const seen =
            new Set();


        for (
            const product
            of products
        ) {

            if (
                !product
            ) {

                continue;

            }


            const title =
                this.cleanText(
                    product.title
                );


            const url =
                this.normalizeProductUrl(
                    product.url
                );


            if (
                !title ||
                !url
            ) {

                continue;

            }


            const key =
                url
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


            let price =
                this.parsePriceValue(
                    product.price
                );


            if (
                price !== null &&
                price <= 0
            ) {

                price =
                    null;

            }


            normalized.push(
                this.normalize({

                    ...product,

                    title,

                    price,

                    image:
                        product.image ||
                        null,

                    url,

                    rating:
                        product.rating ??
                        null,

                    reviews:
                        product.reviews ??
                        null,

                    availability:
                        product.availability !==
                        false

                })
            );


            /*
            Keep useful internal metadata.
            */

            const last =
                normalized[
                normalized.length - 1
                ];


            if (
                product._ajioProductId
            ) {

                last._ajioProductId =
                    product._ajioProductId;

            }


            if (
                product._ajioBrand
            ) {

                last._ajioBrand =
                    product._ajioBrand;

            }


            if (
                product._ajioMrp !==
                undefined
            ) {

                last._ajioMrp =
                    product._ajioMrp;

            }


            if (
                product._ajioDiscountPercent !==
                undefined
            ) {

                last._ajioDiscountPercent =
                    product._ajioDiscountPercent;

            }


            if (
                normalized.length >=
                this.maxResults
            ) {

                break;

            }

        }


        return normalized;

    }


    /*
    =====================================================
    TOKENIZE
    =====================================================
    */

    tokenize(
        value
    ) {

        return String(
            value ?? ""
        )
            .toLowerCase()
            .replace(
                /[^a-z0-9]+/g,
                " "
            )
            .split(/\s+/)
            .filter(
                token =>
                    token.length >=
                    2
            );

    }


    /*
    =====================================================
    WHOLE PHRASE
    =====================================================
    */

    containsWholePhrase(
        title,
        value
    ) {

        const titleTokens =
            new Set(
                this.tokenize(
                    title
                )
            );


        const valueTokens =
            this.tokenize(
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
            this.tokenize(
                query
            );


        const titleTokens =
            new Set(
                this.tokenize(
                    title
                )
            );


        if (
            queryTokens.length ===
            0
        ) {

            return 0;

        }


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
    */

    calculateIdentityScore(
        product,
        originalProduct = {}
    ) {

        if (
            !product ||
            !product.title
        ) {

            return 0;

        }


        let score =
            0;


        const title =
            product.title;


        /*
        BRAND
        */

        if (
            originalProduct.brand &&
            this.containsWholePhrase(
                title,
                originalProduct.brand
            )
        ) {

            score +=
                50;

        }


        /*
        PRODUCT NAME
        */

        const productTokens =
            this.tokenize(
                originalProduct.productName
            );


        if (
            productTokens.length > 0
        ) {

            const titleTokens =
                new Set(
                    this.tokenize(
                        title
                    )
                );


            let matched =
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

                    matched++;

                }

            }


            if (
                matched ===
                productTokens.length
            ) {

                score +=
                    40;

            }
            else if (
                matched > 0
            ) {

                score +=
                    5;

            }

        }


        /*
        MODEL
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
        VARIANT
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
        FLAVOUR
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
        WEIGHT
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


        return score;

    }

    /*
=====================================================
NORMALIZE WEIGHT
=====================================================
*/

    normalizeWeight(
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
                .toLowerCase()
                .replace(/,/g, "")
                .trim();

        /*
        800g / 800 g
        */

        let match =
            text.match(
                /(\d+(?:\.\d+)?)\s*g\b/i
            );

        if (
            match
        ) {

            return Number(
                match[1]
            );

        }

        /*
        0.8kg / 0.8 kg
        */

        match =
            text.match(
                /(\d+(?:\.\d+)?)\s*kg\b/i
            );

        if (
            match
        ) {

            return Number(
                match[1]
            ) * 1000;

        }

        return null;

    }


    /*
    =====================================================
    CORE PRODUCT TOKENS
    =====================================================
    */

    getCoreProductTokens(
        productName
    ) {

        const genericWords =
            new Set([
                "refill",
                "pack",
                "packet",
                "combo",
                "set",
                "box",
                "piece",
                "pieces",
                "pcs",
                "with",
                "free",
                "new",
                "latest",
                "original",
                "product"
            ]);


        return [
            ...new Set(
                this.tokenize(
                    productName
                )
                    .filter(
                        token =>
                            token.length >= 3 &&
                            !genericWords.has(
                                token
                            )
                    )
            )
        ];

    }


    /*
    =====================================================
    AJIO MATCH SCORE
    =====================================================
    */

    /*
 =====================================================
 AJIO MATCH SCORE
 =====================================================
 */

    calculateAjioMatchScore(
        product,
        originalProduct = {}
    ) {

        if (
            !product ||
            !product.title
        ) {

            return 0;

        }


        const titleTokens =
            new Set(
                this.tokenize(
                    product.title
                )
            );


        let score =
            0;


        /*
        =====================================================
        BRAND
        =====================================================
        */

        const originalBrand =
            this.cleanText(
                originalProduct.brand
            )
                .toLowerCase();


        const ajioBrand =
            this.cleanText(
                product._ajioBrand ||
                product.brand
            )
                .toLowerCase();


        if (
            originalBrand
        ) {

            /*
            When AJIO provides a brand field,
            it must match the requested brand.

            This prevents:

                Boost
                matching
                Hydro Boost
                Lenskart Boost
                Moisture Boost

            */

            if (
                ajioBrand
            ) {

                if (
                    ajioBrand !==
                    originalBrand
                ) {

                    return 0;

                }

                score += 50;

            }
            else {

                /*
                Brand is unavailable.

                Do NOT trust a title-only brand match
                because it creates false positives.
                */

                return 0;

            }

        }


        /*
        =====================================================
        CORE PRODUCT NAME
        =====================================================
        */

        const productName =
            this.cleanText(
                originalProduct.productName
            );


        let coreTokens =
            this.getCoreProductTokens(
                productName
            );


        /*
        Remove brand tokens from product-name
        matching because brand identity is already
        handled separately.
        */

        if (
            originalBrand
        ) {

            const brandTokens =
                new Set(
                    this.tokenize(
                        originalBrand
                    )
                );


            coreTokens =
                coreTokens.filter(
                    token =>
                        !brandTokens.has(
                            token
                        )
                );

        }


        if (
            coreTokens.length > 0
        ) {

            const matched =
                coreTokens.filter(
                    token =>
                        titleTokens.has(
                            token
                        )
                )
                    .length;


            const coverage =
                matched /
                coreTokens.length;


            /*
            Require at least reasonable
            product-name coverage.
            */

            score +=
                Math.round(
                    coverage * 35
                );

        }


        /*
        =====================================================
        FLAVOUR
        =====================================================
        */

        if (
            originalProduct.flavour
        ) {

            const flavourTokens =
                this.tokenize(
                    originalProduct.flavour
                );


            const matched =
                flavourTokens.length > 0 &&
                flavourTokens.every(
                    token =>
                        titleTokens.has(
                            token
                        )
                );


            if (
                matched
            ) {

                score += 5;

            }

        }


        /*
        =====================================================
        WEIGHT
        =====================================================
        */

        const originalWeight =
            this.normalizeWeight(
                originalProduct.weight
            );


        const titleWeight =
            this.normalizeWeight(
                product.title
            );


        if (
            originalWeight !== null &&
            titleWeight !== null
        ) {

            const difference =
                Math.abs(
                    originalWeight -
                    titleWeight
                );


            if (
                difference <= 1
            ) {

                score += 10;

            }
            else if (
                originalWeight > 0 &&
                difference /
                originalWeight <=
                0.05
            ) {

                score += 5;

            }

        }


        return score;

    }


    /*
    =====================================================
    AJIO RELEVANCE FILTER
    =====================================================
    */

   filterRelevantProducts(
    products,
    originalProduct = {},
    options = {}
) {

    const hasBrand =
        Boolean(
            this.cleanText(
                originalProduct.brand
            )
        );


    /*
    -----------------------------------------------------
    BRAND-AWARE THRESHOLD
    -----------------------------------------------------

    Brand available:
        65

    Brand unavailable:
        30

    Why?

    The AJIO score can give:

        Brand match       = 50
        Product coverage  = 35
        Flavour           = 5
        Weight            = 10

    Generic products do not have the 50-point
    brand component.

    Therefore a fixed 65 threshold makes every
    generic product impossible to return.

    Candidate Verification remains the final
    product-identity gate.
    -----------------------------------------------------
    */

    const defaultMinScore =
        hasBrand
            ? 65
            : 30;


    const minScore =
        Number.isFinite(
            options.minScore
        )
            ? options.minScore
            : defaultMinScore;


    const minResults =
        Number.isFinite(
            options.minResults
        )
            ? options.minResults
            : 0;


    const scored =
        products
            .map(
                product => ({

                    ...product,

                    ajioMatchScore:
                        this.calculateAjioMatchScore(
                            product,
                            originalProduct
                        )

                })
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    b.ajioMatchScore -
                    a.ajioMatchScore
            );


    const accepted =
        scored.filter(
            product =>
                product.ajioMatchScore >=
                minScore
        );


    /*
    -----------------------------------------------------
    FALLBACK
    -----------------------------------------------------
    */

    if (
        accepted.length === 0 &&
        minResults > 0
    ) {

        return scored.slice(
            0,
            minResults
        );

    }


    return accepted;

}


    /*
    =====================================================
    SCORE PRODUCTS
    =====================================================
    */

    scoreProducts(
        products,
        query,
        originalProduct = {}
    ) {

        return products
            .map(
                product => ({

                    ...product,

                    relevance:
                        this.calculateRelevance(
                            product.title,
                            query
                        ),

                    identityScore:
                        this.calculateIdentityScore(
                            product,
                            originalProduct
                        )

                })
            )
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


                    /*
                    Products with a real price
                    should rank above price-null
                    products when identity is equal.
                    */

                    const aHasPrice =
                        Number.isFinite(
                            a.price
                        );


                    const bHasPrice =
                        Number.isFinite(
                            b.price
                        );


                    if (
                        aHasPrice !==
                        bHasPrice
                    ) {

                        return bHasPrice -
                            aHasPrice;

                    }


                    if (
                        Number.isFinite(
                            a.price
                        ) &&
                        Number.isFinite(
                            b.price
                        )
                    ) {

                        return (
                            a.price -
                            b.price
                        );

                    }


                    return 0;

                }
            );

    }


    /*
    =====================================================
    BUILD QUERY LADDER
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


        const queries =
            [];


        /*
        Q1 - MOST SPECIFIC
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
        Q2 - CORE + FLAVOUR
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
        Q3 - BRAND + CORE
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
            queries.length ===
            0 &&
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
    SEARCH ONE QUERY
    =====================================================
    */

    async searchSingleQuery(
        query,
        originalProduct = {}
    ) {

        const normalizedQuery =
            this.normalizeSearchQuery(
                query
            );


        const started =
            Date.now();


        console.log(
            `Ajio: Query "${normalizedQuery}"`
        );


        /*
        =================================================
        API FIRST
        =================================================
        */

        const apiResponse =
            await this.fetchSearchApi(
                normalizedQuery
            );


        if (
            apiResponse
        ) {

            const apiProducts =
                this.extractApiProducts(
                    apiResponse
                );

            console.log(
                "AJIO RAW TITLES:"
            );

            for (
                const product
                of apiProducts
            ) {

                console.log(
                    "  →",
                    product.title
                );

            }


            if (
                apiProducts.length >
                0
            ) {

                const scored =
                    this.scoreProducts(
                        apiProducts,
                        normalizedQuery,
                        originalProduct
                    );


                const relevant =
                    this.filterRelevantProducts(
                        scored,
                        originalProduct
                    );


                console.log(
                    `Ajio: API products: ${apiProducts.length}`
                );

                console.log(
                    `Ajio: Relevant API products: ${relevant.length}`
                );


                for (
                    const product
                    of relevant.slice(0, 5)
                ) {

                    console.log(
                        `Ajio: ✅ ${product.title} | ` +
                        `match=${product.ajioMatchScore} | ` +
                        `price=${product.price !== null
                            ? "₹" + product.price
                            : "N/A"}`
                    );

                }


                console.log(
                    `Ajio: Query "${normalizedQuery}" completed in ${Date.now() -
                    started
                    } ms`
                );


                return relevant;

            }

        }


        /*
        =================================================
        HTML FALLBACK
        =================================================
        */

        console.log(
            `Ajio: API unavailable. Falling back to HTML for "${normalizedQuery}"`
        );


        const html =
            await this.fetchSearchHtml(
                normalizedQuery
            );


        if (
            !html
        ) {

            console.log(
                `Ajio: Query "${normalizedQuery}" returned no usable data`
            );


            return [];

        }


        const jsonProducts =
            this.extractJsonLdProducts(
                html
            );


        const normalized =
            this.normalizeProducts(
                jsonProducts
            );


        const scored =
            this.scoreProducts(
                normalized,
                normalizedQuery,
                originalProduct
            );


        const relevant =
            this.filterRelevantProducts(
                scored,
                originalProduct
            );


        console.log(
            `Ajio: HTML fallback products: ${normalized.length}`
        );

        console.log(
            `Ajio: Relevant HTML products: ${relevant.length}`
        );


        console.log(
            `Ajio: Query "${normalizedQuery}" completed in ${Date.now() -
            started
            } ms`
        );


        return relevant;

    }


    /*
    =====================================================
    SEARCH
    =====================================================
    */

    async search(
        query,
        originalProduct = {}
    ) {

        const started =
            Date.now();


        console.log(
            `Ajio: Searching "${query}"`
        );


        /*
        =================================================
        CACHE
        =================================================
        */

        const cacheKey =
            JSON.stringify({

                q:
                    this.normalizeSearchQuery(
                        query
                    )
                        .toLowerCase(),

                brand:
                    originalProduct.brand ||
                    "",

                productName:
                    originalProduct.productName ||
                    "",

                model:
                    originalProduct.model ||
                    "",

                variant:
                    originalProduct.variant ||
                    "",

                weight:
                    originalProduct.weight ||
                    "",

                flavour:
                    originalProduct.flavour ||
                    "",

                color:
                    originalProduct.color ||
                    ""

            });


        const cached =
            this.getCached(
                cacheKey
            );


        if (
            cached !== null
        ) {

            console.log(
                `Ajio: Returning ${cached.length
                } cached products`
            );


            return cached;

        }


        /*
        =================================================
        BUILD QUERY LADDER
        =================================================
        */

        const queries =
            this.buildSearchQueries(
                query,
                originalProduct
            );


        console.log(
            "Ajio: Candidate search queries:",
            queries
        );


        if (
            queries.length ===
            0
        ) {

            this.setCached(
                cacheKey,
                []
            );


            return [];

        }


        /*
        =================================================
        PRIMARY QUERY
        =================================================
        */

        const firstResults =
            await this.searchSingleQuery(
                queries[0],
                originalProduct
            );


        let allProducts =
            Array.isArray(
                firstResults
            )
                ? firstResults
                : [];


        /*
        =================================================
        EARLY STOP

        The first query is most specific.

        Stop when we have sufficiently strong results.
        =================================================
        */

        const strongCount =
            allProducts.filter(
                product =>
                    product.identityScore >= 50
            )
                .length;


        if (
            strongCount === 0 &&
            queries.length > 1
        ) {

            console.log(
                `Ajio: Q1 weak/empty. Running fallback "${queries[1]}"`
            );


            const secondResults =
                await this.searchSingleQuery(
                    queries[1],
                    originalProduct
                );


            if (
                Array.isArray(
                    secondResults
                )
            ) {

                allProducts.push(
                    ...secondResults
                );

            }

        }


        /*
 =================================================
 Q3 ONLY IF NECESSARY
 =================================================
 */

        const postSecondStrong =
            allProducts.filter(
                product =>
                    product.identityScore >= 50
            )
                .length;


        if (
            postSecondStrong === 0 &&
            queries.length > 2
        ) {

            console.log(
                `Ajio: Q2 still insufficient. Running Q3 "${queries[2]}"`
            );


            const thirdResults =
                await this.searchSingleQuery(
                    queries[2],
                    originalProduct
                );


            if (
                Array.isArray(
                    thirdResults
                )
            ) {

                allProducts.push(
                    ...thirdResults
                );

            }

        }


        /*
        =================================================
        DEDUPLICATE
        =================================================
        */

        const seen =
            new Set();


        const deduped =
            [];


        for (
            const product
            of allProducts
        ) {

            if (
                !product
            ) {

                continue;

            }


            const key =
                String(
                    product.url ||
                    product.title ||
                    ""
                )
                    .toLowerCase()
                    .trim();


            if (
                !key ||
                seen.has(
                    key
                )
            ) {

                continue;

            }


            seen.add(
                key
            );


            deduped.push(
                product
            );

        }


        /*
        =================================================
        GLOBAL SORT
        =================================================
        */

        const sorted =
            this.scoreProducts(
                deduped,
                query,
                originalProduct
            );


        /*
        =================================================
        LIMIT
        =================================================
        */

        const limited =
            sorted.slice(
                0,
                this.maxResults
            );


        /*
        =================================================
        REMOVE INTERNAL RANKING FIELDS
        =================================================
        */

        const finalProducts =
            limited.map(
                product => {

                    const {

                        relevance,

                        identityScore,

                        ajioMatchScore,

                        _ajioProductId,

                        _ajioBrand,

                        _ajioMrp,

                        _ajioDiscountPercent,

                        ...cleanProduct

                    } = product;


                    return {

                        ...cleanProduct,

                        /*
                        Keep useful AJIO pricing metadata
                        in optional fields.
    
                        These are safe because they describe
                        the same listing.
                        */

                        ...(Number.isFinite(
                            _ajioMrp
                        )
                            ? {
                                originalPrice:
                                    _ajioMrp
                            }
                            : {}),

                        ...(Number.isFinite(
                            _ajioDiscountPercent
                        )
                            ? {
                                discountPercent:
                                    _ajioDiscountPercent
                            }
                            : {}),

                        ...(_ajioBrand
                            ? {
                                brand:
                                    _ajioBrand
                            }
                            : {}),

                        ...(_ajioProductId
                            ? {
                                productId:
                                    _ajioProductId
                            }
                            : {})

                    };

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


        console.log(
            `Ajio: Final products: ${finalProducts.length
            }`
        );


        for (
            const product
            of finalProducts
        ) {

            console.log(
                `Ajio: ${product.title
                } → ${product.price !==
                    null
                    ? "₹" +
                    product.price
                    : "₹N/A"
                }`
            );

        }


        console.log(
            `⏱ Ajio: ${Date.now() -
            started
            } ms`
        );


        return finalProducts;

    }


    /*
    =====================================================
    CACHE HELPERS
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
            product => ({
                ...product
            })
        );

    }


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
                        product => ({
                            ...product
                        })
                    )

            }
        );


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

}


module.exports =
    new AjioAdapter();