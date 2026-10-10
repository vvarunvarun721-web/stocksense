const Product =
    require("../../models/Product");


/*
=====================================================

NORMALIZE PRODUCT URL

Handles:

1. Normal URL
   https://amazon.in/dp/ABC

2. Markdown URL
   [https://amazon.in/dp/ABC](https://amazon.in/dp/ABC)

3. Markdown URL with different label
   [Amazon](https://amazon.in/dp/ABC)

4. Trailing slash

5. Query strings / fragments

=====================================================
*/

function normalizeProductUrl(url) {

    if (
        !url ||
        typeof url !== "string"
    ) {
        return null;
    }

    let value =
        url.trim();

    /*
    =============================================
    MARKDOWN URL
    [label](https://...)
    =============================================
    */

    const markdownMatch =
        value.match(
            /^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/i
        );

    if (markdownMatch) {

        value =
            markdownMatch[1];

    }

    /*
    =============================================
    FALLBACK MARKDOWN EXTRACTION
    =============================================
    */

    if (
        value.includes("](")
    ) {

        const match =
            value.match(
                /\]\((https?:\/\/[^)\s]+)\)/i
            );

        if (match) {

            value =
                match[1];

        }

    }

    /*
    =============================================
    REMOVE QUOTES
    =============================================
    */

    value =
        value
            .replace(
                /^["']+|["']+$/g,
                ""
            )
            .trim();

    /*
    =============================================
    PARSE URL
    =============================================
    */

    try {

        const parsed =
            new URL(value);

        /*
        IMPORTANT:

        Lowercase only protocol + hostname.

        DO NOT lowercase pathname.

        Amazon:
        /dp/B00J3QHWJE

        should stay exactly that.
        */

        parsed.protocol =
            parsed.protocol.toLowerCase();

        parsed.hostname =
            parsed.hostname.toLowerCase();

        /*
        Remove query parameters and hash.
        */

        parsed.search = "";
        parsed.hash = "";

        return (
            `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`
        )
            .replace(
                /\/+$/,
                ""
            );

    } catch (_) {

        return null;

    }

}
/*
=====================================================

BUILD PRODUCT DATA

=====================================================
*/

function buildProductData(
    normalized,
    scraped,
    canonicalUrl
) {

    return {

        title:
            normalized.productName,

        brand:
            normalized.brand || null,

        category:
            normalized.category || null,

        weight:
            normalized.weight || null,

        flavour:
            normalized.flavour || null,

        storage:
            normalized.storage || null,

        ram:
            normalized.ram || null,

        model:
            normalized.model || null,

        image:
            scraped.image || null,

        platform:
            scraped.platform || null,

        url:
            canonicalUrl,

        currentPrice:
            scraped.currentPrice ?? null

    };

}


/*
=====================================================

FIND OR CREATE PRODUCT

LOOKUP PRIORITY:

1. Canonical URL
2. Normalized identity
3. Create

=====================================================
*/

async function findOrCreateProduct(
    normalized,
    scraped
) {

    const canonicalUrl =
        normalizeProductUrl(
            scraped.url
        );


    if (
        !canonicalUrl
    ) {

        throw new Error(
            `Cannot catalog product: invalid URL returned by scraper: ${scraped.url}`
        );

    }


    console.log(
        "🔗 Canonical Product URL:",
        canonicalUrl
    );


    /*
    =================================================
    STEP 1 — URL-FIRST LOOKUP
    =================================================
    */
    let product =
        await Product.findOneAndUpdate(
            {
                url:
                    canonicalUrl
            },
            {
                $set:
                    buildProductData(
                        normalized,
                        scraped,
                        canonicalUrl
                    )
            },
            {
                new:
                    true
            }
        );


    if (
        product
    ) {

        console.log(
            "✅ Product found by URL"
        );

        return product;

    }


    /*
    =================================================
    STEP 2 — NORMALIZED IDENTITY LOOKUP
    =================================================
    */

    const identityQuery = {

        brand:
            normalized.brand || null,

        title:
            normalized.productName || null,

        weight:
            normalized.weight || null,

        flavour:
            normalized.flavour || null,

        storage:
            normalized.storage || null,

        ram:
            normalized.ram || null,

        model:
            normalized.model || null

    };


    product =
        await Product.findOne(
            identityQuery
        );


    if (
        product
    ) {

        console.log(
            "✅ Product found by normalized identity"
        );


        const updateData =
            buildProductData(
                normalized,
                scraped,
                canonicalUrl
            );


        await Product.updateOne(

            {
                _id:
                    product._id
            },

            {
                $set:
                    updateData
            }

        );


        Object.assign(
            product,
            updateData
        );


        return product;

    }


    /*
    =================================================
    STEP 3 — CREATE
    =================================================
    */

    try {

        product =
            await Product.create(

                buildProductData(
                    normalized,
                    scraped,
                    canonicalUrl
                )

            );


        console.log(
            "🆕 New Product Created"
        );


        return product;

    } catch (
    err
    ) {

        /*
        =============================================
        RACE CONDITION

        If another request created this URL first,
        unique index will reject this insert.

        Re-read the canonical product.
        =============================================
        */

        if (
            err.code === 11000
        ) {

            const existing =
                await Product.findOne({

                    url:
                        canonicalUrl

                });


            if (
                existing
            ) {

                console.log(
                    "🔄 Duplicate creation prevented — existing product reused"
                );


                return existing;

            }

        }


        throw err;

    }

}


module.exports = {

    findOrCreateProduct,

    normalizeProductUrl

};