function normalize(value) {

    if (!value) {
        return null;
    }

    return String(value)
        .toLowerCase()
        .trim();

}


function applyVariantPolicy(
    originalProduct,
    candidateIdentity,
    identityResult
) {

    const originalVariant =
        normalize(
            originalProduct.variant
        );

    const candidateVariant =
        normalize(
            candidateIdentity.variant
        );


    /*
    =========================================
    SAME PRODUCT

    Always allow.
    =========================================
    */

    if (
        identityResult.relationship === "SAME"
    ) {

        return {

            allowed: true,

            priority: "exact",

            reason:
                "Same product identity"

        };

    }


    /*
    =========================================
    DIFFERENT PRODUCT

    Always reject.
    =========================================
    */

    if (
        identityResult.relationship === "DIFFERENT"
    ) {

        return {

            allowed: false,

            priority: "reject",

            reason:
                "Different product identity"

        };

    }


    /*
    =========================================
    VARIANT LOGIC
    =========================================
    */

    if (
        identityResult.relationship === "VARIANT"
    ) {

        /*
        User requested a specific variant.

        Example:

        Original:
        Galaxy S24 Ultra

        Candidate:
        Galaxy S24

        Reject.
        */

        if (
            originalVariant &&
            originalVariant !== candidateVariant
        ) {

            return {

                allowed: false,

                priority: "reject",

                reason:
                    `Requested variant "${originalProduct.variant}" does not match candidate variant`

            };

        }


        /*
        User requested base model.

        Example:

        Original:
        Galaxy S24

        Candidate:
        Galaxy S24 Ultra

        Keep as alternative.
        */

        if (
            !originalVariant &&
            candidateVariant
        ) {

            return {

                allowed: true,

                priority: "alternative",

                reason:
                    `Candidate is "${candidateIdentity.variant}" variant of requested model`

            };

        }


        /*
        Variant relationship but unclear.
        */

        return {

            allowed: true,

            priority: "related",

            reason:
                "Related product variant"

        };

    }

    if (
    identityResult.relationship === "RELATED"
) {

    return {

        allowed: true,

        priority: "related",

        reason:
            "Different model but same brand and category; eligible as related alternative"

    };

}

   /*
=========================================
UNKNOWN

Identity is unclear.

Do NOT classify this as a related product.

AI/deep verification may investigate it,
but downstream logic must not treat it as an
accepted relationship automatically.
=========================================
*/

return {

    allowed: false,

    priority: "unknown",

    reason:
        "Identity relationship unclear; requires verification"

};

}


module.exports = {
    applyVariantPolicy
};