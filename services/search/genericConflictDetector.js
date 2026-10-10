const {
    normalizeProductText,
    normalizeWeight,
    normalizeStorage,
    normalizeRAM,
    extractAttributeSignals
} = require("../../utils/attributeNormalizer");


/*
=====================================================
GENERIC CONFLICT DETECTOR
=====================================================

Detects explicit contradictions between:

REQUESTED PRODUCT
        and
CANDIDATE PRODUCT

Important:

Missing information = UNKNOWN

Different explicit information = CONFLICT

Extra candidate information = allowed

Example:

t shirt
+
round neck t shirt

=> no conflict


neckless t shirt
+
round neck t shirt

=> conflict
=====================================================
*/


const POWER_TYPES = {

    electric: [
        "electric",
        "electrical"
    ],

    gas: [
        "gas",
        "lpg"
    ],

    battery: [
        "battery",
        "battery powered",
        "battery operated"
    ],

    manual: [
        "manual"
    ]

};


/*
=====================================================
GET REQUEST TEXT
=====================================================
*/

function getSearchText(
    product = {}
) {

    return [

        product.rawQuery,

        product.query,

        product.searchQuery,

        product.productName,

        product.title,

        product.variant,

        product.model

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
INTERSECTION
=====================================================
*/

function intersection(
    first = [],
    second = []
) {

    const secondSet =
        new Set(second);


    return first.filter(
        value =>
            secondSet.has(value)
    );

}


/*
=====================================================
COMPARE ATTRIBUTE GROUP
=====================================================
*/

function compareAttributeGroup(

    group,

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


    const requestedValues =
        requestedSignals[group] || [];


    const candidateValues =
        candidateSignals[group] || [];


    /*
    No explicit information on one side.

    This is NOT a conflict.
    */

    if (
        requestedValues.length === 0 ||
        candidateValues.length === 0
    ) {

        return null;

    }


    /*
    Same value exists on both sides.

    No conflict.
    */

    if (
        intersection(
            requestedValues,
            candidateValues
        ).length > 0
    ) {

        return null;

    }


    /*
    Both sides explicitly specify
    incompatible values.
    */

    return {

        group,

        requested:
            requestedValues,

        candidate:
            candidateValues,

        type:
            `${group.toUpperCase()}_MISMATCH`

    };

}


/*
=====================================================
POWER TYPE EXTRACTION
=====================================================
*/

function extractPowerTypes(
    text
) {

    const normalized =
        normalizeProductText(
            text
        );


    if (!normalized) {
        return [];
    }


    const tokens =
        new Set(
            normalized.split(/\s+/)
        );


    const result = [];


    for (
        const [
            type,
            terms
        ]
        of Object.entries(
            POWER_TYPES
        )
    ) {

        for (
            const term
            of terms
        ) {

            const normalizedTerm =
                normalizeProductText(
                    term
                );


            if (
                normalizedTerm.includes(" ")
            ) {

                if (
                    normalized.includes(
                        ` ${normalizedTerm} `
                    ) ||
                    normalized ===
                    normalizedTerm
                ) {

                    result.push(type);

                    break;

                }

            }
            else if (
                tokens.has(
                    normalizedTerm
                )
            ) {

                result.push(type);

                break;

            }

        }

    }


    return [
        ...new Set(result)
    ];

}


/*
=====================================================
COMPARE NUMERIC ATTRIBUTE
=====================================================
*/

function compareNumericAttribute(

    attribute,

    requestedValue,

    requestedFallbackText,

    candidateText,

    normalizer

) {

    const requested =
        normalizer(
            requestedValue
        ) ??
        normalizer(
            requestedFallbackText
        );


    const candidate =
        normalizer(
            candidateText
        );


    /*
    Missing information is not conflict.
    */

    if (
        requested === null ||
        candidate === null
    ) {

        return null;

    }


    if (
        requested === candidate
    ) {

        return null;

    }


    return {

        group:
            attribute,

        requested,

        candidate,

        type:
            `${attribute.toUpperCase()}_MISMATCH`

    };

}


/*
=====================================================
MAIN CONFLICT DETECTOR
=====================================================
*/

function detectGenericConflict(

    originalProduct = {},

    candidate = {}

) {

    const requestedText =
        getSearchText(
            originalProduct
        );


    const candidateText =
        candidate.title ||
        candidate.productName ||
        candidate.name ||
        "";


    if (
        !requestedText ||
        !candidateText
    ) {

        return {

            conflict:
                false,

            type:
                null,

            conflictType:
                null,

            conflicts:
                [],

            reason:
                "INSUFFICIENT_ATTRIBUTE_EVIDENCE"

        };

    }


    const conflicts = [];


    /*
    =================================================
    TEXT ATTRIBUTE GROUPS
    =================================================
    */

    for (
        const group
        of [

            "neckStyle",

            "fit",

            "sleeve",

            "gender",

            "ageGroup",

            "material",

            "color"

        ]
    ) {

        const conflict =
            compareAttributeGroup(
                group,
                requestedText,
                candidateText
            );


        if (conflict) {

            conflicts.push(
                conflict
            );

        }

    }


    /*
    =================================================
    POWER TYPE
    =================================================
    */

    const requestedPower =
        extractPowerTypes(
            requestedText
        );


    const candidatePower =
        extractPowerTypes(
            candidateText
        );


    if (
        requestedPower.length > 0 &&
        candidatePower.length > 0 &&
        intersection(
            requestedPower,
            candidatePower
        ).length === 0
    ) {

        conflicts.push({

            group:
                "powerType",

            requested:
                requestedPower,

            candidate:
                candidatePower,

            type:
                "POWER_TYPE_MISMATCH"

        });

    }


    /*
    =================================================
    WEIGHT
    =================================================
    */

    const weightConflict =
        compareNumericAttribute(

            "weight",

            originalProduct.weight,

            requestedText,

            candidateText,

            normalizeWeight

        );


    if (weightConflict) {

        conflicts.push(
            weightConflict
        );

    }


    /*
    =================================================
    STORAGE
    =================================================
    */

    const storageConflict =
        compareNumericAttribute(

            "storage",

            originalProduct.storage,

            requestedText,

            candidateText,

            normalizeStorage

        );


    if (storageConflict) {

        conflicts.push(
            storageConflict
        );

    }


    /*
    =================================================
    RAM
    =================================================
    */

    const ramConflict =
        compareNumericAttribute(

            "ram",

            originalProduct.ram,

            requestedText,

            candidateText,

            normalizeRAM

        );


    if (ramConflict) {

        conflicts.push(
            ramConflict
        );

    }


    const hasConflict =
        conflicts.length > 0;


    return {

        conflict:
            hasConflict,

        type:
            conflicts[0]?.type ||
            null,

        conflictType:
            conflicts[0]?.type ||
            null,

        conflicts,

        reason:
            hasConflict
                ? "EXPLICIT_ATTRIBUTE_CONFLICT"
                : "NO_EXPLICIT_ATTRIBUTE_CONFLICT"

    };

}


/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = {

    detectGenericConflict,

    extractPowerTypes

};