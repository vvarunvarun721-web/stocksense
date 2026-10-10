/*
=====================================================
STOCKSENSE REQUEST MODE
=====================================================

GENERIC
    Broad product discovery.

BRANDED
    Brand is known, but exact SKU/configuration
    is not specified.

SPECIFIC
    Exact product/configuration is identifiable.

VISUAL
    Image-derived product where exact SKU identity
    is not reliably known.
=====================================================
*/

const REQUEST_MODES = Object.freeze({

    GENERIC:
        "GENERIC",

    BRANDED:
        "BRANDED",

    SPECIFIC:
        "SPECIFIC",

    VISUAL:
        "VISUAL"

});


function hasValue(
    value
) {

    return (
        value !== null &&
        value !== undefined &&
        String(value).trim() !== ""
    );

}


function countConcreteAttributes(
    product = {}
) {

    const fields = [

        "weight",
        "flavour",
        "color"

    ];


    return fields.filter(

        field =>
            hasValue(
                product[field]
            )

    ).length;

}


function getRequestMode(
    product = {}
) {

    const safeProduct =
        product &&
            typeof product === "object"
            ? product
            : {};


    /*
    =================================================
    IMAGE INPUT
    =================================================

    Image input is VISUAL unless the image resolver
    found strong SKU-level identity.
    */

    if (
        safeProduct.inputType ===
        "image"
    ) {

        const hardSpecificFields = [

            "model",
            "variant",
            "storage",
            "ram"

        ];


        if (
            hardSpecificFields.some(

                field =>
                    hasValue(
                        safeProduct[field]
                    )

            )
        ) {

            return REQUEST_MODES.SPECIFIC;

        }


        if (
            countConcreteAttributes(
                safeProduct
            ) >= 2
        ) {

            return REQUEST_MODES.SPECIFIC;

        }


        return REQUEST_MODES.VISUAL;

    }


    /*
    =================================================
    URL INPUT
    =================================================
    */

    if (
        safeProduct.inputType ===
        "url"
    ) {

        return REQUEST_MODES.SPECIFIC;

    }


    /*
    =================================================
    HARD SPECIFIC ATTRIBUTES
    =================================================
    */

    const hardSpecificFields = [

        "model",
        "storage",
        "ram",
        "variant"

    ];


    if (
        hardSpecificFields.some(

            field =>
                hasValue(
                    safeProduct[field]
                )

        )
    ) {

        return REQUEST_MODES.SPECIFIC;

    }


    /*
    =================================================
    MULTI-ATTRIBUTE SPECIFICITY
    =================================================
    */

    if (
        countConcreteAttributes(
            safeProduct
        ) >= 2
    ) {

        return REQUEST_MODES.SPECIFIC;

    }


    /*
    =================================================
    BRANDED
    =================================================
    */

    if (
        hasValue(
            safeProduct.brand
        )
    ) {

        return REQUEST_MODES.BRANDED;

    }


    return REQUEST_MODES.GENERIC;

}


function isGenericRequest(
    product = {}
) {

    return (
        getRequestMode(product) ===
        REQUEST_MODES.GENERIC
    );

}


function isBrandedRequest(
    product = {}
) {

    return (
        getRequestMode(product) ===
        REQUEST_MODES.BRANDED
    );

}


function isSpecificRequest(
    product = {}
) {

    return (
        getRequestMode(product) ===
        REQUEST_MODES.SPECIFIC
    );

}


function isVisualRequest(
    product = {}
) {

    return (
        getRequestMode(product) ===
        REQUEST_MODES.VISUAL
    );

}

/*
=====================================================
MARKETPLACE BRAND NORMALIZATION
=====================================================

Examples:

Metronaut by Flipkart
    -> Metronaut

METRONAUT BY FLIPKART
    -> Metronaut

Metronaut
    -> Metronaut

XALVIREX
    -> XALVIREX
=====================================================
*/

function normalizeMarketplaceBrand(
    brand,
    sourcePlatform = ""
) {

    if (
        brand === null ||
        brand === undefined
    ) {
        return "";
    }


    let value =
        String(brand)
            .trim();


    if (!value) {
        return "";
    }


    /*
    Normalize whitespace.
    */

    value =
        value
            .replace(
                /\s+/g,
                " "
            )
            .trim();


    /*
    -------------------------------------------------
    REMOVE "BY MARKETPLACE" LABELS
    -------------------------------------------------

    Examples:

        Metronaut by Flipkart
        Metronaut By Amazon

    */

    value =
        value.replace(
            /\s+by\s+(flipkart|amazon|myntra|ajio|meesho|reliance|tatacliq|croma|vijay\s*sales)\s*$/i,
            ""
        )
            .trim();


    /*
    -------------------------------------------------
    SOURCE PLATFORM SUFFIX
    -------------------------------------------------

    Handles cases where the marketplace name is
    supplied separately.
    */

    const platform =
        String(
            sourcePlatform || ""
        )
            .trim();


    if (
        platform
    ) {

        const escapedPlatform =
            platform
                .replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                );


        value =
            value.replace(
                new RegExp(
                    `\\s+by\\s+${escapedPlatform}\\s*$`,
                    "i"
                ),
                ""
            )
                .trim();

    }


    return value;

}
module.exports = {

    REQUEST_MODES,

    hasValue,

    countConcreteAttributes,

    getRequestMode,

    isGenericRequest,

    isBrandedRequest,

    isSpecificRequest,

    isVisualRequest

};