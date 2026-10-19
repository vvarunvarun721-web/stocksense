const { searchAll } = require("../search/searchManager");

const {
    removeDuplicates
} = require("./duplicateRemover");

const {
    formatResponse
} = require("./responseFormatter");

const {
    findProducts
} = require("./productLookup");

const {
    collectCandidates
} = require("../search/candidateCollector");

const {
    filterResults
} = require("../search/filterResults");

const {
    generateSearchQueries
} = require("../search/searchQueryGenerator");


/*
=====================================================

KNOWN BRANDS

Used for fast local normalization of a text search.

=====================================================
*/

const KNOWN_BRANDS = [

    // Electronics
    "motorola",
    "samsung",
    "apple",
    "oneplus",
    "xiaomi",
    "redmi",
    "realme",
    "oppo",
    "vivo",
    "sony",
    "lg",
    "nokia",
    "asus",
    "lenovo",
    "hp",
    "dell",
    "acer",
    "boat",
    "noise",
    "jbl",

    // Fashion
    "nike",
    "adidas",
    "puma",
    "hrx",
    "levis",
    "allen solly",
    "peter england",
    "roadster",

    // Home / appliances
    "havells",
    "bajaj",
    "orient",
    "crompton",
    "philips",
    "usha",

    // Groceries / beverages
    "boost",
    "nestle",
    "amul",
    "britannia",
    "parle",
    "aashirvaad",
    "bournvita",
    "horlicks",
    "milo"

];


/*
=====================================================

DETECT BRAND

Checks multi-word brands first.

=====================================================
*/

function detectBrand(words) {

    const query =
        words
            .join(" ")
            .toLowerCase()
            .trim();


    const sortedBrands =
        [...KNOWN_BRANDS].sort(
            (a, b) =>
                b.length - a.length
        );


    for (
        const brand
        of sortedBrands
    ) {

        if (
            query.startsWith(
                brand.toLowerCase()
            )
        ) {

            return brand;

        }

    }


    return "";

}


/*
=====================================================

EXTRACT WEIGHT

Examples:

800 g
800g
1 kg
1kg
0.5 kg

Returns canonical string.

=====================================================
*/

function extractWeight(query) {

    const match =
        String(query || "")
            .match(
                /(\d+(?:\.\d+)?)\s*(kg|g)\b/i
            );


    if (
        !match
    ) {

        return null;

    }


    const amount =
        Number(match[1]);


    const unit =
        match[2].toLowerCase();


    if (
        unit === "kg"
    ) {

        return `${amount} kg`;

    }


    return `${amount} g`;

}


/*
=====================================================

EXTRACT FLAVOUR

For now keep this conservative.

Only return a flavour when the word appears
as a meaningful known flavour.

=====================================================
*/

const KNOWN_FLAVOURS = [

    "chocolate",
    "vanilla",
    "strawberry",
    "mango",
    "orange",
    "banana",
    "butterscotch",
    "coffee",
    "cola",
    "mint"

];


function extractFlavour(query) {

    const text =
        String(query || "")
            .toLowerCase();


    for (
        const flavour
        of KNOWN_FLAVOURS
    ) {

        const pattern =
            new RegExp(
                `\\b${flavour}\\b`,
                "i"
            );


        if (
            pattern.test(text)
        ) {

            return (
                flavour
                    .charAt(0)
                    .toUpperCase() +
                flavour.slice(1)
            );

        }

    }


    return null;

}

/*
=====================================================

CATEGORY DETECTION

Used only when the frontend does not provide
a category.

=====================================================
*/

/*
=====================================================
CATEGORY DETECTION

Used only when the frontend does not provide
a category.
=====================================================
*/

function detectCategory(query) {

    const text =
        String(query || "")
            .toLowerCase()
            .trim();


    /*
    =================================================
    BEAUTY / PERSONAL CARE

    IMPORTANT:
    Beauty is checked BEFORE groceries because
    words like "oil" and "chocolate" can otherwise
    cause incorrect category detection.
    =================================================
    */

    const beautyKeywords = [

        // Skin care
        "body lotion",
        "lotion",
        "moisturizer",
        "moisturiser",
        "face cream",
        "face wash",
        "facewash",
        "face cleanser",
        "cleanser",
        "face serum",
        "serum",
        "sunscreen",
        "sun screen",
        "skin care",
        "skincare",
        "skin cream",
        "scrub",
        "toner",

        // Hair care
        "shampoo",
        "conditioner",
        "hair oil",
        "hair serum",
        "hair cream",
        "hair mask",
        "hair gel",
        "hair wax",
        "hair spray",
        "anti dandruff",

        // Bath / body care
        "body wash",
        "body scrub",
        "body spray",
        "bath soap",
        "hand wash",
        "handwash",
        "deodorant",
        "deodrant",
        "perfume",
        "fragrance",

        // Makeup
        "lipstick",
        "lip balm",
        "lip gloss",
        "foundation",
        "concealer",
        "compact powder",
        "face powder",
        "talcum powder",
        "loose powder",
        "mascara",
        "eyeliner",
        "eye liner",
        "kajal",
        "blush",
        "makeup",
        "make up",
        "cosmetics",

        // General beauty
        "beauty",
        "personal care",
        "personal-care",
        "cosmetic"
    ];


    if (
        beautyKeywords.some(
            keyword =>
                text.includes(keyword)
        )
    ) {
        return "beauty";
    }


    /*
    =================================================
    GROCERIES / BEVERAGES
    =================================================
    */

    const groceryKeywords = [

        // Beverages / nutrition
        "boost",
        "bournvita",
        "horlicks",
        "milo",
        "nutrition drink",
        "protein powder",
        "health drink",

        // Food
        "food",
        "chocolate",
        "biscuits",
        "rice",
        "sugar",
        "flour",
        "milk",
        "juice",

        // Cooking / edible oil
        "cooking oil",
        "edible oil",
        "sunflower oil",
        "groundnut oil",
        "mustard oil",
        "olive oil"
    ];


    if (
        groceryKeywords.some(
            keyword =>
                text.includes(keyword)
        )
    ) {
        return "groceries";
    }


    /*
    =================================================
    FASHION
    =================================================
    */

    const fashionKeywords = [

        "t-shirt",
        "tshirt",
        "shirt",
        "jeans",
        "dress",
        "saree",
        "shoes",
        "sneakers",
        "jacket",
        "hoodie",
        "kurta",
        "trousers",
        "pants",
        "shorts",
        "skirt",
        "top",
        "leggings",
        "track pants",
        "tracksuit",
        "innerwear",
        "underwear",
        "sandals",
        "slippers",
        "heels",
        "formal shoes",
        "casual shoes"
    ];


    if (
        fashionKeywords.some(
            keyword =>
                text.includes(keyword)
        )
    ) {
        return "fashion";
    }


    /*
    =================================================
    HOME
    =================================================
    */

    const homeKeywords = [

        "stove",
        "induction",
        "mixer",
        "grinder",
        "mixer grinder",
        "fan",
        "iron",
        "microwave",
        "refrigerator",
        "fridge",
        "washing machine",
        "air conditioner",
        "air cooler",
        "cooler",
        "chair",
        "table",
        "sofa",
        "bed",
        "mattress",
        "wardrobe",
        "bookshelf",
        "dining table",
        "study table",
        "curtain",
        "carpet",
        "furniture",
        "utensils",
        "cookware",
        "pressure cooker"
    ];


    if (
        homeKeywords.some(
            keyword =>
                text.includes(keyword)
        )
    ) {
        return "home";
    }


    /*
    =================================================
    ELECTRONICS
    =================================================
    */

    const electronicsKeywords = [

        "phone",
        "smartphone",
        "iphone",
        "galaxy",
        "oneplus",
        "pixel",
        "laptop",
        "notebook",
        "tablet",
        "ipad",
        "monitor",
        "tv",
        "television",
        "smart tv",
        "headphones",
        "earbuds",
        "earphones",
        "airpods",
        "smartwatch",
        "watch",
        "camera",
        "keyboard",
        "mouse",
        "printer",
        "router",
        "speaker",
        "bluetooth speaker",
        "gaming console",
        "playstation",
        "xbox",
        "power bank",
        "charger",
        "ssd",
        "hard disk",
        "graphics card",
        "gpu",
        "ram",
        "processor",
        "cpu"
    ];


    if (
        electronicsKeywords.some(
            keyword =>
                text.includes(keyword)
        )
    ) {
        return "electronics";
    }


    /*
    =================================================
    DEFAULT CATEGORY

    Keep electronics as the fallback so the existing
    StockSense behaviour is preserved.
    =================================================
    */

    return "electronics";
}


/*
=====================================================

BUILD ORIGINAL PRODUCT

Converts a user text query into the structure
used by the search intelligence pipeline.

=====================================================
*/

function buildOriginalProduct(
    query,
    category = "electronics"
) {

    const cleanQuery =
        String(query || "")
            .trim();


    if (
        !cleanQuery
    ) {

        return {

            title: "",
            brand: "",
            productName: "",
            category,
            weight: null,
            storage: null,
            ram: null,
            flavour: null

        };

    }


    const words =
        cleanQuery
            .split(/\s+/)
            .filter(Boolean);


    const brand =
        detectBrand(words);


    let productWords = [
        ...words
    ];


    /*
    =================================================

    REMOVE BRAND FROM PRODUCT NAME

    =================================================
    */

    if (
        brand
    ) {

        const brandWordCount =
            brand
                .split(/\s+/)
                .length;


        productWords =
            productWords.slice(
                brandWordCount
            );

    }


    /*
    =================================================

    EXTRACT ATTRIBUTES

    =================================================
    */

    const weight =
        extractWeight(
            cleanQuery
        );


    const flavour =
        extractFlavour(
            cleanQuery
        );


    /*
    =================================================

    REMOVE WEIGHT FROM PRODUCT NAME

    =================================================
    */

    let productName =
        productWords.join(" ");


    productName =
        productName
            .replace(
                /\b\d+(?:\.\d+)?\s*(?:kg|g)\b/gi,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();


    /*
    =================================================

    REMOVE KNOWN FLAVOUR FROM PRODUCT NAME

    Keep the product name focused on the identity.

    Example:

    Chocolate Nutrition Drink

    remains:

    Chocolate Nutrition Drink

    We intentionally do NOT remove flavour here
    because chocolate can be part of the canonical
    product name.

    =================================================
    */


    return {

        title:
            cleanQuery,

        brand,

        productName,

        category,

        weight,

        storage: null,

        ram: null,

        flavour

    };

}


/*
=====================================================

LIVE SEARCH

=====================================================
*/

async function searchProducts(
    query,
    category
) {

    console.log(
        "========== DISCOVERY =========="
    );

    console.log(
        "Searching:",
        query
    );


    /*
    =================================================

    USE FRONTEND CATEGORY WHEN PROVIDED.

    OTHERWISE INFER IT FROM THE SEARCH QUERY.

    =================================================
    */

    const resolvedCategory =
        category ||
        detectCategory(
            query
        );


    console.log(
        "Category:",
        resolvedCategory
    );

    /*
    =================================================

    STEP 1

    BUILD NORMALIZED ORIGINAL PRODUCT

    =================================================
    */

    const originalProduct =
        buildOriginalProduct(
            query,
            resolvedCategory
        );


    console.log(
        "Original Product:",
        originalProduct
    );


    /*
    =================================================

    STEP 2

    SEARCH DATABASE

    =================================================
    */

    const catalogProducts =
        await findProducts(
            query
        );


    if (
        catalogProducts.length > 0
    ) {

        console.log(
            `Found ${catalogProducts.length} products in database.`
        );


        return {

            source: "database",

            count:
                catalogProducts.length,

            products:
                catalogProducts

        };

    }


    console.log(
        "Not found in database."
    );

    console.log(
        "Searching live platforms..."
    );


    /*
    =================================================

    STEP 3

    SEARCH LIVE PLATFORMS

    =================================================
    */

    const searchQueries =
        generateSearchQueries(originalProduct);

    console.log(
        "Generated Search Queries:",
        searchQueries
    );

    const rawProducts =
        await searchAll(
            searchQueries,
            originalProduct,
            resolvedCategory
        );


    console.log(
        `Raw products collected: ${rawProducts.length}`
    );


    /*
    =================================================

    STEP 4

    REMOVE DUPLICATES

    =================================================
    */

    const uniqueProducts =
        removeDuplicates(
            rawProducts
        );


    console.log(
        `After duplicate removal: ${uniqueProducts.length}`
    );


    /*
    =================================================

    STEP 5

    COLLECT STRONG CANDIDATES

    =================================================
    */

    const candidates =
        collectCandidates(

            originalProduct,

            uniqueProducts

        );


    console.log(
        `Strong candidates: ${candidates.length}`
    );


    /*
    =================================================

    STEP 6

    LOCAL + AI VERIFICATION

    =================================================
    */

    const matchedProducts =
        await filterResults(

            originalProduct,

            candidates

        );


    console.log(
        `AI verified products: ${matchedProducts.length}`
    );


    /*
    =================================================

    STEP 7

    FINAL RANKING

    =================================================
    */

    matchedProducts.sort(

        (a, b) =>
            (b.finalScore || 0) -
            (a.finalScore || 0)

    );


    /*
    =================================================

    STEP 8

    FORMAT RESPONSE

    =================================================
    */

    return {

        source: "live",

        ...formatResponse(
            matchedProducts
        )

    };

}


module.exports = {

    searchProducts,

    buildOriginalProduct

};