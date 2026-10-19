/*
=====================================================
PRODUCT NORMALIZATION
=====================================================

Structured product normalization.

Text normalization is owned by:

utils/attributeNormalizer.js
=====================================================
*/

const {

    normalizeProductText,

    normalizeWeight,

    normalizeStorage,

    normalizeRAM

} = require("../../utils/attributeNormalizer");


/*
=====================================================
NORMALIZE VALUE
=====================================================
*/

function normalizeValue(
    value
) {

    return normalizeProductText(
        value
    );

}


/*
=====================================================
NORMALIZE PRODUCT
=====================================================
*/

function normalizeProduct(
    product = {}
) {

    return {

        brand:
            normalizeValue(
                product.brand
            ),

        productName:
            normalizeValue(
                product.productName
            ),

        model:
            normalizeValue(
                product.model
            ),

        variant:
            normalizeValue(
                product.variant
            ),

        weight:
            normalizeWeight(
                product.weight
            ),

        flavour:
            normalizeValue(
                product.flavour
            ),

        color:
            normalizeValue(
                product.color
            ),

        storage:
            normalizeStorage(
                product.storage
            ),

        ram:
            normalizeRAM(
                product.ram
            )

    };

}


/*
=====================================================
BACKWARD COMPATIBILITY
=====================================================

Some existing modules may import:

normalizeText
normalizeWeight

Keep these exports so we don't unnecessarily
break existing code.
=====================================================
*/

module.exports = {

    normalizeText:
        normalizeProductText,

    normalizeWeight,

    normalizeStorage,

    normalizeRAM,

    normalizeProduct

};