/*
=====================================================

SMART VERIFICATION POLICY

Decides whether a candidate needs AI verification.

Pipeline before this point:

Rule Validation
        ↓
Identity Extraction
        ↓
Identity Analysis
        ↓
Variant Policy

This policy decides:

SKIP_AI
    → Local system is sufficiently reliable.

VERIFY_AI
    → AI should verify the candidate.

REJECT
    → Candidate should not continue.

=====================================================
*/

function applyVerificationPolicy(
    identity,
    variantPolicy
) {

    /*
    =============================================
    SAFETY FIRST

    If variant policy already rejected the product,
    never allow it further.
    =============================================
    */

    if (
        !variantPolicy ||
        !variantPolicy.allowed
    ) {

        return {
            action: "REJECT",
            reason:
                variantPolicy?.reason ||
                "Candidate rejected by variant policy"
        };

    }


    /*
    =============================================
    SAME PRODUCT

    Local identity system confirmed:

    SAME model
    +
    Variant policy confirmed exact priority

    No AI request needed.
    =============================================
    */

    if (
        identity.relationship === "SAME" &&
        variantPolicy.priority === "exact"
    ) {

        return {
            action: "SKIP_AI",
            matchType: "exact",
            confidence: 95,
            reason:
                "Local identity confirmed same product"
        };

    }


    /*
    =============================================
    VARIANT

    Candidate is an allowed alternative.

    Example:

    Requested:
        Galaxy S24

    Candidate:
        Galaxy S24 Ultra

    AI should verify whether the candidate is
    genuinely related and suitable.
    =============================================
    */

    if (
        identity.relationship === "VARIANT" &&
        variantPolicy.priority === "alternative"
    ) {

        return {
            action: "VERIFY_AI",
            reason:
                "Allowed product variant requires AI verification"
        };

    }


    /*
    =============================================
    UNKNOWN

    Local system does not have enough reliable
    identity information.

    AI can make the semantic decision.

    Example:

    Electric Stove
    vs
    Induction Cooktop
    =============================================
    */

    if (
        identity.relationship === "UNKNOWN"
    ) {

        return {
            action: "VERIFY_AI",
            reason:
                "Local identity is uncertain"
        };

    }


    /*
    =============================================
    DEFAULT

    Anything unexpected goes to AI rather than
    incorrectly rejecting a potentially valid product.
    =============================================
    */

    return {
        action: "VERIFY_AI",
        reason:
            "Requires additional verification"
    };

}


module.exports = {
    applyVerificationPolicy
};