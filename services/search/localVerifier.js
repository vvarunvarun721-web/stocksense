const {
    extractCandidateIdentity
} = require("./candidateIdentityExtractor");

const {
    analyzeIdentity
} = require("./productIdentity");

const {
    applyVariantPolicy
} = require("./variantPolicy");

const {
    verifyAttributes
} = require("./attributeVerifier");

const {
    determineProductStrategy
} = require("./productStrategy");

const {
    preFilterGeneric
} = require("./genericPreFilter");

const {
    detectGenericConflict
} = require("./genericConflictDetector");

// ============================================================
// ACCESSORY SAFETY CHECK
// ============================================================

function isAccessoryCandidate(
    candidate = {}
) {

    const title =
        String(
            candidate.title ||
            candidate.name ||
            candidate.productName ||
            ""
        )
            .toLowerCase()
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    const accessoryPatterns = [

        // Watch accessories
        "watch strap",
        "watch band",
        "strap band",
        "wristband",
        "silicone strap",
        "silicone band",
        "replacement strap",
        "replacement band",
        "watch case",
        "watch cover",
        "watch protector",
        "watch screen protector",
        "screen guard",
        "screen protector",
        "tempered glass",

        // Cases / covers
        "protective case",
        "bumper case",
        "back case",
        "phone case",
        "mobile case",
        "cover case",
        "protective cover",

        // Charging accessories
        "charging cable",
        "charger cable",
        "charging dock",
        "charging stand",
        "charging cradle",

        // General accessories
        "replacement cable",
        "replacement cover",
        "replacement glass",
        "replacement screen",
        "adapter",
        "cable only",
        "strap only",
        "band only"

    ];

    return accessoryPatterns.some(
        pattern =>
            title.includes(pattern)
    );

}

/*
=====================================================

PRODUCT INTELLIGENCE

Central intelligence engine for detailed product
matching and decision-making.

=====================================================
*/

const {
    analyzeProduct
} = require("../productIntelligence/productDecisionEngine");


/*
=====================================================

LOCAL VERIFIER

This decides how a candidate should be verified
BEFORE sending it to AI.

Strategies:

MODEL_BASED
    → identity analysis + variant policy

ATTRIBUTE_BASED
    → existing attribute verification
    → Product Intelligence analysis

GENERIC
    → detect important conflicts
    → generic pre-filter
    → reject clearly unrelated candidates
    → otherwise send to AI

=====================================================
*/


function verifyLocally(
    originalProduct,
    candidate
) {
        /*
    =============================================
    ACCESSORY SAFETY GATE
    =============================================

    An accessory must NEVER become an exact
    product simply because its title contains
    the requested product/model.

    Example:

    Samsung Galaxy Watch8
          vs
    YODI Strap Band for Samsung Galaxy Watch8

    The title contains the exact model, but the
    actual product is an accessory.

    Therefore reject before identity matching.
    =============================================
    */

    if (
        isAccessoryCandidate(
            candidate
        )
    ) {

        console.log(
            "❌ ACCESSORY SAFETY REJECT:",
            candidate.title
        );

        return {

            action:
                "REJECT",

            strategy:
                "ACCESSORY_SAFETY",

            reason:
                "Candidate is an accessory rather than the requested primary product"

        };

    }

    /*
    =============================================

    STEP 1

    DETERMINE PRODUCT STRATEGY

    =============================================
    */

    const strategy =
        determineProductStrategy(
            originalProduct
        );


    console.log(
        "🧠 Verification Strategy:",
        strategy.strategy
    );

    console.log(
        "📝 Strategy Reason:",
        strategy.reason
    );


    /*
    =============================================

    MODEL BASED

    Example:

    Galaxy S24
    Galaxy S23

    =============================================
    */

    if (
        strategy.strategy ===
        "MODEL_BASED"
    ) {

        const candidateIdentity =
            extractCandidateIdentity(
                originalProduct,
                candidate
            );


        const identity =
            analyzeIdentity(
                originalProduct,
                candidateIdentity
            );


        const variantPolicy =
            applyVariantPolicy(
                originalProduct,
                candidateIdentity,
                identity
            );


        /*
        =========================================

        REJECT

        Different product identity.

        =========================================
        */

        if (
            !variantPolicy.allowed
        ) {

            return {

                action: "REJECT",

                strategy:
                    strategy.strategy,

                reason:
                    variantPolicy.reason,

                identity,

                candidateIdentity,

                variantPolicy

            };

        }


        /*
        =========================================

        SAME PRODUCT

        Safe enough to skip AI.

        =========================================
        */

        if (
            identity.relationship ===
            "SAME"
        ) {

            return {

                action: "SKIP_AI",

                matchType: "exact",

                confidence: 95,

                strategy:
                    strategy.strategy,

                reason:
                    "Local identity confirmed same product",

                identity,

                candidateIdentity,

                variantPolicy

            };

        }


        /*
        =========================================

        RELATED / VARIANT / UNKNOWN

        Needs AI verification.

        =========================================
        */

        return {

            action: "VERIFY_AI",

            strategy:
                strategy.strategy,

            reason:
    identity.relationship === "RELATED"
        ? "Related product requires AI verification"
        : "Model identity requires AI verification",
            identity,

            candidateIdentity,

            variantPolicy

        };

    }


    /*
    =============================================

    ATTRIBUTE BASED

    Example:

    Boost 800g
    Laptop 16GB RAM

    =============================================
    */

    if (
        strategy.strategy ===
        "ATTRIBUTE_BASED"
    ) {

        /*
        =========================================

        STEP 1

        EXISTING ATTRIBUTE VERIFICATION

        This remains as a safety layer because
        strategy.attributes defines which
        attributes are important for this product.

        =========================================
        */

        const attributeResult =
            verifyAttributes(
                originalProduct,
                candidate,
                strategy
            );


        /*
        =========================================

        STEP 2

        PRODUCT INTELLIGENCE

        Performs deeper product-level analysis.

        =========================================
        */

        const intelligenceResult =
            analyzeProduct(
                originalProduct,
                candidate
            );


        console.log(
            "🧠 Product Intelligence Decision:",
            intelligenceResult.decision?.decision
        );

        console.log(
            "🧠 Product Intelligence Result:",
            intelligenceResult
        );


        /*
        =========================================

        STEP 3

        EXISTING IMPORTANT ATTRIBUTE CONFLICT

        If an important strategy attribute is
        explicitly different, reject immediately.

        =========================================
        */

        if (
            attributeResult.relationship ===
            "ATTRIBUTE_DIFFERENT"
        ) {

            return {

                action: "REJECT",

                strategy:
                    strategy.strategy,

                reason:
                    attributeResult.reason,

                attributeResult,

                intelligenceResult

            };

        }


        /*
        =========================================

        STEP 4

        PRODUCT INTELLIGENCE REJECT

        Product Intelligence detected a strong
        identity conflict.

        =========================================
        */

        if (
            intelligenceResult.decision?.decision ===
            "REJECT"
        ) {

            return {

                action: "REJECT",

                strategy:
                    strategy.strategy,

                reason:
                    intelligenceResult.decision.reason ||
                    "Product Intelligence rejected candidate",

                attributeResult,

                intelligenceResult

            };

        }


        /*
        =========================================

        STEP 5

        EXACT PRODUCT

        Both the strategy safety layer and
        Product Intelligence provide enough
        confidence to skip AI.

        =========================================
        */

        if (
            intelligenceResult.decision?.decision ===
            "SHOW_EXACT"
        ) {

            return {

                action: "SKIP_AI",

                matchType: "exact",

                confidence:
                    intelligenceResult.score?.score ||
                    100,

                strategy:
                    strategy.strategy,

                reason:
                    intelligenceResult.decision.reason ||
                    "Product Intelligence confirmed exact product",

                attributeResult,

                intelligenceResult

            };

        }


        /*
        =========================================

        STEP 6

        STRONG MATCH

        Keep the candidate, but allow AI to make
        the final verification.

        =========================================
        */

        if (
            intelligenceResult.decision?.decision ===
            "SHOW_STRONG"
        ) {

            return {

                action: "VERIFY_AI",

                strategy:
                    strategy.strategy,

                reason:
                    intelligenceResult.decision.reason ||
                    "Strong product match requires final verification",

                attributeResult,

                intelligenceResult

            };

        }


        /*
        =========================================

        STEP 7

        VERIFY MORE

        There is insufficient evidence for a
        safe local decision.

        =========================================
        */

        if (
            intelligenceResult.decision?.decision ===
            "VERIFY_MORE"
        ) {

            return {

                action: "VERIFY_AI",

                strategy:
                    strategy.strategy,

                reason:
                    intelligenceResult.decision.reason ||
                    "Product requires additional verification",

                attributeResult,

                intelligenceResult

            };

        }


        /*
        =========================================

        FALLBACK

        Preserve the existing ATTRIBUTE_BASED
        behavior if the Product Intelligence
        engine returns an unexpected decision.

        =========================================
        */

        const totalAttributes =
            strategy.attributes?.length || 0;


        /*
        =========================================

        ALL IMPORTANT ATTRIBUTES UNKNOWN

        There is insufficient evidence to treat
        this candidate as the requested product.

        =========================================
        */

        if (
            totalAttributes > 0 &&
            attributeResult.unknownCount ===
            totalAttributes
        ) {

            return {

                action: "REJECT",

                strategy:
                    strategy.strategy,

                reason:
                    "All important product attributes are unknown",

                attributeResult,

                intelligenceResult

            };

        }


        /*
        =========================================

        PARTIAL ATTRIBUTE INFORMATION

        Let AI perform final verification.

        =========================================
        */

        return {

            action: "VERIFY_AI",

            strategy:
                strategy.strategy,

            reason:
                "Important attributes could not be fully verified",

            attributeResult,

            intelligenceResult

        };

    }


    /*
    =============================================

    GENERIC PRODUCTS

    Example:

    Electric Stove
    Men's T Shirt

    STEP 1:

    Detect direct semantic conflicts.

    Examples:

    Electric → Gas
    Men → Women
    Adult → Kids

    If a strong conflict exists,
    reject immediately.

    =============================================
    */

    const conflictResult =
        detectGenericConflict(
            originalProduct,
            candidate
        );


    /*
    =========================================

    GENERIC CONFLICT FOUND

    Do not send clearly conflicting products
    to the AI.

    =========================================
    */

    if (
        conflictResult.conflict
    ) {

        return {

            action: "REJECT",

            strategy:
                "GENERIC",

            reason:
                conflictResult.reason,

            conflictResult

        };

    }


    /*
    =============================================

    GENERIC PRE-FILTER

    No direct conflict was found.

    Now check whether the candidate has enough
    meaningful relationship with the original
    product.

    =============================================
    */

    const genericResult =
        preFilterGeneric(
            originalProduct,
            candidate
        );


    /*
    =========================================

    GENERIC PRE-FILTER REJECT

    Do not waste an AI request.

    =========================================
    */

    if (
        genericResult.action ===
        "REJECT"
    ) {

        return {

            action: "REJECT",

            strategy:
                "GENERIC",

            reason:
                genericResult.reason,

            conflictResult,

            genericResult

        };

    }


    /*
    =========================================

    GENERIC PRE-FILTER PASSED

    Candidate may be related.

    AI makes the final decision.

    =========================================
    */

    return {

        action: "VERIFY_AI",

        strategy:
            "GENERIC",

        reason:
            genericResult.reason,

        conflictResult,

        genericResult

    };

}


module.exports = {

    verifyLocally

};