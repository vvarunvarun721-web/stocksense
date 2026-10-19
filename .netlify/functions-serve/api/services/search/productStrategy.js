/*
=====================================================

PRODUCT MATCHING STRATEGY

Determines which matching strategy should be used
for a product.

Strategies:

MODEL_BASED
    Products with a reliable brand/model identity.

ATTRIBUTE_BASED
    Products mainly identified by measurable or
    important attributes such as:

    - weight
    - storage
    - RAM
    - flavour

GENERIC
    Products without a reliable model identity.
    These require semantic/rule/AI verification.

=====================================================
*/


function hasValue(value) {

    return (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    );

}


/*
=====================================================

NORMALIZE TEXT

=====================================================
*/

function normalizeText(value) {

    if (!hasValue(value)) {
        return "";
    }

    return String(value)
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");

}


/*
=====================================================

REMOVE COMMON SPECIFICATIONS

These should NOT be interpreted as model identity.

Examples:

128GB
256GB
8GB RAM
500ml
800g
2000W
72h
24 hours

=====================================================
*/

function removeSpecifications(text) {

    if (!text) {
        return "";
    }

    return text
        .replace(
            /\b\d+(\.\d+)?\s*(gb|tb|mb|kb)\b/gi,
            " "
        )
        .replace(
            /\b\d+(\.\d+)?\s*(w|kw)\b/gi,
            " "
        )
        .replace(
            /\b\d+(\.\d+)?\s*(g|kg|gm|mg|ml|l|litre|liter)\b/gi,
            " "
        )
        .replace(
            /\b\d+\s*gb\s*ram\b/gi,
            " "
        )
        .replace(
            /\b\d+\s*(h|hr|hrs|hour|hours)\b/gi,
            " "
        )
        .replace(
            /\b\d+\s*%\b/gi,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();

}


/*
=====================================================

CHECK MODEL-LIKE PRODUCT NAME

A productName can sometimes contain the model identity
even when the scraper did not populate product.model.

Examples:

Edge 50
Galaxy S24
iPhone 16
OnePlus 12
Pixel 9
Redmi Note 14

But generic names such as:

Body Milk Very Dry Skin 72H
Cotton T-Shirt
Face Wash

should remain GENERIC.

=====================================================
*/

function hasModelLikeProductName(product) {

    if (!hasValue(product.productName)) {
        return false;
    }

    const productName =
        removeSpecifications(
            normalizeText(product.productName)
        );

    if (!productName) {
        return false;
    }


    /*
    ---------------------------------------------
    Known model-family patterns
    ---------------------------------------------
    */

    const strongModelPatterns = [

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

        /\bnothing\s+phone\s+\d+\b/i,

        /\biphone\s+\d+\s*(pro|max|plus|air)?\b/i

    ];


    if (
        strongModelPatterns.some(
            pattern =>
                pattern.test(productName)
        )
    ) {

        return true;

    }


    return false;

}


/*
=====================================================

CHECK FOR RELIABLE MODEL

A product should use MODEL_BASED matching when it
has meaningful model information.

Priority:

1. Explicit model field
2. Strong model identity inside productName

=====================================================
*/

function hasReliableModel(product) {

    /*
    ---------------------------------------------
    Explicit model field
    ---------------------------------------------
    */

    if (
        hasValue(product.model)
    ) {

        const model =
            String(product.model)
                .trim();


        /*
        Very short values such as:

        "S"
        "X"
        "1"

        are usually not reliable enough by
        themselves.
        */

        if (
            model.length >= 3
        ) {

            return true;

        }

    }


    /*
    ---------------------------------------------
    Model contained in productName
    ---------------------------------------------
    */

    if (
        hasModelLikeProductName(product)
    ) {

        return true;

    }


    return false;

}


/*
=====================================================

COUNT IMPORTANT ATTRIBUTES

These attributes can materially change whether
two products are equivalent.

=====================================================
*/

function getImportantAttributes(product) {

    const attributes = [];

    if (hasValue(product.weight)) {
        attributes.push("weight");
    }

    if (hasValue(product.storage)) {
        attributes.push("storage");
    }

    if (hasValue(product.ram)) {
        attributes.push("ram");
    }

    if (hasValue(product.flavour)) {
        attributes.push("flavour");
    }

    return attributes;

}


/*
=====================================================

MAIN STRATEGY CLASSIFIER

Priority:

1. MODEL_BASED
2. ATTRIBUTE_BASED
3. GENERIC

=====================================================
*/

function determineProductStrategy(product) {

    /*
    =============================================
    MODEL BASED
    =============================================
    */

    if (
        hasReliableModel(product)
    ) {

        return {

            strategy:
                "MODEL_BASED",

            reason:
                "Product has a reliable model identity",

            attributes:
                []

        };

    }


    /*
    =============================================
    ATTRIBUTE BASED
    =============================================
    */

    const importantAttributes =
        getImportantAttributes(product);


    if (
        importantAttributes.length > 0
    ) {

        return {

            strategy:
                "ATTRIBUTE_BASED",

            reason:
                `Product has important attributes: ${importantAttributes.join(", ")}`,

            attributes:
                importantAttributes

        };

    }


    /*
    =============================================
    GENERIC
    =============================================
    */

    return {

        strategy:
            "GENERIC",

        reason:
            "Product has no reliable model or important attributes",

        attributes:
            []

    };

}


module.exports = {

    determineProductStrategy,

    hasReliableModel,

    getImportantAttributes,

    hasModelLikeProductName

};