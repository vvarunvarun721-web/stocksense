/*
=====================================================
STOCKSENSE SEARCH QUERY GENERATOR
=====================================================

Purpose:
- Convert the normalized original product into
  multiple retrieval-friendly search queries.
- Preserve the original product identity.
- Generate semantic alternatives for generic/
  attribute-based searches.
- Keep the output bounded to a maximum of 3 queries.

IMPORTANT:
This module only GENERATES retrieval queries.

It does NOT:
- validate products
- score candidates
- reject products
- call AI
- perform platform searches

=====================================================
*/


/*
=====================================================
CLEAN TEXT
=====================================================
*/

function cleanText(value) {

    return String(value || "")
        .replace(/\s+/g, " ")
        .replace(/\s*([/,-])\s*/g, "$1")
        .trim();

}


/*
=====================================================
NORMALIZE SEARCH TEXT
=====================================================
*/

function normalizeSearchText(value) {

    return cleanText(value)
        .toLowerCase()
        .replace(/\b(\d+(?:\.\d+)?)\s*(kg|g|mg|ml|l)\b/gi, "$1 $2")
        .replace(/\b(\d+)\s*(gb|tb|mb|kb)\b/gi, "$1 $2")
        .replace(/\s+/g, " ")
        .trim();

}


/*
=====================================================
REMOVE DUPLICATE QUERIES
=====================================================
*/

function uniqueQueries(queries) {

    const seen = new Set();
    const result = [];

    for (const query of queries) {

        const cleaned = cleanText(query);

        if (!cleaned) {
            continue;
        }

        const key = normalizeSearchText(cleaned);

        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        result.push(cleaned);
    }

    return result;
}


/*
=====================================================
BUILD CANONICAL IDENTITY
=====================================================

Priority:

brand
productName
model
variant

Specifications such as weight/storage/RAM are
added separately where useful.

=====================================================
*/

function buildCanonicalIdentity(originalProduct = {}) {

    const parts = [];

    const brand = cleanText(originalProduct.brand);
    const productName = cleanText(originalProduct.productName);
    const model = cleanText(originalProduct.model);
    const variant = cleanText(originalProduct.variant);

    if (brand) {
        parts.push(brand);
    }

    if (productName) {
        parts.push(productName);
    }

    if (model) {
        parts.push(model);
    }

    if (variant) {
        parts.push(variant);
    }

    return cleanText(parts.join(" "));
}


/*
=====================================================
BUILD ATTRIBUTE QUERY
=====================================================
*/

function buildAttributeQuery(originalProduct = {}) {

    const parts = [];

    const brand = cleanText(originalProduct.brand);
    const productName = cleanText(originalProduct.productName);
    const model = cleanText(originalProduct.model);
    const variant = cleanText(originalProduct.variant);

    const weight = cleanText(originalProduct.weight);
    const flavour = cleanText(originalProduct.flavour);
    const color = cleanText(originalProduct.color);
    const storage = cleanText(originalProduct.storage);
    const ram = cleanText(originalProduct.ram);

    if (brand) {
        parts.push(brand);
    }

    if (productName) {
        parts.push(productName);
    }

    if (model) {
        parts.push(model);
    }

    if (variant) {
        parts.push(variant);
    }

    if (weight) {
        parts.push(weight);
    }

    if (flavour) {
        parts.push(flavour);
    }

    if (color) {
        parts.push(color);
    }

    if (storage) {
        parts.push(storage);
    }

    if (ram) {
        parts.push(ram);
    }

    return cleanText(parts.join(" "));
}


/*
=====================================================
ATTRIBUTE ALIAS EXPANSION
=====================================================

These aliases are primarily for retrieval.

Example:

neckless shirts
        ↓
collarless shirts
        ↓
no collar shirts

The original query remains Q1.

=====================================================
*/

function buildAttributeAliases(originalProduct = {}) {

    const productName =
        cleanText(originalProduct.productName);

    const brand =
        cleanText(originalProduct.brand);

    const model =
        cleanText(originalProduct.model);

    const variant =
        cleanText(originalProduct.variant);

    const weight =
        cleanText(originalProduct.weight);

    const flavour =
        cleanText(originalProduct.flavour);

    const color =
        cleanText(originalProduct.color);

    const storage =
        cleanText(originalProduct.storage);

    const ram =
        cleanText(originalProduct.ram);


    const lowerProductName =
        productName.toLowerCase();


    /*
    -------------------------------------------------
    NECKLESS / COLLARLESS / NO-COLLAR
    -------------------------------------------------
    */

    const isNeckless =
        /\bneckless\b/i.test(productName);

    const isCollarless =
        /\bcollarless\b/i.test(productName);

    const isNoCollar =
        /\bno[- ]collar\b/i.test(productName);


    if (
        isNeckless ||
        isCollarless ||
        isNoCollar
    ) {

        /*
        Remove only the attribute phrase.
        Keep the actual product identity.

        Example:

        neckless t shirts
        ↓
        t shirts
        */

        const baseProduct =
            productName
                .replace(/\bneckless\b/gi, "")
                .replace(/\bcollarless\b/gi, "")
                .replace(/\bno[- ]collar\b/gi, "")
                .replace(/\s+/g, " ")
                .trim();


        const suffixParts = [];

        if (model) {
            suffixParts.push(model);
        }

        if (variant) {
            suffixParts.push(variant);
        }

        if (weight) {
            suffixParts.push(weight);
        }

        if (flavour) {
            suffixParts.push(flavour);
        }

        if (color) {
            suffixParts.push(color);
        }

        if (storage) {
            suffixParts.push(storage);
        }

        if (ram) {
            suffixParts.push(ram);
        }


        const suffix =
            cleanText(
                suffixParts.join(" ")
            );


        const prefix =
            cleanText(
                brand
            );


        const commonBase =
            cleanText(
                [
                    prefix,
                    baseProduct,
                    suffix
                ]
                    .filter(Boolean)
                    .join(" ")
            );


        if (!commonBase) {
            return [];
        }


        return [

            cleanText(
                `collarless ${commonBase}`
            ),

            cleanText(
                `no collar ${commonBase}`
            )

        ];
    }


    return [];
}


/*
=====================================================
MAIN QUERY GENERATOR
=====================================================
*/

function generateSearchQueries(originalProduct = {}) {

    const queries = [];


    /*
    -------------------------------------------------
    Q1 — CANONICAL IDENTITY
    -------------------------------------------------
    */

    const canonicalIdentity =
        buildCanonicalIdentity(
            originalProduct
        );


    if (canonicalIdentity) {

        queries.push(
            canonicalIdentity
        );
    }


    /*
    -------------------------------------------------
    SPECIAL ATTRIBUTE ALIASES
    -------------------------------------------------
    */

    const aliases =
        buildAttributeAliases(
            originalProduct
        );


    if (aliases.length > 0) {

        queries.push(
            aliases[0]
        );

        if (aliases.length > 1) {

            queries.push(
                aliases[1]
            );
        }

    } else {

        /*
        -------------------------------------------------
        Q2 — ATTRIBUTE-RICH QUERY
        -------------------------------------------------
        */

        const attributeQuery =
            buildAttributeQuery(
                originalProduct
            );


        if (
            attributeQuery &&
            normalizeSearchText(attributeQuery) !==
            normalizeSearchText(canonicalIdentity)
        ) {

            queries.push(
                attributeQuery
            );
        }


        /*
        -------------------------------------------------
        Q3 — PRODUCT + IMPORTANT ATTRIBUTE
        -------------------------------------------------
        */

        const productName =
            cleanText(
                originalProduct.productName
            );

        const flavour =
            cleanText(
                originalProduct.flavour
            );

        const weight =
            cleanText(
                originalProduct.weight
            );


        if (productName) {

            const focusedParts = [
                cleanText(originalProduct.brand),
                productName
            ];


            if (flavour) {
                focusedParts.push(flavour);
            }

            if (weight) {
                focusedParts.push(weight);
            }


            const focusedQuery =
                cleanText(
                    focusedParts
                        .filter(Boolean)
                        .join(" ")
                );


            if (
                focusedQuery &&
                normalizeSearchText(focusedQuery) !==
                normalizeSearchText(canonicalIdentity)
            ) {

                queries.push(
                    focusedQuery
                );
            }
        }
    }


    /*
    -------------------------------------------------
    FINAL DEDUPLICATION
    -------------------------------------------------
    */

    const finalQueries =
        uniqueQueries(
            queries
        );


    /*
    -------------------------------------------------
    HARD LIMIT
    -------------------------------------------------
    */

    return finalQueries.slice(0, 3);
}


/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = {

    generateSearchQueries,

    buildCanonicalIdentity,

    buildAttributeQuery

};