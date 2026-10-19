/*
=====================================================
STOCKSENSE SEARCH QUERY GENERATOR
=====================================================
*/

function cleanText(value) {

    if (
        value === null ||
        value === undefined
    ) {
        return "";
    }

    let text =
        String(value)
            .trim();

    if (!text) {
        return "";
    }

    text =
        text.replace(
            /\s+/g,
            " "
        );

    text =
        text.replace(
            /(\d)([a-zA-Z]+)/g,
            "$1 $2"
        );

    text =
        text.replace(
            /([a-zA-Z])(\d)/g,
            "$1 $2"
        );

    return text
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}


function buildQuery(parts) {

    return parts
        .map(cleanText)
        .filter(Boolean)
        .join(" ")
        .replace(
            /\s+/g,
            " "
        )
        .trim()
        .toLowerCase();
}


function addUniqueQuery(
    queries,
    query
) {

    const clean =
        cleanText(query)
            .toLowerCase();

    if (!clean) {
        return;
    }

    if (
        !queries.includes(clean)
    ) {
        queries.push(clean);
    }
}


function generateSearchQueries(
    product = {},
    fallbackQuery = ""
) {

    const normalizedProduct =
        product || {};

    const brand =
        cleanText(
            normalizedProduct.brand
        );

    const productName =
        cleanText(
            normalizedProduct.productName
        );

    const model =
        cleanText(
            normalizedProduct.model
        );

    const variant =
        cleanText(
            normalizedProduct.variant
        );

    const weight =
        cleanText(
            normalizedProduct.weight
        );

    const flavour =
        cleanText(
            normalizedProduct.flavour
        );

    const color =
        cleanText(
            normalizedProduct.color
        );

    const storage =
        cleanText(
            normalizedProduct.storage
        );

    const ram =
        cleanText(
            normalizedProduct.ram
        );

    const queries = [];


    /*
    =====================================================
    Q1 — CANONICAL PRODUCT IDENTITY
    =====================================================
    */

    const canonicalQuery =
        buildQuery([
            brand,
            productName,
            model,
            variant
        ]);

    addUniqueQuery(
        queries,
        canonicalQuery
    );


    /*
    =====================================================
    GENERIC ATTRIBUTE RETRIEVAL
    =====================================================

    Some marketplaces may not understand an attribute
    using the same terminology as the user's query.

    Example:

        neckless shirts

    Alternative marketplace terminology:

        collarless shirts
        no collar shirts

    These are ONLY retrieval queries.

    They do NOT mean that a candidate is automatically
    considered a match.

    CandidateCollector + LocalVerifier + AI still
    perform the actual matching.
    =====================================================
    */

    const lowerProductName =
        productName.toLowerCase();


    /*
    -----------------------------------------------------
    NECK STYLE
    -----------------------------------------------------
    */

    if (
        /\bneckless\b/i.test(
            lowerProductName
        )
    ) {

        const baseProduct =
            lowerProductName
                .replace(
                    /\bneckless\b/gi,
                    ""
                )
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();


        /*
        Q2 — COLLARLESS
        */

        addUniqueQuery(
            queries,
            buildQuery([
                brand,
                "collarless",
                baseProduct,
                model,
                variant
            ])
        );


        /*
        Q3 — NO COLLAR
        */

        addUniqueQuery(
            queries,
            buildQuery([
                brand,
                "no collar",
                baseProduct,
                model,
                variant
            ])
        );

    }
    else {

        /*
        =================================================
        Q2 — IMPORTANT PRODUCT ATTRIBUTES
        =================================================
        */

        const attributeQuery =
            buildQuery([
                brand,
                productName,
                model,
                variant,
                weight,
                flavour,
                color,
                storage,
                ram
            ]);

        addUniqueQuery(
            queries,
            attributeQuery
        );


        /*
        =================================================
        Q3 — PRODUCT + FLAVOUR
        =================================================
        */

        const fallbackProductQuery =
            buildQuery([
                brand,
                productName,
                model,
                variant,
                flavour
            ]);

        addUniqueQuery(
            queries,
            fallbackProductQuery
        );

    }


    /*
    =====================================================
    FALLBACK
    =====================================================
    */

    if (
        queries.length === 0 &&
        fallbackQuery
    ) {

        addUniqueQuery(
            queries,
            fallbackQuery
        );

    }


    /*
    =====================================================
    MAXIMUM 3 QUERIES
    =====================================================
    */

    return queries
        .filter(Boolean)
        .slice(
            0,
            3
        );
}


module.exports = {
    generateSearchQueries
};


module.exports = {
    generateSearchQueries
};