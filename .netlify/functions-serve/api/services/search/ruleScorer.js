const {
    normalizeWeight,
    normalizeProductText,
    getCanonicalTokens
} = require("../../utils/attributeNormalizer");


/*
=====================================================
STOP WORDS
=====================================================
*/

const STOP_WORDS = new Set([

    "for",
    "the",
    "and",
    "with",
    "of",
    "to",
    "a",
    "an",
    "in",
    "on",
    "by",
    "from",
    "this",
    "that",
    "is",
    "are",
    "was",
    "were",
    "has",
    "have",
    "new",
    "latest",
    "original",
    "online",
    "buy",
    "sale"

]);


/*
=====================================================
PRODUCT TERM ALIASES
=====================================================

These are deliberately narrow user-term corrections.

Examples:

airpodes  -> earbuds
airpode   -> earbuds
airbuds   -> earbuds
airbud    -> earbuds

We do NOT convert "airpods" into "earbuds" because
AirPods can refer to a specific Apple product family.
=====================================================
*/

const PRODUCT_TERM_ALIASES = new Map([

    [
        "airpodes",
        "earbuds"
    ],

    [
        "airpode",
        "earbuds"
    ],

    [
        "airbuds",
        "earbuds"
    ],

    [
        "airbud",
        "earbuds"
    ]

]);


/*
=====================================================
TOKEN FILTER
=====================================================
*/

function meaningfulTokens(
    text
) {

    return getCanonicalTokens(text)
        .filter(
            token =>
                token.length >= 2 &&
                !STOP_WORDS.has(token)
        );

}


/*
=====================================================
PRODUCT TOKENS
=====================================================

Product-name tokens receive the narrow alias
normalization defined above.

Brand and flavour logic continue using the normal
meaningfulTokens() function.
=====================================================
*/

function productMeaningfulTokens(
    text
) {

    return meaningfulTokens(
        text
    )
        .map(
            token =>
                PRODUCT_TERM_ALIASES.get(
                    token
                ) ||
                token
        );

}


/*
=====================================================
TOKEN MATCH SCORE
=====================================================
*/

function calculateTokenCoverage(
    originalTokens,
    candidateTokens
) {

    if (
        originalTokens.length === 0
    ) {

        return 0;

    }


    let matched = 0;


    for (
        const originalToken
        of originalTokens
    ) {

        /*
        Exact token match.
        */

        const exact =
            candidateTokens.some(
                candidateToken =>
                    candidateToken ===
                    originalToken
            );


        if (
            exact
        ) {

            matched++;

            continue;

        }


        /*
        Generic compound-token match.

        Example:

        original token:
        "chocolate"

        candidate token:
        "boostchocolate"

        This lets marketplace formatting errors
        still participate in scoring.
        */

        const compound =
            originalToken.length >= 4 &&
            candidateTokens.some(
                candidateToken =>

                    candidateToken.includes(
                        originalToken
                    )
            );


        if (
            compound
        ) {

            matched++;

        }

    }


    return (
        matched /
        originalTokens.length
    );

}


/*
=====================================================
TOKEN OVERLAP SCORE
=====================================================
*/

function calculateProductScore(
    originalProductName,
    candidateTitle
) {

    const originalTokens =
        productMeaningfulTokens(
            originalProductName
        );


    const candidateTokens =
        productMeaningfulTokens(
            candidateTitle
        );


    if (
        originalTokens.length === 0
    ) {

        return 0;

    }


    const coverage =
        calculateTokenCoverage(
            originalTokens,
            candidateTokens
        );


    return Math.round(
        coverage * 50
    );

}


/*
=====================================================
COMPACT BRAND NORMALIZATION
=====================================================

Examples:

oneplus  -> oneplus
OnePlus  -> oneplus
One Plus -> oneplus
one-plus -> oneplus

This is only used for brand comparison.
=====================================================
*/

function normalizeCompactBrand(
    brand
) {

    return normalizeProductText(
        brand
    )
        .replace(
            /[^a-z0-9]/g,
            ""
        );

}

function getBrandMatchStatus(
    brand,
    candidateTitle,
    candidateBrand = "",
    productName = ""
) {

    const requested =
        normalizeCompactBrand(
            brand
        );

    if (
        !requested ||
        requested.length < 3
    ) {
        return "NOT_REQUESTED";
    }

    /*
    =====================================================
    STRUCTURED BRAND
    =====================================================
    */

    const structured =
        normalizeCompactBrand(
            candidateBrand
        );

    if (
        structured
    ) {

        return structured === requested
            ? "MATCH"
            : "MISMATCH";

    }

    /*
    =====================================================
    TITLE BRAND MATCH
    =====================================================
    */

    const title =
        String(
            candidateTitle || ""
        )
            .trim();

    const candidateTokens =
        meaningfulTokens(
            title
        );

    if (
        candidateTokens.length === 0
    ) {
        return "UNKNOWN";
    }

    /*
    Requested brand appears in the leading
    product identity position.
    */

    const requestedTokens =
        meaningfulTokens(
            brand
        );

    const leadingWindow =
        candidateTokens.slice(
            0,
            Math.min(
                5,
                candidateTokens.length
            )
        );

    /*
    SINGLE-TOKEN BRAND
    */

    if (
        requestedTokens.length === 1
    ) {

        const requestedCompact =
            normalizeCompactBrand(
                requestedTokens[0]
            );

        if (
            leadingWindow.some(
                token =>
                    normalizeCompactBrand(
                        token
                    ) ===
                    requestedCompact
            )
        ) {

            return "MATCH";

        }

    }

    /*
    MULTI-TOKEN BRAND
    */

    else {

        const combinedRequested =
            requestedTokens
                .map(
                    normalizeCompactBrand
                )
                .join("");

        for (
            let start = 0;
            start <
            Math.min(
                2,
                leadingWindow.length
            );
            start++
        ) {

            const combined =
                leadingWindow
                    .slice(
                        start,
                        start +
                        requestedTokens.length
                    )
                    .map(
                        normalizeCompactBrand
                    )
                    .join("");

            if (
                combined ===
                combinedRequested
            ) {

                return "MATCH";

            }

        }

    }

    /*
    =====================================================
    UNKNOWN vs EXPLICIT MISMATCH
    =====================================================

    Example:

        Requested:
            Nitya Men Wrist Watch

        Candidate:
            Men Wrist Watch

        -> UNKNOWN

    But:

        Requested:
            Nitya Men Wrist Watch

        Candidate:
            Titan Wrist Watch for Men

        -> MISMATCH
    */

    const productTokens =
        productMeaningfulTokens(
            productName
        );

    const productOverlap =
        calculateTokenCoverage(
            productTokens,
            candidateTokens
        );

    const firstToken =
        candidateTokens[0] || "";

    const firstCompact =
        normalizeCompactBrand(
            firstToken
        );

    const firstLooksLikeProductIntent =
        productTokens.some(
            token =>
                normalizeCompactBrand(
                    token
                ) ===
                firstCompact
        );

    if (
        productOverlap >= 0.5 &&
        firstToken &&
        !firstLooksLikeProductIntent
    ) {

        const genericLeadingTokens =
            new Set([
                "men",
                "man",
                "mens",
                "women",
                "woman",
                "womens",
                "unisex",
                "kids",
                "kid",
                "boys",
                "boy",
                "girls",
                "girl",
                "new",
                "latest",
                "original",
                "premium",
                "best",
                "classic",
                "digital",
                "analog",
                "analogdigital",
                "printed",
                "solid"
            ]);

        if (
            !genericLeadingTokens.has(
                firstCompact
            )
        ) {

            return "MISMATCH";

        }

    }

    return "UNKNOWN";
}

/*
=====================================================
BRAND MATCH
=====================================================

IMPORTANT:

Brand matching must identify the PRODUCT BRAND.

It must NOT simply search for the brand word anywhere
inside the candidate title.

BAD:

Requested brand:
    Boost

Candidate:
    Healthoxide Energy Boost Sports Drink

"Boost" appears in the title,
but Boost is NOT the candidate brand.

Therefore:

    Brand Score = 0


GOOD:

Requested:
    Boost

Candidate:
    Boost Chocolate Nutrition Drink

Therefore:

    Brand Score = 40


For multi-word brands:

    One Plus
    OnePlus
    One-Plus

are treated as the same brand.

=====================================================
*/

function calculateBrandScore(
    brand,
    candidateTitle,
    candidateBrand = ""
) {

    const status =
        getBrandMatchStatus(
            brand,
            candidateTitle,
            candidateBrand,
            ""
        );

    return status === "MATCH"
        ? 40
        : 0;
}


/*
=====================================================
WEIGHT MATCH
=====================================================
*/

function calculateWeightScore(
    originalWeight,
    candidateTitle
) {

    const candidateWeight =
        normalizeWeight(
            candidateTitle
        );


    if (
        !originalWeight ||
        !candidateWeight
    ) {

        return 0;

    }


    if (
        originalWeight ===
        candidateWeight
    ) {

        return 10;

    }


    return 0;

}


/*
=====================================================
FLAVOUR MATCH
=====================================================
*/

function calculateFlavourScore(
    flavour,
    candidateTitle
) {

    if (
        !flavour
    ) {

        return 0;

    }


    const flavourTokens =
        meaningfulTokens(
            flavour
        );


    const candidateTokens =
        meaningfulTokens(
            candidateTitle
        );


    if (
        flavourTokens.length === 0
    ) {

        return 0;

    }


    /*
    Exact or compound token support.
    */

    const matched =
        flavourTokens.every(
            flavourToken =>

                candidateTokens.some(
                    candidateToken =>

                        candidateToken ===
                        flavourToken ||

                        (
                            flavourToken.length >= 4 &&
                            candidateToken.includes(
                                flavourToken
                            )
                        )
                )
        );


    return matched
        ? 10
        : 0;

}


/*
=====================================================
MAIN RULE SCORER
=====================================================
*/

function ruleScore(
    original,
    candidate
) {

    const safeOriginal =
        original || {};


    const safeCandidate =
        candidate || {};


    const title =
        String(
            safeCandidate.title ||
            ""
        )
            .trim();


    const brand =
        String(
            safeOriginal.brand ||
            ""
        )
            .trim();


    const productName =
        String(
            safeOriginal.productName ||
            ""
        )
            .trim();


    const candidateBrand =
    safeCandidate.brand ||
    safeCandidate.brandName ||
    safeCandidate.brandLabel ||
    safeCandidate.brand_name ||
    "";

const brandStatus =
    getBrandMatchStatus(
        brand,
        title,
        candidateBrand,
        productName
    );

const brandScore =
    brandStatus === "MATCH"
        ? 40
        : 0;

/*
=====================================================
EXPLICIT BRAND CONFLICT
=====================================================

Wrong brand is still a hard rejection.

But UNKNOWN is NOT rejected.

This is the critical change.
*/

if (
    brand &&
    brandStatus === "MISMATCH"
) {

    return 0;

}


    /*
    ---------------------------------------------
    PRODUCT
    ---------------------------------------------
    */

    const productScore =
        calculateProductScore(
            productName,
            title
        );


    /*
    ---------------------------------------------
    WEIGHT
    ---------------------------------------------
    */

    const originalWeight =
        normalizeWeight(
            safeOriginal.weight
        );


    const weightScore =
        calculateWeightScore(
            originalWeight,
            title
        );


    /*
    ---------------------------------------------
    FLAVOUR
    ---------------------------------------------
    */

    const flavourScore =
        calculateFlavourScore(
            safeOriginal.flavour,
            title
        );


    /*
    ---------------------------------------------
    TOTAL
    ---------------------------------------------
    */

    const total =
        brandScore +
        productScore +
        weightScore +
        flavourScore;


    return Math.min(
        total,
        100
    );

}


module.exports = {

    ruleScore,

    meaningfulTokens,

    calculateTokenCoverage,

    calculateBrandScore,

    getBrandMatchStatus,

    calculateProductScore,

    calculateWeightScore,

    calculateFlavourScore

};