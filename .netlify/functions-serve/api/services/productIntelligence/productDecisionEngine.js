const {
    matchProduct
} = require("./productMatcher");


const {
    scoreMatch
} = require("./matchScorer");


const {
    validateIdentity
} = require("./identityValidator");


const {
    analyzeEvidence
} = require("./evidenceAnalyzer");


/*
=====================================================
PRODUCT DECISION ENGINE
=====================================================

This is the final decision-making layer.

Pipeline:

1. Attribute Matching
2. Match Score
3. Identity Validation
4. Evidence Analysis
5. Final Decision


Possible decisions:

SHOW_EXACT
SHOW_STRONG

DIFFERENT_VARIANT

VERIFY_MORE

REJECT_DIFFERENT_PRODUCT
REJECT_LOW_CONFIDENCE
*/


/*
=====================================================
MAKE DECISION
=====================================================
*/

function makeDecision(

    scoreResult,

    identityResult,

    evidenceResult

) {


    /*
    =================================================
    1. CRITICAL IDENTITY CONFLICT
    =================================================

    A brand or model mismatch means the candidate
    is likely a completely different product.

    Reject immediately.
    */

    if (
        identityResult
            .hasCriticalIdentityConflict
    ) {

        return {

            decision:
                "REJECT_DIFFERENT_PRODUCT",

            reason:
                "CRITICAL_IDENTITY_CONFLICT"

        };

    }


    /*
    =================================================
    2. ATTRIBUTE CONFLICT
    =================================================

    The product may belong to the same family,
    but an important purchasable attribute differs.

    Examples:

    800g vs 500g

    Chocolate vs Vanilla

    Pro vs Pro Max

    Different color
    */

    if (
        identityResult
            .hasAttributeConflict
    ) {

        return {

            decision:
                "DIFFERENT_VARIANT",

            reason:
                "IMPORTANT_ATTRIBUTE_CONFLICT",

            conflicts:
                identityResult
                    .attributeConflicts

        };

    }


    /*
    =================================================
    3. EXACT MATCH
    =================================================

    Requirements:

    - EXACT score
    - High information coverage
    - Strong positive verification
    - No conflicts
    */

    if (

        scoreResult.level ===
        "EXACT"

        &&

        evidenceResult.coverage >= 90

        &&

        evidenceResult.informationCoverage >= 90

    ) {

        return {

            decision:
                "SHOW_EXACT",

            reason:
                "HIGH_CONFIDENCE_EXACT_MATCH"

        };

    }


    /*
    =================================================
    4. STRONG MATCH
    =================================================

    Requirements:

    - Strong score
    - Enough visible information
    - Strong positive evidence
    */

    if (

        scoreResult.score >= 80

        &&

        evidenceResult.coverage >= 70

        &&

        evidenceResult.informationCoverage >= 70

    ) {

        return {

            decision:
                "SHOW_STRONG",

            reason:
                "STRONG_PRODUCT_EVIDENCE"

        };

    }


    /*
    =================================================
    5. PROMISING BUT INCOMPLETE
    =================================================

    IMPORTANT:

    Do not reject immediately when:

    - No critical identity conflict exists
    - No attribute conflict exists
    - Some positive evidence exists
    - Important information is missing

    Example:

    Requested:

    Boost Energy Nutrition Drink
    Chocolate 800g

    Candidate:

    Boost Nutrition Drink Chocolate

    Brand and flavour provide positive evidence,
    but weight information is missing.

    This candidate deserves deeper verification.
    */

    if (

        evidenceResult.verifiedPoints > 0

        &&

        evidenceResult.unknownPoints > 0

    ) {

        return {

            decision:
                "VERIFY_MORE",

            reason:
                "PROMISING_BUT_INCOMPLETE_EVIDENCE"

        };

    }


    /*
    =================================================
    6. INSUFFICIENT INFORMATION
    =================================================

    If most important product information is missing,
    attempt deeper verification before rejecting.

    This prevents potentially correct products from
    being removed too early.
    */

    if (

        evidenceResult.informationCoverage < 70

    ) {

        return {

            decision:
                "VERIFY_MORE",

            reason:
                "INSUFFICIENT_PRODUCT_INFORMATION"

        };

    }


    /*
    =================================================
    7. LOW CONFIDENCE
    =================================================

    At this point:

    - No strong positive evidence
    - No important missing-information case
    - No strong score

    Therefore reject.
    */

    return {

        decision:
            "REJECT_LOW_CONFIDENCE",

        reason:
            "LOW_MATCH_CONFIDENCE"

    };

}


/*
=====================================================
ANALYZE PRODUCT
=====================================================

Main function used by StockSense.

Input:

requestedProduct
candidateProduct

Output:

Complete Product Intelligence Result.
*/

function analyzeProduct(

    requestedProduct = {},

    candidateProduct = {}

) {


    /*
    =================================================
    STEP 1
    ATTRIBUTE MATCHING
    =================================================
    */

    const matchResult =

        matchProduct(

            requestedProduct,

            candidateProduct

        );


    /*
    =================================================
    STEP 2
    MATCH SCORING
    =================================================
    */

    const scoreResult =

        scoreMatch(

            matchResult

        );


    /*
    =================================================
    STEP 3
    IDENTITY VALIDATION
    =================================================
    */

    const identityResult =

        validateIdentity(

            matchResult

        );


    /*
    =================================================
    STEP 4
    EVIDENCE ANALYSIS
    =================================================
    */

    const evidenceResult =

        analyzeEvidence(

            matchResult

        );


    /*
    =================================================
    STEP 5
    FINAL DECISION
    =================================================
    */

    const decisionResult =

        makeDecision(

            scoreResult,

            identityResult,

            evidenceResult

        );


    /*
    =================================================
    COMPLETE RESULT
    =================================================
    */

    return {

        match:
            matchResult,

        score:
            scoreResult,

        identity:
            identityResult,

        evidence:
            evidenceResult,

        decision:
            decisionResult

    };

}


module.exports = {

    analyzeProduct,

    makeDecision

};