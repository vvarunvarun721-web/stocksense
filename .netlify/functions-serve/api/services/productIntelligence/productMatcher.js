
const {
    normalizeText,
    normalizeWeight,
    normalizeProduct
} = require("./normalizeProduct");


/*
=====================================================
PRODUCT MATCHER
=====================================================

Purpose:

Compare the requested product against a marketplace
candidate and produce attribute-level evidence.

IMPORTANT MATCHING RULE:

1. Use candidate structured fields when available.
2. Fall back to candidate title when structured
   information is unavailable.
3. Missing information = UNKNOWN.
4. Explicit conflicting information = MISMATCHED.
5. This module DOES NOT make the final decision.

Final decision is handled by:

productDecisionEngine.js


Supported attributes:

brand
productName
weight
flavour
model
variant
color
*/


/*
=====================================================
TOKEN UTILITIES
=====================================================
*/

function getTokens(value) {

    const normalized =
        normalizeText(value);

    if (!normalized) {

        return [];

    }

    return normalized
        .split(" ")
        .filter(
            token =>
                token.length >= 2
        );

}


/*
=====================================================
CONTAINS ALL TOKENS
=====================================================

Returns true only when every important requested
token exists inside the candidate text.
*/

function containsAllTokens(
    title,
    requestedValue
) {

    const titleTokens =
        getTokens(title);

    const requestedTokens =
        getTokens(requestedValue);


    /*
    =============================================
    NOT REQUESTED
    =============================================
    */

    if (
        requestedTokens.length === 0
    ) {

        return true;

    }


    /*
    =============================================
    NO USABLE CANDIDATE INFORMATION
    =============================================
    */

    if (
        titleTokens.length === 0
    ) {

        return false;

    }


    return requestedTokens.every(
        token =>
            titleTokens.includes(token)
    );

}


/*
=====================================================
TEXT ATTRIBUTE MATCHER
=====================================================

Important intelligence rule:

Missing evidence must NOT automatically become
a mismatch.

Examples:

Requested flavour:
Chocolate

Candidate:
Boost Nutrition Drink

→ UNKNOWN


Requested flavour:
Chocolate

Candidate:
Boost Nutrition Drink Vanilla

→ MISMATCHED


Requested product:
Energy Nutrition Drink

Candidate:
Boost Nutrition Drink

→ UNKNOWN


Requested product:
Energy Nutrition Drink

Candidate:
Horlicks Health Drink

→ UNKNOWN

The matcher alone does not assume that unrelated
text automatically means a conflict.

Explicit structured information, however, can be
treated as a real conflict.
*/

function matchTextAttribute(
    candidateText,
    requestedValue
) {

    const requestedTokens =
        getTokens(requestedValue);


    /*
    =============================================
    NOT REQUESTED
    =============================================
    */

    if (
        requestedTokens.length === 0
    ) {

        return {

            status:
                "NOT_REQUESTED"

        };

    }


    const candidateTokens =
        getTokens(candidateText);


    /*
    =============================================
    NO INFORMATION
    =============================================
    */

    if (
        candidateTokens.length === 0
    ) {

        return {

            status:
                "UNKNOWN"

        };

    }


    /*
    =============================================
    FULL MATCH
    =============================================
    */

    const matchedTokens =
        requestedTokens.filter(
            token =>
                candidateTokens.includes(token)
        );


    if (
        matchedTokens.length ===
        requestedTokens.length
    ) {

        return {

            status:
                "MATCHED",

            matchedTokens,

            missingTokens: []

        };

    }


    /*
    =============================================
    PARTIAL MATCH
    =============================================

    Some requested words exist.

    This is promising evidence, but not enough
    to prove the full requested attribute.

    Therefore:

    UNKNOWN

    NOT MISMATCHED.
    */

    if (
        matchedTokens.length > 0
    ) {

        const missingTokens =
            requestedTokens.filter(
                token =>
                    !candidateTokens.includes(
                        token
                    )
            );


        return {

            status:
                "UNKNOWN",

            matchedTokens,

            missingTokens

        };

    }


    /*
    =============================================
    NO POSITIVE EVIDENCE
    =============================================

    The candidate may simply not expose this
    attribute in its title.

    Therefore:

    UNKNOWN
    */

    return {

        status:
            "UNKNOWN",

        matchedTokens: [],

        missingTokens:
            requestedTokens

    };

}


/*
=====================================================
STRUCTURED TEXT ATTRIBUTE MATCHER
=====================================================

Used when the marketplace explicitly provides an
attribute such as:

brand
model
color
variant
productName

This is different from title matching.

If BOTH requested and candidate values are known:

MATCHED
or
MISMATCHED

If candidate value is missing:

UNKNOWN

This allows us to reject obvious clothing brand
conflicts immediately.
*/

function matchStructuredTextAttribute(
    candidateValue,
    requestedValue
) {

    const requested =
        normalizeText(
            requestedValue
        );


    /*
    =============================================
    NOT REQUESTED
    =============================================
    */

    if (!requested) {

        return {

            status:
                "NOT_REQUESTED"

        };

    }


    const candidate =
        normalizeText(
            candidateValue
        );


    /*
    =============================================
    CANDIDATE INFORMATION MISSING
    =============================================
    */

    if (!candidate) {

        return {

            status:
                "UNKNOWN"

        };

    }


    /*
    =============================================
    EXACT MATCH
    =============================================
    */

    if (
        candidate === requested
    ) {

        return {

            status:
                "MATCHED",

            matchedValue:
                candidate

        };

    }


    /*
    =============================================
    REQUESTED VALUE INSIDE CANDIDATE
    =============================================

    Example:

    Requested:
    "cahoot"

    Candidate:
    "cahoot originals"

    This is acceptable as positive evidence.
    */

    if (
        candidate.includes(requested)
    ) {

        return {

            status:
                "MATCHED",

            matchedValue:
                candidate

        };

    }


    /*
    =============================================
    CANDIDATE VALUE INSIDE REQUESTED
    =============================================

    Example:

    Requested:
    "cahoot men"

    Candidate:
    "cahoot"

    */

    if (
        requested.includes(candidate)
    ) {

        return {

            status:
                "MATCHED",

            matchedValue:
                candidate

        };

    }


    /*
    =============================================
    TOKEN MATCH
    =============================================
    */

    const requestedTokens =
        getTokens(requested);

    const candidateTokens =
        getTokens(candidate);


    const allRequestedTokensMatch =
        requestedTokens.length > 0 &&
        requestedTokens.every(
            token =>
                candidateTokens.includes(
                    token
                )
        );


    if (
        allRequestedTokensMatch
    ) {

        return {

            status:
                "MATCHED",

            matchedValue:
                candidate

        };

    }


    /*
    =============================================
    EXPLICIT STRUCTURED CONFLICT
    =============================================

    Both values are known and they do not match.

    This is the important fast path.
    */

    return {

        status:
            "MISMATCHED",

        requestedValue:
            requested,

        candidateValue:
            candidate

    };

}


/*
=====================================================
WEIGHT MATCHER
=====================================================

Weight is different from normal text.

Requested:
800g

Candidate:
500g

→ MISMATCHED


Requested:
800g

Candidate:
800g

→ MATCHED


Requested:
800g

Candidate:
No weight

→ UNKNOWN
*/

function matchesWeight(
    title,
    requestedWeight,
    candidateWeight = null
) {

    const normalizedRequestedWeight =
        normalizeWeight(
            requestedWeight
        );


    /*
    =============================================
    NOT REQUESTED
    =============================================
    */

    if (
        normalizedRequestedWeight === null
    ) {

        return {

            status:
                "NOT_REQUESTED"

        };

    }


    /*
    =============================================
    STRUCTURED CANDIDATE WEIGHT
    =============================================

    Prefer structured marketplace data when
    available.
    */

    if (
        candidateWeight !== null &&
        candidateWeight !== undefined &&
        String(candidateWeight).trim()
    ) {

        const normalizedCandidateWeight =
            normalizeWeight(
                candidateWeight
            );


        if (
            normalizedCandidateWeight !== null
        ) {

            return {

                status:

                    normalizedRequestedWeight ===
                    normalizedCandidateWeight

                        ? "MATCHED"
                        : "MISMATCHED",

                detectedWeights: [
                    normalizedCandidateWeight
                ]

            };

        }

    }


    /*
    =============================================
    FALLBACK TO TITLE
    =============================================
    */

    const rawTitle =
        String(title ?? "")
            .toLowerCase();


    const matches = [

        ...rawTitle.matchAll(

            /(\d+(?:\.\d+)?)\s*(kg|kgs|g|gram|grams)\b/g

        )

    ];


    /*
    =============================================
    NO WEIGHT INFORMATION
    =============================================
    */

    if (
        matches.length === 0
    ) {

        return {

            status:
                "UNKNOWN"

        };

    }


    const detectedWeights =
        matches
            .map(
                match =>
                    normalizeWeight(
                        match[0]
                    )
            )
            .filter(
                weight =>
                    weight !== null
            );


    /*
    =============================================
    REQUESTED WEIGHT FOUND
    =============================================
    */

    if (
        detectedWeights.includes(
            normalizedRequestedWeight
        )
    ) {

        return {

            status:
                "MATCHED",

            detectedWeights

        };

    }


    /*
    =============================================
    EXPLICIT DIFFERENT WEIGHT
    =============================================
    */

    return {

        status:
            "MISMATCHED",

        detectedWeights

    };

}


/*
=====================================================
GET CANDIDATE ATTRIBUTE
=====================================================

Returns the structured candidate value when it
exists.

Also checks specifications for marketplace
adapters that place attributes there.

Priority:

1. Direct candidate field
2. specifications
3. null
*/

function getCandidateAttribute(
    candidateProduct = {},
    attribute
) {

    /*
    =============================================
    DIRECT FIELD
    =============================================
    */

    if (
        candidateProduct[attribute] !== undefined &&
        candidateProduct[attribute] !== null &&
        String(
            candidateProduct[attribute]
        ).trim()
    ) {

        return candidateProduct[attribute];

    }


    /*
    =============================================
    SPECIFICATIONS
    =============================================
    */

    const specifications =
        candidateProduct.specifications;


    if (
        !specifications ||
        typeof specifications !== "object"
    ) {

        return null;

    }


    for (
        const [
            key,
            value
        ]
        of Object.entries(
            specifications
        )
    ) {

        if (
            value === null ||
            value === undefined ||
            !String(value).trim()
        ) {

            continue;

        }


        const normalizedKey =
            normalizeText(key);


        /*
        =========================================
        BRAND
        =========================================
        */

        if (
            attribute === "brand" &&
            normalizedKey.includes("brand")
        ) {

            return value;

        }


        /*
        =========================================
        PRODUCT NAME
        =========================================
        */

        if (
            attribute === "productName" &&
            (
                normalizedKey.includes("product name") ||
                normalizedKey === "name"
            )
        ) {

            return value;

        }


        /*
        =========================================
        MODEL
        =========================================
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
        =========================================
        VARIANT
        =========================================
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
        =========================================
        COLOR
        =========================================
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


        /*
        =========================================
        FLAVOUR
        =========================================
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
        =========================================
        WEIGHT
        =========================================
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

    }


    return null;

}


/*
=====================================================
ATTRIBUTE MATCHER
=====================================================

Uses structured candidate information first.

If structured information does not exist,
falls back to title matching.

This keeps the old behavior for adapters that
only provide titles.
*/

function matchAttribute(
    title,
    requestedValue,
    candidateValue = null
) {

    /*
    =============================================
    STRUCTURED VALUE AVAILABLE
    =============================================
    */

    if (
        candidateValue !== null &&
        candidateValue !== undefined &&
        String(candidateValue).trim()
    ) {

        return {

            ...matchStructuredTextAttribute(
                candidateValue,
                requestedValue
            ),

            source:
                "STRUCTURED"

        };

    }


    /*
    =============================================
    FALLBACK TO TITLE
    =============================================
    */

    return {

        ...matchTextAttribute(
            title,
            requestedValue
        ),

        source:
            "TITLE"

    };

}


/*
=====================================================
MATCH PRODUCT
=====================================================

Returns detailed attribute-level evidence.

This function does NOT decide whether the candidate
should be accepted or rejected.

That responsibility belongs to:

productDecisionEngine.js
*/

function matchProduct(

    originalProduct = {},

    candidateProduct = {}

) {


    /*
    =============================================
    STEP 1
    NORMALIZE REQUESTED PRODUCT
    =============================================
    */

    const requested =

        normalizeProduct(
            originalProduct
        );


    /*
    =============================================
    STEP 2
    CANDIDATE TITLE
    =============================================
    */

    const title =

        candidateProduct.title || "";


    /*
    =============================================
    STEP 3
    CANDIDATE STRUCTURED ATTRIBUTES
    =============================================

    IMPORTANT:

    We preserve structured marketplace data.

    This fixes the previous issue where:

        candidate.brand
        candidate.color
        candidate.model
        candidate.variant

    were completely ignored.
    */

    const candidateBrand =
        getCandidateAttribute(
            candidateProduct,
            "brand"
        );


    const candidateProductName =
        getCandidateAttribute(
            candidateProduct,
            "productName"
        );


    const candidateWeight =
        getCandidateAttribute(
            candidateProduct,
            "weight"
        );


    const candidateFlavour =
        getCandidateAttribute(
            candidateProduct,
            "flavour"
        );


    const candidateModel =
        getCandidateAttribute(
            candidateProduct,
            "model"
        );


    const candidateVariant =
        getCandidateAttribute(
            candidateProduct,
            "variant"
        );


    const candidateColor =
        getCandidateAttribute(
            candidateProduct,
            "color"
        );


    /*
    =============================================
    STEP 4
    MATCH BRAND
    =============================================
    */

    const brandResult =

        matchAttribute(

            title,

            requested.brand,

            candidateBrand

        );


    /*
    =============================================
    STEP 5
    MATCH PRODUCT NAME
    =============================================
    */

    const productNameResult =

        matchAttribute(

            title,

            requested.productName,

            candidateProductName

        );


    /*
    =============================================
    STEP 6
    MATCH WEIGHT
    =============================================
    */

    const weightResult =

        matchesWeight(

            title,

            originalProduct.weight,

            candidateWeight

        );


    /*
    =============================================
    STEP 7
    MATCH FLAVOUR
    =============================================
    */

    const flavourResult =

        matchAttribute(

            title,

            requested.flavour,

            candidateFlavour

        );


    /*
    =============================================
    STEP 8
    MATCH MODEL
    =============================================
    */

    const modelResult =

        matchAttribute(

            title,

            requested.model,

            candidateModel

        );


    /*
    =============================================
    STEP 9
    MATCH VARIANT
    =============================================
    */

    const variantResult =

        matchAttribute(

            title,

            requested.variant,

            candidateVariant

        );


    /*
    =============================================
    STEP 10
    MATCH COLOR
    =============================================
    */

    const colorResult =

        matchAttribute(

            title,

            requested.color,

            candidateColor

        );


    /*
    =============================================
    STEP 11
    RETURN COMPLETE MATCH EVIDENCE
    =============================================
    */

    return {

        brand: {

            requested:
                requested.brand,

            candidate:
                candidateBrand,

            ...brandResult

        },


        productName: {

            requested:
                requested.productName,

            candidate:
                candidateProductName,

            ...productNameResult

        },


        weight: {

            requested:
                requested.weight,

            candidate:
                candidateWeight,

            ...weightResult

        },


        flavour: {

            requested:
                requested.flavour,

            candidate:
                candidateFlavour,

            ...flavourResult

        },


        model: {

            requested:
                requested.model,

            candidate:
                candidateModel,

            ...modelResult

        },


        variant: {

            requested:
                requested.variant,

            candidate:
                candidateVariant,

            ...variantResult

        },


        color: {

            requested:
                requested.color,

            candidate:
                candidateColor,

            ...colorResult

        }

    };

}


/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = {

    getTokens,

    containsAllTokens,

    matchTextAttribute,

    matchStructuredTextAttribute,

    matchesWeight,

    getCandidateAttribute,

    matchAttribute,

    matchProduct

};