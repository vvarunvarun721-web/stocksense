/*
=====================================================

ATTRIBUTE VERIFIER

Used for ATTRIBUTE_BASED products.

Extracts important attributes from candidate fields
and, when necessary, from the candidate title.

=====================================================
*/


function normalize(value) {

    if (
        value === null ||
        value === undefined
    ) {

        return null;

    }


    return String(value)
        .toLowerCase()
        .trim();

}


/*
=====================================================

NORMALIZE WEIGHT

Examples:

800 g
800g
0.8 kg
1kg

=====================================================
*/

function normalizeWeight(value) {

    if (!value) {

        return null;

    }


    const match =
        String(value)
            .toLowerCase()
            .match(
                /(\d+(?:\.\d+)?)\s*(kg|g)\b/
            );


    if (!match) {

        return null;

    }


    let amount =
        Number(match[1]);

    const unit =
        match[2];


    if (unit === "kg") {

        amount =
            amount * 1000;

    }


    return `${amount}g`;

}


/*
=====================================================

EXTRACT WEIGHT FROM TITLE

=====================================================
*/

function extractWeight(title) {

    if (!title) {

        return null;

    }


    const match =
        String(title)
            .match(
                /(\d+(?:\.\d+)?)\s*(kg|g)\b/i
            );


    if (!match) {

        return null;

    }


    return normalizeWeight(
        match[0]
    );

}


/*
=====================================================

EXTRACT FLAVOUR

Uses original flavour as the expected flavour.

This avoids randomly inventing flavours.

=====================================================
*/

function extractFlavour(
    title,
    expectedFlavour
) {

    if (
        !title ||
        !expectedFlavour
    ) {

        return null;

    }


    const normalizedTitle =
        String(title)
            .toLowerCase();


    const flavour =
        String(expectedFlavour)
            .toLowerCase()
            .trim();


    if (
        normalizedTitle.includes(
            flavour
        )
    ) {

        return expectedFlavour;

    }


    return null;

}


/*
=====================================================

GET CANDIDATE ATTRIBUTE

First checks direct field.

If missing, tries extracting from title.

=====================================================
*/

function getCandidateAttribute(
    attribute,
    candidate,
    originalProduct
) {

    /*
    =============================================
    DIRECT VALUE EXISTS
    =============================================
    */

    if (
        candidate[attribute] !== undefined &&
        candidate[attribute] !== null
    ) {

        return candidate[attribute];

    }


    /*
    =============================================
    EXTRACT WEIGHT FROM TITLE
    =============================================
    */

    if (attribute === "weight") {

        return extractWeight(
            candidate.title
        );

    }


    /*
    =============================================
    EXTRACT FLAVOUR FROM TITLE
    =============================================
    */

    if (attribute === "flavour") {

        return extractFlavour(
            candidate.title,
            originalProduct.flavour
        );

    }


    return null;

}


/*
=====================================================

COMPARE ATTRIBUTE

=====================================================
*/

function compareAttribute(
    attribute,
    originalValue,
    candidateValue
) {

    /*
    =============================================
    WEIGHT COMPARISON
    =============================================
    */

    if (attribute === "weight") {

        const original =
            normalizeWeight(
                originalValue
            );

        const candidate =
            normalizeWeight(
                candidateValue
            );


        if (
            !original ||
            !candidate
        ) {

            return "unknown";

        }


        return original === candidate
            ? "same"
            : "different";

    }


    /*
    =============================================
    DEFAULT COMPARISON
    =============================================
    */

    const original =
        normalize(originalValue);

    const candidate =
        normalize(candidateValue);


    if (
        !original ||
        !candidate
    ) {

        return "unknown";

    }


    return original === candidate
        ? "same"
        : "different";

}


/*
=====================================================

MAIN ATTRIBUTE VERIFIER

=====================================================
*/

function verifyAttributes(
    originalProduct,
    candidate,
    strategy
) {

    const attributes =
        strategy.attributes || [];


    const results = {};

    let sameCount = 0;

    let differentCount = 0;

    let unknownCount = 0;


    for (
        const attribute of attributes
    ) {

        const candidateValue =
            getCandidateAttribute(
                attribute,
                candidate,
                originalProduct
            );


        const comparison =
            compareAttribute(

                attribute,

                originalProduct[
                attribute
                ],

                candidateValue

            );


        results[
            attribute
        ] = comparison;


        /*
        =========================================

        DEBUG

        =========================================
        */

        console.log(
            `🧪 Attribute ${attribute}:`,
            {
                original:
                    originalProduct[attribute],

                candidate:
                    candidateValue,

                result:
                    comparison
            }
        );


        if (
            comparison === "same"
        ) {

            sameCount++;

        }

        else if (
            comparison === "different"
        ) {

            differentCount++;

        }

        else {

            unknownCount++;

        }

    }


    /*
    =============================================

    DIFFERENT ATTRIBUTE

    =============================================
    */

    if (
        differentCount > 0
    ) {

        return {

            relationship:
                "ATTRIBUTE_DIFFERENT",

            reason:
                `${differentCount} important attribute(s) differ`,

            attributes:
                results,

            sameCount,

            differentCount,

            unknownCount

        };

    }


    /*
    =============================================

    ALL ATTRIBUTES MATCH

    =============================================
    */

    if (
        attributes.length > 0 &&
        sameCount === attributes.length
    ) {

        return {

            relationship:
                "ATTRIBUTE_SAME",

            reason:
                "All important attributes match",

            attributes:
                results,

            sameCount,

            differentCount,

            unknownCount

        };

    }


    /*
    =============================================

    NOT ENOUGH INFORMATION

    =============================================
    */

    return {

        relationship:
            "ATTRIBUTE_UNKNOWN",

        reason:
            "Not enough attribute information",

        attributes:
            results,

        sameCount,

        differentCount,

        unknownCount

    };

}


module.exports = {

    verifyAttributes,

    compareAttribute

};