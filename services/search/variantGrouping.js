/*
=====================================================
STOCKSENSE VARIANT GROUPING ENGINE
=====================================================

Purpose:

Take already-verified marketplace products and add
structured variant information without changing the
existing search result shape.

Example:

Amazon
"Egg Boiler 7 Eggs 350W"
₹270

Flipkart
"Automatic Egg Boiler - 7 Egg - 350 Watt"
₹298

Both become:

variantGroupId:
    egg-boiler|capacity-7-eggs|power-350w

This module is intentionally deterministic.

It does NOT:
- change product matching
- change candidate scores
- reject products
- change platform search
- call AI
- change SearchManager

It only enriches verified products.
=====================================================
*/


/*
=====================================================
TEXT NORMALIZATION
=====================================================
*/

function normalizeText(value) {

    return String(
        value ||
        ""
    )
        .toLowerCase()
        .replace(
            /&/g,
            " and "
        )
        .replace(
            /[^a-z0-9.]+/g,
            " "
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim();

}


/*
=====================================================
NUMBER NORMALIZATION
=====================================================
*/

function normalizeNumber(
    value
) {

    const number =
        Number(
            value
        );

    if (
        !Number.isFinite(
            number
        )
    ) {
        return null;
    }

    return Number.isInteger(
        number
    )
        ? String(number)
        : String(number)
            .replace(
                /\.0+$/,
                ""
            );

}


/*
=====================================================
EXTRACT WEIGHT
=====================================================
*/

function extractWeight(
    title
) {

    const text =
        normalizeText(
            title
        );

    const match =
        text.match(
            /(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|g|gm|gram|grams)\b/i
        );

    if (
        !match
    ) {
        return null;
    }

    const value =
        Number(
            match[1]
        );

    if (
        !Number.isFinite(
            value
        )
    ) {
        return null;
    }

    const unit =
        match[2]
            .toLowerCase();

    let grams;

    if (
        unit === "kg" ||
        unit === "kgs" ||
        unit === "kilogram" ||
        unit === "kilograms"
    ) {

        grams =
            value * 1000;

    }
    else {

        grams =
            value;

    }

    return {
        raw:
            `${normalizeNumber(value)} ${unit}`,
        value:
            grams,
        normalized:
            `${normalizeNumber(grams)}g`
    };

}


/*
=====================================================
EXTRACT VOLUME
=====================================================
*/

function extractVolume(
    title
) {

    const text =
        normalizeText(
            title
        );

    const match =
        text.match(
            /(\d+(?:\.\d+)?)\s*(ml|millilitre|millilitres|l|litre|litres)\b/i
        );

    if (
        !match
    ) {
        return null;
    }

    const value =
        Number(
            match[1]
        );

    if (
        !Number.isFinite(
            value
        )
    ) {
        return null;
    }

    const unit =
        match[2]
            .toLowerCase();

    let millilitres;

    if (
        unit === "l" ||
        unit === "litre" ||
        unit === "litres"
    ) {

        millilitres =
            value * 1000;

    }
    else {

        millilitres =
            value;

    }

    return {
        raw:
            `${normalizeNumber(value)} ${unit}`,
        value:
            millilitres,
        normalized:
            `${normalizeNumber(millilitres)}ml`
    };

}


/*
=====================================================
EXTRACT POWER
=====================================================
*/

function extractPower(
    title
) {

    const text =
        normalizeText(
            title
        );

    const match =
        text.match(
            /(\d+(?:\.\d+)?)\s*(w|watt|watts)\b/i
        );

    if (
        !match
    ) {
        return null;
    }

    const value =
        Number(
            match[1]
        );

    if (
        !Number.isFinite(
            value
        )
    ) {
        return null;
    }

    return {
        raw:
            `${normalizeNumber(value)}W`,
        value,
        normalized:
            `${normalizeNumber(value)}w`
    };

}


/*
=====================================================
EXTRACT CAPACITY
=====================================================
*/

function extractCapacity(
    title
) {

    const text =
        normalizeText(
            title
        );

    /*
    Egg capacity.
    */

    let match =
        text.match(
            /(\d+)\s*(?:egg|eggs)\b/i
        );

    if (
        match
    ) {

        return {
            type:
                "eggs",
            value:
                Number(match[1]),
            normalized:
                `${normalizeNumber(match[1])}eggs`
        };

    }

    /*
    Bottle / container style capacity.
    */

    match =
        text.match(
            /(\d+(?:\.\d+)?)\s*(cup|cups)\b/i
        );

    if (
        match
    ) {

        return {
            type:
                "cups",
            value:
                Number(match[1]),
            normalized:
                `${normalizeNumber(match[1])}cups`
        };

    }

    return null;

}


/*
=====================================================
EXTRACT PACK COUNT
=====================================================
*/

function extractPackCount(
    title
) {

    const text =
        normalizeText(
            title
        );

    let match =
        text.match(
            /pack\s*of\s*(\d+)/i
        );

    if (
        !match
    ) {

        match =
            text.match(
                /set\s*of\s*(\d+)/i
            );

    }

    if (
        !match
    ) {

        match =
            text.match(
                /\b(\d+)\s*x\s*(\d+)\b/i
            );

    }

    if (
        !match
    ) {
        return null;
    }

    const value =
        Number(
            match[
            match.length - 1
            ]
        );

    if (
        !Number.isFinite(
            value
        )
    ) {
        return null;
    }

    return {
        value,
        normalized:
            `${normalizeNumber(value)}pack`
    };

}


/*
=====================================================
EXTRACT STORAGE
=====================================================
*/

function extractStorage(
    title
) {

    const text =
        normalizeText(
            title
        );

    const match =
        text.match(
            /(\d+(?:\.\d+)?)\s*(gb|tb)\b/i
        );

    if (
        !match
    ) {
        return null;
    }

    const value =
        Number(
            match[1]
        );

    if (
        !Number.isFinite(
            value
        )
    ) {
        return null;
    }

    const unit =
        match[2]
            .toLowerCase();

    const gb =
        unit === "tb"
            ? value * 1024
            : value;

    return {
        raw:
            `${normalizeNumber(value)}${unit}`,
        value:
            gb,
        normalized:
            `${normalizeNumber(gb)}gb`
    };

}


/*
=====================================================
EXTRACT RAM
=====================================================
*/

function extractRam(
    title
) {

    const text =
        normalizeText(
            title
        );

    const match =
        text.match(
            /(\d+(?:\.\d+)?)\s*gb\s*ram\b/i
        );

    if (
        !match
    ) {
        return null;
    }

    const value =
        Number(
            match[1]
        );

    if (
        !Number.isFinite(
            value
        )
    ) {
        return null;
    }

    return {
        value,
        normalized:
            `${normalizeNumber(value)}gbram`
    };

}


/*
=====================================================
EXTRACT MATERIAL
=====================================================
*/

function extractMaterial(
    title
) {

    const text =
        normalizeText(
            title
        );

    const materials = [
        "stainless steel",
        "steel",
        "aluminium",
        "aluminum",
        "glass",
        "ceramic",
        "plastic",
        "silicone",
        "wood",
        "copper"
    ];

    for (
        const material
        of materials
    ) {

        if (
            text.includes(
                material
            )
        ) {

            return material
                .replace(
                    /\s+/g,
                    "-"
                );

        }

    }

    return null;

}


/*
=====================================================
EXTRACT ALL VARIANT ATTRIBUTES
=====================================================
*/

function extractVariantAttributes(
    product
) {

    const title =
        product?.title ||
        "";

    return {

        weight:
            extractWeight(
                title
            ),

        volume:
            extractVolume(
                title
            ),

        power:
            extractPower(
                title
            ),

        capacity:
            extractCapacity(
                title
            ),

        packCount:
            extractPackCount(
                title
            ),

        storage:
            extractStorage(
                title
            ),

        ram:
            extractRam(
                title
            ),

        material:
            extractMaterial(
                title
            )

    };

}


/*
=====================================================
REQUESTED PRODUCT IDENTITY
=====================================================

Used as the base of the variant signature.

We intentionally keep this conservative.
=====================================================
*/

function getBaseIdentity(
    originalProduct
) {

    const product =
        originalProduct ||
        {};

    const parts = [];

    const brand =
        normalizeText(
            product.brand
        );

    const productName =
        normalizeText(
            product.productName
        );

    const model =
        normalizeText(
            product.model
        );

    const flavour =
        normalizeText(
            product.flavour
        );

    if (
        brand
    ) {
        parts.push(
            brand
        );
    }

    if (
        productName
    ) {
        parts.push(
            productName
        );
    }

    if (
        model
    ) {
        parts.push(
            model
        );
    }

    if (
        flavour
    ) {
        parts.push(
            flavour
        );
    }

    if (
        parts.length === 0
    ) {

        return "product";

    }

    return parts.join(
        "-"
    );

}


/*
=====================================================
ATTRIBUTE SIGNATURE
=====================================================
*/

function buildVariantSignature(
    attributes
) {

    const parts = [];

    if (
        attributes.weight
    ) {

        parts.push(
            `weight-${attributes.weight.normalized}`
        );

    }

    if (
        attributes.volume
    ) {

        parts.push(
            `volume-${attributes.volume.normalized}`
        );

    }

    if (
        attributes.power
    ) {

        parts.push(
            `power-${attributes.power.normalized}`
        );

    }

    if (
        attributes.capacity
    ) {

        parts.push(
            `capacity-${attributes.capacity.normalized}`
        );

    }

    if (
        attributes.packCount
    ) {

        parts.push(
            `pack-${attributes.packCount.normalized}`
        );

    }

    if (
        attributes.storage
    ) {

        parts.push(
            `storage-${attributes.storage.normalized}`
        );

    }

    if (
        attributes.ram
    ) {

        parts.push(
            `ram-${attributes.ram.normalized}`
        );

    }

    if (
        attributes.material
    ) {

        parts.push(
            `material-${attributes.material}`
        );

    }

    return parts.length
        ? parts.join("|")
        : "default";

}


/*
=====================================================
HUMAN READABLE VARIANT LABEL
=====================================================
*/

function buildVariantLabel(
    attributes,
    originalProduct
) {

    const labels = [];

    if (
        attributes.capacity
    ) {

        const type =
            attributes.capacity.type === "eggs"
                ? "eggs"
                : attributes.capacity.type;

        labels.push(
            `${attributes.capacity.value} ${type}`
        );

    }

    if (
        attributes.weight
    ) {

        labels.push(
            attributes.weight.value >= 1000
                ? `${attributes.weight.value / 1000} kg`
                : `${attributes.weight.value} g`
        );

    }

    if (
        attributes.volume
    ) {

        labels.push(
            attributes.volume.value >= 1000
                ? `${attributes.volume.value / 1000} L`
                : `${attributes.volume.value} ml`
        );

    }

    if (
        attributes.power
    ) {

        labels.push(
            `${attributes.power.value}W`
        );

    }

    if (
        attributes.packCount
    ) {

        labels.push(
            `Pack of ${attributes.packCount.value}`
        );

    }

    if (
        attributes.storage
    ) {

        labels.push(
            `${attributes.storage.value}GB`
        );

    }

    if (
        attributes.ram
    ) {

        labels.push(
            `${attributes.ram.value}GB RAM`
        );

    }

    if (
        attributes.material
    ) {

        labels.push(
            attributes.material
                .replace(
                    /-/g,
                    " "
                )
        );

    }

    if (
        labels.length > 0
    ) {

        return labels
            .join(
                " • "
            );

    }

    return (
        originalProduct?.productName ||
        "Standard variant"
    );

}


/*
=====================================================
COMPARABILITY CHECK
=====================================================

Two products can share a group only when all variant
attributes that are known for BOTH products agree.

This prevents:

7 eggs
from being grouped with
14 eggs.

It also prevents:

800g
from being grouped with
500g.

Unknown values are not treated as matches.
=====================================================
*/

function areVariantsCompatible(
    a,
    b
) {

    const fields = [
        "weight",
        "volume",
        "power",
        "capacity",
        "packCount",
        "storage",
        "ram",
        "material"
    ];

    for (
        const field
        of fields
    ) {

        const valueA =
            a?.[field];

        const valueB =
            b?.[field];

        if (
            valueA &&
            valueB
        ) {

            if (
                valueA.normalized !==
                valueB.normalized
            ) {

                return false;

            }

        }

    }

    return true;

}


/*
=====================================================
BUILD GROUPS
=====================================================
*/

function groupVariantProducts(
    products,
    originalProduct = {}
) {

    if (
        !Array.isArray(
            products
        ) ||
        products.length === 0
    ) {

        return {

            products:
                Array.isArray(products)
                    ? products
                    : [],

            variantGroups:
                []

        };

    }

    const baseIdentity =
        getBaseIdentity(
            originalProduct
        );

    const groups =
        [];

    /*
    ---------------------------------------------
    STEP 1
    Extract attributes.
    ---------------------------------------------
    */

    const enriched =
        products.map(
            (
                product,
                index
            ) => {

                const attributes =
                    extractVariantAttributes(
                        product
                    );

                return {

                    ...product,

                    _variantIndex:
                        index,

                    variantAttributes:
                        attributes

                };

            }
        );


    /*
    ---------------------------------------------
    STEP 2
    Group products.

    We don't use only a raw string key here because
    missing attributes need conservative handling.
    ---------------------------------------------
    */

    for (
        const product
        of enriched
    ) {

        let matchedGroup =
            null;

        for (
            const group
            of groups
        ) {

            if (
                areVariantsCompatible(
                    product.variantAttributes,
                    group.referenceAttributes
                )
            ) {

                matchedGroup =
                    group;

                break;

            }

        }


        if (
            !matchedGroup
        ) {

            matchedGroup = {

                groupId:
                    null,

                baseIdentity,

                referenceAttributes:
                    product.variantAttributes,

                products:
                    []

            };

            groups.push(
                matchedGroup
            );

        }

        matchedGroup.products.push(
            product
        );

    }


    /*
    ---------------------------------------------
    STEP 3
    Finalize group metadata.
    ---------------------------------------------
    */

    const finalizedGroups =
        groups.map(
            (
                group,
                groupIndex
            ) => {

                const attributes =
                    group.referenceAttributes;

                const attributeSignature =
                    buildVariantSignature(
                        attributes
                    );

                const groupId =
                    `${baseIdentity}|${attributeSignature}`;

                const label =
                    buildVariantLabel(
                        attributes,
                        originalProduct
                    );

                /*
                Cheapest listing overall.
                */

                const pricedProducts =
                    group.products
                        .filter(
                            product =>
                                Number.isFinite(
                                    Number(
                                        product.price
                                    )
                                )
                        )
                        .sort(
                            (
                                a,
                                b
                            ) =>
                                Number(a.price) -
                                Number(b.price)
                        );

                const lowestPrice =
                    pricedProducts.length > 0
                        ? Number(
                            pricedProducts[0].price
                        )
                        : null;


                /*
                Cheapest product on each platform.
                */

                const platformMap =
                    new Map();

                for (
                    const product
                    of pricedProducts
                ) {

                    const platform =
                        String(
                            product.platform ||
                            "Unknown"
                        ).trim();

                    const existing =
                        platformMap.get(
                            platform
                        );

                    if (
                        !existing ||
                        Number(product.price) <
                        Number(existing.price)
                    ) {

                        platformMap.set(
                            platform,
                            product
                        );

                    }

                }

                const marketplaceLowest =
                    Array.from(
                        platformMap.values()
                    )
                        .sort(
                            (
                                a,
                                b
                            ) =>
                                Number(a.price) -
                                Number(b.price)
                        );


                const groupPlatforms =
                    marketplaceLowest.map(
                        product =>
                            product.platform ||
                            "Unknown"
                    );


                return {

                    groupId,

                    groupIndex,

                    label,

                    attributes: {

                        weight:
                            attributes.weight?.normalized ||
                            null,

                        volume:
                            attributes.volume?.normalized ||
                            null,

                        power:
                            attributes.power?.normalized ||
                            null,

                        capacity:
                            attributes.capacity?.normalized ||
                            null,

                        packCount:
                            attributes.packCount?.normalized ||
                            null,

                        storage:
                            attributes.storage?.normalized ||
                            null,

                        ram:
                            attributes.ram?.normalized ||
                            null,

                        material:
                            attributes.material ||
                            null

                    },

                    productCount:
                        group.products.length,

                    platforms:
                        groupPlatforms,

                    lowestPrice,

                    lowestOffer:
                        pricedProducts[0] || null,

                    marketplaceOffers:
                        marketplaceLowest,

                    confidence:
                        buildGroupConfidence(
                            attributes
                        )

                };

            }
        );


    /*
    ---------------------------------------------
    STEP 4
    Attach group metadata back to products.
    ---------------------------------------------
    */

    const groupByProduct =
        new Map();

    finalizedGroups.forEach(
        group => {

            const sourceGroup =
                groups[
                group.groupIndex
                ];

            sourceGroup.products.forEach(
                product => {

                    groupByProduct.set(
                        product._variantIndex,
                        group
                    );

                }
            );

        }
    );


    const finalProducts =
        enriched.map(
            (
                product
            ) => {

                const group =
                    groupByProduct.get(
                        product._variantIndex
                    );

                const cleanProduct = {
                    ...product
                };

                delete cleanProduct._variantIndex;

                if (
                    !group
                ) {
                    return cleanProduct;
                }

                const platform =
                    String(
                        product.platform ||
                        "Unknown"
                    );

                const platformOffer =
                    group.marketplaceOffers.find(
                        offer =>
                            String(
                                offer.platform ||
                                "Unknown"
                            ) ===
                            platform
                    );

                return {

                    ...cleanProduct,

                    variantGroup: {

                        groupId:
                            group.groupId,

                        label:
                            group.label,

                        attributes:
                            group.attributes,

                        confidence:
                            group.confidence,

                        productCount:
                            group.productCount,

                        platforms:
                            group.platforms,

                        lowestPrice:
                            group.lowestPrice,

                        isGroupLowest:
                            Boolean(
                                group.lowestOffer &&
                                group.lowestOffer.url ===
                                product.url
                            ),

                        marketplaceLowest:
                            platformOffer
                                ? Number(
                                    platformOffer.price
                                )
                                : null

                    }

                };

            }
        );


    /*
    ---------------------------------------------
    DEBUG
    ---------------------------------------------
    */

    console.log(
        "\n=========================================="
    );

    console.log(
        "🧩 STOCKSENSE VARIANT GROUPING"
    );

    console.log(
        "=========================================="
    );

    console.log(
        `Input products: ${products.length}`
    );

    console.log(
        `Variant groups: ${finalizedGroups.length}`
    );

    finalizedGroups.forEach(
        group => {

            console.log(
                `\n🔹 ${group.label}`
            );

            console.log(
                `   Group ID: ${group.groupId}`
            );

            console.log(
                `   Products: ${group.productCount}`
            );

            console.log(
                `   Platforms: ${group.platforms.join(", ") || "none"}`
            );

            console.log(
                `   Lowest price: ${group.lowestPrice !== null
                    ? `₹${group.lowestPrice}`
                    : "N/A"
                }`
            );

            console.log(
                `   Confidence: ${group.confidence}`
            );

        }
    );

    console.log(
        "==========================================\n"
    );


    return {

        products:
            finalProducts,

        variantGroups:
            finalizedGroups

    };

}


/*
=====================================================
GROUP CONFIDENCE
=====================================================
*/

function buildGroupConfidence(
    attributes
) {

    const knownFields =
        Object.values(
            attributes
        )
            .filter(
                Boolean
            )
            .length;

    if (
        knownFields >= 3
    ) {
        return "HIGH";
    }

    if (
        knownFields === 2
    ) {
        return "MEDIUM";
    }

    if (
        knownFields === 1
    ) {
        return "LOW";
    }

    return "BASIC";

}


/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = {

    groupVariantProducts,

    extractVariantAttributes,

    extractWeight,

    extractVolume,

    extractPower,

    extractCapacity,

    extractPackCount,

    extractStorage,

    extractRam,

    extractMaterial,

    buildVariantSignature,

    buildVariantLabel,

    areVariantsCompatible

};