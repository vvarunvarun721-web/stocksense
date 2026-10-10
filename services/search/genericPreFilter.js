/*
=====================================================
GENERIC PRODUCT PRE-FILTER
=====================================================

Purpose:

Perform a SAFE deterministic pre-filter before AI.

IMPORTANT:

This module must NOT decide whether a candidate is
the final product.

It should only reject candidates when there is strong
evidence that they are unrelated.

Shared canonicalization is used so that:

shirts  -> shirt
phones  -> phone
laptops -> laptop

and other structural variations do not create false
rejections.

=====================================================
*/

const {

    getCanonicalTokens,
    extractAttributeSignals

} = require("../../utils/attributeNormalizer");


/*
=====================================================
STOP WORDS
=====================================================
*/

const STOP_WORDS = new Set([

    "for",

    "with",

    "and",

    "the",

    "a",

    "an",

    "of",

    "in",

    "to",

    "product",

    "item",

    "new",

    "best",

    "men",

    "women",

    "boys",

    "girls",

    "pack",

    "piece",

    "pcs",

    "set"

]);


/*
=====================================================
GET PRODUCT TEXT
=====================================================
*/

function getProductText(
    product = {}
) {

    return [

        product.productName,

        product.title,

        product.name

    ]
        .filter(
            value =>
                value !== null &&
                value !== undefined &&
                String(value).trim()
        )
        .join(" ");

}


/*
=====================================================
GET MEANINGFUL CANONICAL TOKENS
=====================================================
*/

function getMeaningfulTokens(
    product = {}
) {

    const text =
        getProductText(
            product
        );


    if (!text) {

        return [];

    }


    return getCanonicalTokens(
        text
    )
        .filter(
            token =>
                token.length >= 2
        )
        .filter(
            token =>
                !STOP_WORDS.has(token)
        );

}


/*
=====================================================
TOKEN OVERLAP
=====================================================
*/

function hasMeaningfulOverlap(

    requestedTokens = [],

    candidateTokens = []

) {

    if (
        requestedTokens.length === 0 ||
        candidateTokens.length === 0
    ) {

        return false;

    }


    const candidateSet =
        new Set(
            candidateTokens
        );


    return requestedTokens.some(
        token =>
            candidateSet.has(
                token
            )
    );

}


/*
=====================================================
ATTRIBUTE OVERLAP
=====================================================

Sometimes a generic query is identified primarily by
attributes.

Example:

red shirt

Candidate:

red oversized shirt

The core product token may be incomplete, but the
attribute itself is useful evidence.

=====================================================
*/

function hasAttributeOverlap(

    requestedText,

    candidateText

) {

    const requestedSignals =
        extractAttributeSignals(
            requestedText
        );


    const candidateSignals =
        extractAttributeSignals(
            candidateText
        );


    for (
        const [
            group,
            requestedValues
        ]
        of Object.entries(
            requestedSignals
        )
    ) {

        const candidateValues =
            candidateSignals[group] || [];


        if (
            requestedValues.some(
                value =>
                    candidateValues.includes(
                        value
                    )
            )
        ) {

            return true;

        }

    }


    return false;

}


/*
=====================================================
PRE-FILTER GENERIC
=====================================================

Decision rules:

1. If there is canonical product overlap:
   → VERIFY_AI

2. If there is matching attribute evidence:
   → VERIFY_AI

3. If candidate has a strong rule score:
   → VERIFY_AI

4. Otherwise:
   → REJECT

The pre-filter is deliberately conservative.

It must NOT reject merely because the wording differs.

=====================================================
*/

function preFilterGeneric(

    originalProduct = {},

    candidate = {}

) {

    const requestedText =
        getProductText(
            originalProduct
        );


    const candidateText =
        getProductText(
            candidate
        );


    if (
        !requestedText ||
        !candidateText
    ) {

        return {

            action:
                "VERIFY_AI",

            reason:
                "INSUFFICIENT_TEXT_FOR_DETERMINISTIC_FILTER"

        };

    }


    const requestedTokens =
        getMeaningfulTokens(
            originalProduct
        );


    const candidateTokens =
        getMeaningfulTokens(
            candidate
        );


    /*
    =================================================
    CANONICAL PRODUCT OVERLAP
    =================================================
    */

    if (
        hasMeaningfulOverlap(
            requestedTokens,
            candidateTokens
        )
    ) {

        return {

            action:
                "VERIFY_AI",

            reason:
                "CANONICAL_PRODUCT_OVERLAP",

            requestedTokens,

            candidateTokens

        };

    }


    /*
    =================================================
    ATTRIBUTE OVERLAP
    =================================================
    */

    if (
        hasAttributeOverlap(
            requestedText,
            candidateText
        )
    ) {

        return {

            action:
                "VERIFY_AI",

            reason:
                "ATTRIBUTE_OVERLAP",

            requestedTokens,

            candidateTokens

        };

    }


    /*
    =================================================
    STRONG RULE SCORE
    =================================================

    A strong score means another deterministic
    component has already found substantial evidence.

    Don't throw the candidate away just because the
    wording differs.
    =================================================
    */

    const ruleScore =
        Number(
            candidate.ruleScore
        );


    if (
        Number.isFinite(ruleScore) &&
        ruleScore >= 50
    ) {

        return {

            action:
                "VERIFY_AI",

            reason:
                "STRONG_RULE_SCORE",

            ruleScore,

            requestedTokens,

            candidateTokens

        };

    }


    /*
    =================================================
    NO USEFUL EVIDENCE
    =================================================
    */

    return {

        action:
            "REJECT",

        reason:
            "CANDIDATE_HAS_NO_MEANINGFUL_PRODUCT_OVERLAP",

        ruleScore:
            Number.isFinite(ruleScore)
                ? ruleScore
                : 0,

        requestedTokens,

        candidateTokens

    };

}


/*
=====================================================
EXPORT
=====================================================
*/

module.exports = {

    preFilterGeneric,

    getMeaningfulTokens,

    hasMeaningfulOverlap,

    hasAttributeOverlap

};