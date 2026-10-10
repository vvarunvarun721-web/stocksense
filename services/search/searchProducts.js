async function searchProducts(userInput) {

    /*
    =====================================================
    1. NORMALIZE USER PRODUCT
    =====================================================
    */

    const originalProduct =
        await normalizeProduct(
            userInput
        );


    /*
    =====================================================
    2. SEARCH ALL PLATFORMS
    =====================================================
    */

    const rawProducts =
        await searchAllPlatforms(
            userInput
        );


    /*
    =====================================================
    3. COLLECT STRONG CANDIDATES
    =====================================================
    */

    const candidates =
        collectCandidates(
            originalProduct,
            rawProducts
        );


    /*
    =====================================================
    4. IDENTITY + VARIANT + AI FILTERING
    =====================================================
    */

    const verifiedProducts =
        await filterResults(
            originalProduct,
            candidates
        );


    /*
    =====================================================
    5. SMART VARIANT GROUPING
    =====================================================

    IMPORTANT:

    This happens AFTER verification.

    We don't allow unverified marketplace products
    to influence variant comparison.
    =====================================================
    */

    const variantResult =
        groupVariantProducts(
            verifiedProducts,
            originalProduct
        );


    /*
    =====================================================
    6. RETURN SAME PRODUCT ARRAY
    =====================================================

    We deliberately preserve the existing API contract.

    Each product now contains:

        product.variantGroup

    while the returned value is still an array.
    =====================================================
    */

    return variantResult.products;

}


module.exports = {
    searchProducts
};