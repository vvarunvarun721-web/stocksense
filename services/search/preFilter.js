const {
    normalizeWeight,
    normalizeProductText
} = require("../../utils/attributeNormalizer");


/*
=====================================================
PRE-FILTER

Purpose:

Perform only conservative, cheap filtering before
the main candidate-matching architecture.

IMPORTANT:

- Brand mismatch is still rejected.
- Weight mismatch is still rejected.
- Formatting differences are normalized.
- Main rule scoring remains untouched.
- Local verification remains untouched.
=====================================================
*/


/*
=====================================================
NORMALIZE BRAND / TEXT
=====================================================
*/

function normalizeText(
    value
) {

    return normalizeProductText(
        String(
            value || ""
        )
    )
        .toLowerCase()
        .trim();

}


/*
=====================================================
NORMALIZE WEIGHT

Use the same canonical weight normalizer used by the
main matching system.

Examples:

800 g
800g
800 G

→ same canonical representation
=====================================================
*/

function normalizeCandidateWeight(
    value
) {

    return normalizeWeight(
        String(
            value || ""
        )
    );

}


/*
=====================================================
PRE-FILTER
=====================================================
*/

function preFilter(
    original,
    candidates
) {

    const safeOriginal =
        original || {};


    const originalBrand =
        normalizeText(
            safeOriginal.brand
        );


    const originalWeight =
        normalizeCandidateWeight(
            safeOriginal.weight
        );


    return (
        Array.isArray(
            candidates
        )
            ? candidates
            : []
    )
        .filter(
            product => {

                if (
                    !product ||
                    !product.title
                ) {

                    return false;

                }


                const title =
                    normalizeText(
                        product.title
                    );


                /*
                =============================================
                BRAND

                Keep the existing hard brand guard.

                =============================================
                */

                if (
                    originalBrand &&
                    !title.includes(
                        originalBrand
                    )
                ) {

                    return false;

                }


                /*
                =============================================
                WEIGHT

                Compare normalized weights rather than raw
                strings so marketplace formatting differences
                do not eliminate valid candidates.

                =============================================
                */

                if (
                    originalWeight
                ) {

                    const candidateWeight =
                        normalizeCandidateWeight(
                            product.title
                        );


                    if (
                        !candidateWeight ||
                        !candidateWeight.includes(
                            originalWeight
                        )
                    ) {

                        return false;

                    }

                }


                return true;

            }
        );

}


module.exports = {
    preFilter
};