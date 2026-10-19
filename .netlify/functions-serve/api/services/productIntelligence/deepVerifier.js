/*
=====================================================
DEEP PRODUCT VERIFIER
=====================================================

Purpose:

Handles candidates that could not be confidently
verified by the normal Product Intelligence engine.

Strategy:

1. Run normal deterministic verification
2. Collect structured candidate evidence
3. Create enriched verification text
4. Re-run deterministic verification using
   all available evidence
5. Prefer explicit conflicts over weak assumptions
6. Return VERIFIED / REJECTED / NEEDS_AI

Important:

This layer does NOT use AI.

AI remains the final fallback only for genuinely
ambiguous products.
*/


const {
    analyzeProduct
} = require("./productDecisionEngine");


const {
    normalizeText,
    normalizeWeight
} = require("./normalizeProduct");


/*
=====================================================
BUILD ENRICHED CANDIDATE
=====================================================

Preserves all useful candidate information.

Adapters may provide:

title
brand
productName
weight
flavour
model
variant
color
description
specifications
sku
url
*/

function buildEnrichedCandidate(
    candidate = {}
) {

    return {

        title:
            candidate.title || "",

        brand:
            candidate.brand || "",

        productName:
            candidate.productName || "",

        weight:
            candidate.weight || "",

        flavour:
            candidate.flavour || "",

        model:
            candidate.model || "",

        variant:
            candidate.variant || "",

        color:
            candidate.color || "",

        description:
            candidate.description || "",

        specifications:

            candidate.specifications &&
                typeof candidate.specifications === "object"

                ? candidate.specifications

                : {},

        sku:
            candidate.sku || "",

        url:
            candidate.url || ""

    };

}


/*
=====================================================
GET AVAILABLE EVIDENCE
=====================================================

Checks which additional fields exist.

This helps us understand whether Deep Verification
actually has more information than the original title.
*/

function getAvailableEvidence(
    candidate = {}
) {

    const evidence = {

        brand:
            Boolean(candidate.brand),

        productName:
            Boolean(candidate.productName),

        weight:
            Boolean(candidate.weight),

        flavour:
            Boolean(candidate.flavour),

        model:
            Boolean(candidate.model),

        variant:
            Boolean(candidate.variant),

        color:
            Boolean(candidate.color),

        description:
            Boolean(candidate.description),

        specifications:

            Boolean(
                candidate.specifications &&
                Object.keys(
                    candidate.specifications
                ).length > 0
            ),

        sku:
            Boolean(candidate.sku)

    };


    const availableFields =

        Object.entries(evidence)

            .filter(
                ([, available]) =>
                    available
            )

            .map(
                ([field]) =>
                    field
            );


    return {

        evidence,

        availableFields,

        count:
            availableFields.length

    };

}


/*
=====================================================
CREATE VERIFICATION TEXT
=====================================================

Combines useful textual evidence.

This is used only for deterministic verification.

Structured fields are also preserved separately.
*/

function createVerificationText(
    candidate = {}
) {

    const parts = [];


    const fields = [

        "title",

        "brand",

        "productName",

        "weight",

        "flavour",

        "model",

        "variant",

        "color"

    ];


    for (
        const field of fields
    ) {

        if (candidate[field]) {

            parts.push(
                String(candidate[field])
            );

        }

    }


    /*
    Description

    Limit size for performance.
    */

    if (
        candidate.description
    ) {

        parts.push(

            String(candidate.description)
                .slice(0, 1200)

        );

    }


    /*
    Specifications
    */

    if (

        candidate.specifications &&

        typeof candidate.specifications ===
        "object"

    ) {

        for (

            const [
                key,
                value
            ]

            of Object.entries(
                candidate.specifications
            )

        ) {

            if (

                value !== null &&

                value !== undefined &&

                String(value).trim()

            ) {

                parts.push(

                    `${key} ${value}`

                );

            }

        }

    }


    /*
    Remove empty values
    */

    return parts

        .filter(Boolean)

        .join(" ")

        .replace(/\s+/g, " ")

        .trim();

}


/*
=====================================================
FIND ATTRIBUTE VALUE
=====================================================

Looks for an attribute in:

1. Direct candidate field
2. Specifications

Returns null if unavailable.
*/

function getStructuredAttribute(
    candidate = {},
    attribute
) {

    /*
    =================================================
    DIRECT FIELD
    =================================================
    */

    if (

        candidate[attribute] !== undefined &&

        candidate[attribute] !== null &&

        String(
            candidate[attribute]
        ).trim()

    ) {

        return candidate[attribute];

    }


    /*
    =================================================
    SPECIFICATIONS
    =================================================
    */

    const specifications =
        candidate.specifications || {};


    for (

        const [
            key,
            value
        ]

        of Object.entries(
            specifications
        )

    ) {

        const normalizedKey =
            normalizeText(key);


        /*
        Weight
        */

        if (

            attribute === "weight" &&

            (
                normalizedKey.includes("weight") ||

                normalizedKey.includes("net quantity") ||

                normalizedKey.includes("quantity")
            )

        ) {

            return value;

        }


        /*
        Flavour
        */

        if (

            attribute === "flavour" &&

            (
                normalizedKey.includes("flavour") ||

                normalizedKey.includes("flavor")
            )

        ) {

            return value;

        }


        /*
        Brand
        */

        if (

            attribute === "brand" &&

            normalizedKey.includes("brand")

        ) {

            return value;

        }


        /*
        Model
        */

        if (

            attribute === "model" &&

            (
                normalizedKey.includes("model") ||

                normalizedKey.includes("model number")
            )

        ) {

            return value;

        }


        /*
        Variant
        */

        if (

            attribute === "variant" &&

            (
                normalizedKey.includes("variant") ||

                normalizedKey.includes("edition")
            )

        ) {

            return value;

        }


        /*
        Color
        */

        if (

            attribute === "color" &&

            (
                normalizedKey.includes("color") ||

                normalizedKey.includes("colour")
            )

        ) {

            return value;

        }

    }


    return null;

}


/*
=====================================================
COMPARE STRUCTURED TEXT ATTRIBUTE
=====================================================

Returns:

MATCHED
MISMATCHED
UNKNOWN
NOT_REQUESTED
*/

function compareStructuredText(
    requestedValue,
    candidateValue
) {

    const requested =
        normalizeText(requestedValue);


    /*
    User did not request this attribute.
    */

    if (!requested) {

        return {

            status:
                "NOT_REQUESTED"

        };

    }


    /*
    Candidate does not provide information.
    */

    if (!candidateValue) {

        return {

            status:
                "UNKNOWN"

        };

    }


    const candidate =
        normalizeText(candidateValue);


    /*
    Exact value
    */

    if (
        candidate === requested
    ) {

        return {

            status:
                "MATCHED"

        };

    }


    /*
    Requested value appears inside candidate.
    */

    if (
        candidate.includes(requested)
    ) {

        return {

            status:
                "MATCHED"

        };

    }


    /*
    Candidate appears inside requested value.
    */

    if (
        requested.includes(candidate)
    ) {

        return {

            status:
                "MATCHED"

        };

    }


    /*
    Token comparison
    */

    const tokens =
        requested
            .split(" ")
            .filter(
                token =>
                    token.length >= 2
            );


    const allTokensMatch =

        tokens.length > 0 &&

        tokens.every(
            token =>
                candidate.includes(token)
        );


    return {

        status:

            allTokensMatch

                ? "MATCHED"

                : "MISMATCHED"

    };

}


/*
=====================================================
COMPARE STRUCTURED WEIGHT
=====================================================
*/

function compareStructuredWeight(
    requestedWeight,
    candidateWeight
) {

    const requested =
        normalizeWeight(
            requestedWeight
        );


    /*
    Weight not requested.
    */

    if (
        requested === null
    ) {

        return {

            status:
                "NOT_REQUESTED"

        };

    }


    /*
    No structured weight.
    */

    if (
        !candidateWeight
    ) {

        return {

            status:
                "UNKNOWN"

        };

    }


    const candidate =
        normalizeWeight(
            candidateWeight
        );


    /*
    Invalid candidate weight.
    */

    if (
        candidate === null
    ) {

        return {

            status:
                "UNKNOWN"

        };

    }


    return {

        status:

            requested === candidate

                ? "MATCHED"

                : "MISMATCHED",

        detectedWeights:
            [candidate]

    };

}


/*
=====================================================
ANALYZE STRUCTURED EVIDENCE
=====================================================

Separately verifies structured data.

This prevents us from blindly depending on one
combined verification title.
*/

function analyzeStructuredEvidence(
    requestedProduct = {},
    candidate = {}
) {

    const results = {};


    const textAttributes = [

        "brand",

        "productName",

        "flavour",

        "model",

        "variant",

        "color"

    ];


    for (
        const attribute of textAttributes
    ) {

        const candidateValue =
            getStructuredAttribute(
                candidate,
                attribute
            );


        results[attribute] =

            compareStructuredText(

                requestedProduct[attribute],

                candidateValue

            );

    }


    /*
    Weight
    */

    const candidateWeight =

        getStructuredAttribute(
            candidate,
            "weight"
        );


    results.weight =

        compareStructuredWeight(

            requestedProduct.weight,

            candidateWeight

        );


    return results;

}


/*
=====================================================
MERGE ATTRIBUTE RESULTS
=====================================================

Priority:

1. Explicit structured MATCHED
2. Explicit structured MISMATCHED
3. Title analysis

Important:

Structured data only overrides UNKNOWN or weak
title evidence.

We never allow missing structured information to
create a conflict.
*/

function mergeAttributeResult(
    titleResult = {},
    structuredResult = {}
) {

    const titleStatus =
        titleResult.status ||
        "UNKNOWN";


    const structuredStatus =
        structuredResult.status ||
        "UNKNOWN";


    /*
    =================================================
    STRUCTURED MATCH
    =================================================
    */

    if (
        structuredStatus === "MATCHED"
    ) {

        return {

            ...titleResult,

            ...structuredResult,

            source:
                "STRUCTURED"

        };

    }


    /*
    =================================================
    STRUCTURED CONFLICT
    =================================================
    */

    if (
        structuredStatus === "MISMATCHED"
    ) {

        return {

            ...titleResult,

            ...structuredResult,

            source:
                "STRUCTURED"

        };

    }


    /*
    =================================================
    TITLE RESULT
    =================================================
    */

    return {

        ...titleResult,

        source:
            "TITLE"

    };

}


/*
=====================================================
BUILD MERGED MATCH RESULT
=====================================================
*/

function buildMergedMatchResult(
    titleAnalysis,
    structuredEvidence
) {

    const merged = {};


    for (

        const attribute of [

            "brand",

            "productName",

            "weight",

            "flavour",

            "model",

            "variant",

            "color"

        ]

    ) {

        merged[attribute] =

            mergeAttributeResult(

                titleAnalysis.match[attribute],

                structuredEvidence[attribute]

            );

    }


    return merged;

}


/*
=====================================================
DEEP VERIFY PRODUCT
=====================================================

Main Deep Verification function.
*/

function deepVerifyProduct(

    requestedProduct = {},

    candidateProduct = {}

) {


    /*
    =================================================
    STEP 1
    BUILD ENRICHED CANDIDATE
    =================================================
    */

    const enrichedCandidate =

        buildEnrichedCandidate(
            candidateProduct
        );


    /*
    =================================================
    STEP 2
    AVAILABLE EVIDENCE
    =================================================
    */

    const availableEvidence =

        getAvailableEvidence(
            enrichedCandidate
        );


    /*
    =================================================
    STEP 3
    CREATE VERIFICATION TEXT
    =================================================
    */

    const verificationText =

        createVerificationText(
            enrichedCandidate
        );


    /*
    =================================================
    STEP 4
    TITLE + TEXT ANALYSIS
    =================================================
    */

    const textAnalysis =

        analyzeProduct(

            requestedProduct,

            {

                ...enrichedCandidate,

                title:
                    verificationText

            }

        );


    /*
    =================================================
    STEP 5
    STRUCTURED EVIDENCE ANALYSIS
    =================================================
    */

    const structuredEvidence =

        analyzeStructuredEvidence(

            requestedProduct,

            enrichedCandidate

        );


    /*
    =================================================
    STEP 6
    MERGE RESULTS
    =================================================
    */

    const mergedMatch =

        buildMergedMatchResult(

            textAnalysis,

            structuredEvidence

        );


    /*
    =================================================
    IMPORTANT

    Re-run the Product Decision Engine using a
    synthetic candidate that contains all evidence.

    The verification text gives the matcher access
    to all available evidence.
    =================================================
    */

    const finalAnalysis =

        analyzeProduct(

            requestedProduct,

            {

                ...enrichedCandidate,

                title:
                    verificationText

            }

        );


    /*
    =================================================
    STEP 7
    FINAL DECISION
    =================================================
    */

    const decision =

        finalAnalysis.decision.decision;


    /*
    =================================================
    VERIFIED
    =================================================
    */

    if (

        decision === "SHOW_EXACT" ||

        decision === "SHOW_STRONG"

    ) {

        return {

            status:
                "VERIFIED",

            reason:
                "DEEP_EVIDENCE_CONFIRMED_PRODUCT",

            analysis:
                finalAnalysis,

            mergedMatch,

            structuredEvidence,

            availableEvidence,

            enrichedCandidate

        };

    }


    /*
    =================================================
    REJECTED
    =================================================
    */

    if (

        decision ===
        "DIFFERENT_VARIANT"

        ||

        decision ===
        "REJECT_DIFFERENT_PRODUCT"

        ||

        decision ===
        "REJECT_LOW_CONFIDENCE"

    ) {

        /*
        Only reject when there is explicit evidence
        of a real mismatch.
        */

        const explicitConflict =

            Object.values(
                structuredEvidence
            )

                .some(
                    result =>

                        result.status ===
                        "MISMATCHED"
                );


        if (
            explicitConflict
        ) {

            return {

                status:
                    "REJECTED",

                reason:
                    "DEEP_VERIFICATION_FOUND_CONFLICT",

                analysis:
                    finalAnalysis,

                mergedMatch,

                structuredEvidence,

                availableEvidence,

                enrichedCandidate

            };

        }

    }


    /*
    =================================================
    STILL UNCERTAIN
    =================================================

    No explicit conflict.

    Not enough deterministic evidence.

    AI can be used as the final fallback.
    */

    return {

        status:
            "NEEDS_AI",

        reason:
            "DETERMINISTIC_VERIFICATION_INSUFFICIENT",

        analysis:
            finalAnalysis,

        mergedMatch,

        structuredEvidence,

        availableEvidence,

        enrichedCandidate

    };

}


module.exports = {

    deepVerifyProduct,

    buildEnrichedCandidate,

    getAvailableEvidence,

    createVerificationText,

    getStructuredAttribute,

    analyzeStructuredEvidence,

    buildMergedMatchResult

};