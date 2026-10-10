/*
=====================================================
PRODUCT IDENTITY VALIDATOR
=====================================================

The validator separates conflicts into two groups:

1. IDENTITY CONFLICTS
   → Candidate is likely a completely different product.

2. ATTRIBUTE CONFLICTS
   → Candidate belongs to the same product family,
     but has a different purchasable configuration.

Important:

MISMATCHED
    → Explicit conflict

UNKNOWN
    → Not enough information
      (NOT automatically a conflict)

NOT_REQUESTED
    → Ignored
*/


function validateIdentity(
    matchResult = {}
) {

    const identityConflicts = [];

    const attributeConflicts = [];


    /*
    =================================================
    IDENTITY CONFLICTS
    =================================================

    These fields represent the core identity
    of the product.
    */


    /*
    BRAND
    */

    if (
        matchResult.brand?.status ===
        "MISMATCHED"
    ) {

        identityConflicts.push({

            attribute:
                "brand",

            type:
                "BRAND_MISMATCH"

        });

    }


    /*
    MODEL
    */

    if (
        matchResult.model?.status ===
        "MISMATCHED"
    ) {

        identityConflicts.push({

            attribute:
                "model",

            type:
                "MODEL_MISMATCH"

        });

    }


    /*
    =================================================
    ATTRIBUTE CONFLICTS
    =================================================

    These usually mean:

    Same product family

    BUT

    Different purchasable variant/configuration.
    */


    /*
    WEIGHT
    */

    if (
        matchResult.weight?.status ===
        "MISMATCHED"
    ) {

        attributeConflicts.push({

            attribute:
                "weight",

            type:
                "WEIGHT_MISMATCH",

            requested:
                matchResult.weight.requested,

            detected:
                matchResult.weight.detectedWeights ||
                []

        });

    }


    /*
    VARIANT
    */

    if (
        matchResult.variant?.status ===
        "MISMATCHED"
    ) {

        attributeConflicts.push({

            attribute:
                "variant",

            type:
                "VARIANT_MISMATCH"

        });

    }


    /*
    FLAVOUR
    */

    if (
        matchResult.flavour?.status ===
        "MISMATCHED"
    ) {

        attributeConflicts.push({

            attribute:
                "flavour",

            type:
                "FLAVOUR_MISMATCH"

        });

    }


    /*
    COLOR
    */

    if (
        matchResult.color?.status ===
        "MISMATCHED"
    ) {

        attributeConflicts.push({

            attribute:
                "color",

            type:
                "COLOR_MISMATCH"

        });

    }


    /*
    =================================================
    FINAL FLAGS
    =================================================
    */

    const hasCriticalIdentityConflict =
        identityConflicts.length > 0;


    const hasAttributeConflict =
        attributeConflicts.length > 0;


    /*
    =================================================
    VALID
    =================================================

    Valid means:

    No explicit conflicts were found.

    UNKNOWN does NOT make the product invalid.
    */

    const valid =
        !hasCriticalIdentityConflict &&
        !hasAttributeConflict;


    /*
    =================================================
    RETURN
    =================================================
    */

    return {

        valid,

        identityConflicts,

        attributeConflicts,

        hasCriticalIdentityConflict,

        hasAttributeConflict

    };

}


module.exports = {

    validateIdentity

};