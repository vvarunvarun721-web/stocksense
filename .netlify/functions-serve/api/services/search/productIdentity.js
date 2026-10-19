const {
    canonicalizeProductText,
    getCanonicalTokens
} = require("../../utils/attributeNormalizer");


/*
=========================================================
PRODUCT IDENTITY ENGINE
=========================================================

Purpose:

Determine the structural relationship between two
normalized products.

Possible results:

SAME
VARIANT
DIFFERENT
UNKNOWN

IMPORTANT:

This module does NOT perform final product matching.

It only detects strong structural relationships.

=========================================================
*/


function normalizeValue(value) {

    if (!value) {
        return null;
    }

    return canonicalizeProductText(
        String(value)
    );

}

/*
=========================================================
GET EFFECTIVE MODEL
=========================================================

The scraper may not always populate product.model.

For model-oriented products, productName can itself
contain the model identity.

Examples:

Motorola
productName = "Edge 50"
model = null

Samsung
productName = "Galaxy S24"
model = null

In those cases productName must participate in
identity comparison.

=========================================================
*/

function getEffectiveModel(product) {

    if (!product) {
        return null;
    }


    /*
    ---------------------------------------------
    Explicit model has highest priority
    ---------------------------------------------
    */

    const explicitModel =
        normalizeValue(
            product.model
        );


    if (explicitModel) {

        return explicitModel;

    }


    /*
    ---------------------------------------------
    Fall back to productName only when it contains
    a recognizable model identity.
    ---------------------------------------------
    */

    const productName =
        normalizeValue(
            product.productName
        );


    if (!productName) {
        return null;
    }


    const modelPatterns = [

        /\bedge\s+\d+\b/i,

        /\bgalaxy\s+[a-z]?\d+\b/i,

        /\bgalaxy\s+[a-z]+\s+\d+\b/i,

        /\biphone\s+\d+\b/i,

        /\bipad\s+\d+\b/i,

        /\bpixel\s+\d+\b/i,

        /\boneplus\s+\d+\b/i,

        /\bredmi\s+note\s+\d+\b/i,

        /\bredmi\s+\d+\b/i,

        /\bpoco\s+[a-z]?\d+\b/i,

        /\brealme\s+[a-z]?\d+\b/i,

        /\bvivo\s+[a-z]?\d+\b/i,

        /\boppo\s+[a-z]?\d+\b/i,

        /\bnothing\s+phone\s+\d+\b/i

    ];


    for (
        const pattern of modelPatterns
    ) {

        const match =
            productName.match(pattern);


        if (match) {

            return canonicalizeProductText(
                match[0]
            );

        }

    }


    return null;

}


/*
=========================================================
COMPARE BRANDS
=========================================================
*/

function compareBrands(original, candidate) {

    const a =
        normalizeValue(original.brand);

    const b =
        normalizeValue(candidate.brand);


    /*
    Neither product has a known brand.
    */

    if (!a && !b) {
        return "unknown";
    }


    /*
    One has a brand and the other doesn't.

    Don't automatically reject.

    The candidate may simply have omitted the brand.
    */

    if (!a || !b) {
        return "unknown";
    }


    if (a === b) {
        return "same";
    }


    return "different";

}
/*
=========================================================
COMPARE MODELS
=========================================================

Uses:

1. Explicit model
2. Strong model identity contained in productName

This prevents:

Motorola Edge 50
vs
Motorola Edge 60 Pro

from being treated as UNKNOWN.

=========================================================
*/

function compareModels(original, candidate) {

    const a =
        getEffectiveModel(
            original
        );

    const b =
        getEffectiveModel(
            candidate
        );


    /*
    ---------------------------------------------
    Neither product has reliable model identity
    ---------------------------------------------
    */

    if (!a && !b) {

        return "unknown";

    }


    /*
    ---------------------------------------------
    One product has model identity but the other
    doesn't.

    Do not reject automatically.

    ---------------------------------------------
    */

    if (!a || !b) {

        return "unknown";

    }


    /*
    ---------------------------------------------
    Exact model identity
    ---------------------------------------------
    */

    if (a === b) {

        return "same";

    }


    /*
    ---------------------------------------------
    Different model identity
    ---------------------------------------------
    */

    return "different";

}


/*
=========================================================
COMPARE VARIANTS
=========================================================
*/

function compareVariants(original, candidate) {

    const a =
        normalizeValue(original.variant);

    const b =
        normalizeValue(candidate.variant);


    /*
    Neither has a variant.
    */

    if (!a && !b) {
        return "same";
    }


    /*
    Original has no variant.

    Candidate has one.

    Example:

    iPhone 16
    vs
    iPhone 16 Pro

    Same model, candidate is a variant.
    */

    if (!a && b) {
        return "candidate_variant";
    }


    /*
    Original has a variant but candidate doesn't.

    Example:

    iPhone 16 Pro
    vs
    iPhone 16
    */

    if (a && !b) {
        return "original_variant";
    }


    /*
    Both have variants.
    */

    if (a === b) {
        return "same";
    }


    return "different";

}


/*
=========================================================
CATEGORY COMPARISON
=========================================================
*/

function compareCategories(original, candidate) {

    const a =
        normalizeValue(original.category);

    const b =
        normalizeValue(candidate.category);


    if (!a || !b) {
        return "unknown";
    }


    if (a === b) {
        return "same";
    }


    /*
    We deliberately DON'T reject here.

    Different marketplaces may categorize the same
    product differently.

    Example:

    "mobile"
    "smartphone"

    could refer to the same thing.

    Category should therefore be a scoring signal,
    not an absolute rejection rule.
    */

    return "different";

}


/*
=========================================================
MAIN IDENTITY FUNCTION
=========================================================
*/

function analyzeIdentity(
    original,
    candidate
) {

    const brand =
        compareBrands(
            original,
            candidate
        );


    const model =
        compareModels(
            original,
            candidate
        );


    const variant =
        compareVariants(
            original,
            candidate
        );


    const category =
        compareCategories(
            original,
            candidate
        );


    /*
    =====================================================
    HARD BRAND CONFLICT
    =====================================================
    */

    if (model === "different") {

    /*
    =====================================================
    DIFFERENT MODEL

    A different model is NOT the same product.

    However, when:
        - brand is the same
        - category is the same

    it may be a RELATED ALTERNATIVE.

    Example:

        Titan 90155AP03
        vs
        Titan Celestor

    These must NOT be treated as exact matches.

    They may be shown as:
        RELATED
    =====================================================
    */

    if (
        brand === "same" &&
        category === "same"
    ) {

        return {

            relationship: "RELATED",

            reason:
                "Different model but same brand and category",

            brand,
            model,
            variant,
            category

        };

    }


    /*
    Different model + different brand/category
    remains a hard conflict.
    */

    return {

        relationship: "DIFFERENT",

        reason:
            "Different product identity",

        brand,
        model,
        variant,
        category

    };

}


    /*
    =====================================================
    HARD MODEL CONFLICT
    =====================================================
    */

    if (model === "different") {

        return {

            relationship: "DIFFERENT",

            reason: "Different product models",

            brand,
            model,
            variant,
            category

        };

    }


    /*
    =====================================================
    SAME MODEL
    =====================================================
    */

    if (model === "same") {

        /*
        Same model + different variant
        */

        if (
            variant === "different" ||
            variant === "candidate_variant" ||
            variant === "original_variant"
        ) {

            return {

                relationship: "VARIANT",

                reason: "Same model with different variant",

                brand,
                model,
                variant,
                category

            };

        }


        /*
        Same model + same/no variant
        */

        return {

            relationship: "SAME",

            reason: "Same product model",

            brand,
            model,
            variant,
            category

        };

    }


    /*
    =====================================================
    GENERIC PRODUCTS
    =====================================================

    Neither product has a model.

    Example:

    T-shirt
    vs
    Cotton T-shirt

    Let the existing rule scorer + AI handle it.
    */

    if (
        model === "unknown" &&
        !original.model &&
        !candidate.model
    ) {

        return {

            relationship: "UNKNOWN",

            reason: "No reliable model information",

            brand,
            model,
            variant,
            category

        };

    }


    /*
    =====================================================
    UNKNOWN
    =====================================================
    */

    return {

        relationship: "UNKNOWN",

        reason: "Insufficient product identity information",

        brand,
        model,
        variant,
        category

    };

}


module.exports = {

    analyzeIdentity,

    getEffectiveModel

};