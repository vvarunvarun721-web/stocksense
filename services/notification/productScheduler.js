const Product =
    require("../../models/Product");

const {
    scrapeProduct
} = require("../../scraper");

const {
    saveSnapshot
} = require("../history/historyService");


/*
=====================================================

CONFIGURATION

=====================================================
*/

const MAX_CONSECUTIVE_FAILURES = 2;

const FAILURE_RETRY_HOURS = 24;


/*
=====================================================

IN-MEMORY LOCK

=====================================================
*/

let updateRunning = false;


/*
=====================================================

SAFE PRODUCT LABEL

Avoid logs such as:

Checking: undefined

=====================================================
*/

function getProductLabel(
    product
) {

    return (
        product?.title ||
        product?.productName ||
        product?._id?.toString() ||
        "Unknown Product"
    );

}


/*
=====================================================

SAFE ERROR MESSAGE

Some thrown values are not standard Error objects.

=====================================================
*/

function getErrorMessage(
    error
) {

    if (
        error instanceof Error &&
        error.message
    ) {

        return error.message;

    }


    if (
        typeof error === "string"
    ) {

        return error;

    }


    if (
        error &&
        typeof error === "object"
    ) {

        if (
            typeof error.message === "string"
        ) {

            return error.message;

        }

        try {

            return JSON.stringify(
                error
            );

        } catch (_) {

            return "Unknown scheduler error";

        }

    }


    return "Unknown scheduler error";

}


/*
=====================================================

OBVIOUSLY INVALID URL

These should NEVER open a browser.

=====================================================
*/

function isObviouslyInvalidUrl(
    url
) {

    if (
        !url ||
        typeof url !== "string"
    ) {

        return true;

    }


    const normalized =
        url
            .trim()
            .toLowerCase();


    if (
        !normalized
    ) {

        return true;

    }


    const invalidPatterns = [

        "b0example",

        "example.com",

        "localhost",

        "127.0.0.1"

    ];


    return invalidPatterns.some(
        pattern =>
            normalized.includes(
                pattern
            )
    );

}


/*
=====================================================

SHOULD SKIP PRODUCT

=====================================================
*/

function shouldSkipProduct(
    product
) {

    const label =
        getProductLabel(
            product
        );


    if (
        product.monitoringEnabled === false
    ) {

        console.log(
            `⏭️ Monitoring disabled: ${label}`
        );

        return true;

    }


    if (
        !product.url
    ) {

        console.log(
            `⏭️ Missing URL: ${label}`
        );

        return true;

    }


    if (
        isObviouslyInvalidUrl(
            product.url
        )
    ) {

        console.log(
            `⛔ Invalid/placeholder URL skipped: ${product.url}`
        );

        return true;

    }


    if (
        product.retryAfter &&
        new Date(
            product.retryAfter
        ) > new Date()
    ) {

        console.log(
            `⏳ Backoff active: ${label}`
        );

        return true;

    }


    return false;

}


/*
=====================================================

MARK SUCCESS

IMPORTANT:

Use updateOne() instead of product.save().

This prevents legacy malformed Product documents
from failing validation because of unrelated fields.

=====================================================
*/

async function markSuccess(
    product,
    scraped
) {

    const now =
        new Date();


    const update = {

        $set: {

            lastChecked:
                now,

            lastSuccessfulCheck:
                now,

            lastCheckError:
                null,

            consecutiveFailures:
                0,

            retryAfter:
                null,

            monitoringEnabled:
                true

        }

    };


    if (
        scraped.currentPrice !== null &&
        scraped.currentPrice !== undefined
    ) {

        update.$set.currentPrice =
            scraped.currentPrice;

    }


    if (
        scraped.image
    ) {

        update.$set.image =
            scraped.image;

    }


    await Product.updateOne(

        {
            _id: product._id
        },

        update

    );


    /*
    Snapshot service may use the Mongoose document,
    so keep this separate.

    If snapshot fails, we don't want the scheduler
    to undo the successful product update.
    */

    try {

        await saveSnapshot(
            product,
            scraped
        );

    } catch (snapshotError) {

        console.error(
            `⚠️ Snapshot failed for ${getProductLabel(product)}: ${getErrorMessage(snapshotError)}`
        );

    }


    console.log(
        `✅ Updated ${getProductLabel(product)}`
    );

}


/*
=====================================================

MARK FAILURE

IMPORTANT:

Use updateOne() so old malformed documents can still
receive scheduler state.

=====================================================
*/

async function markFailure(
    product,
    error
) {

    const now =
        new Date();


    const errorMessage =
        getErrorMessage(
            error
        );


    const previousFailures =
        Number(
            product.consecutiveFailures
        ) || 0;


    const consecutiveFailures =
        previousFailures + 1;


    const updateFields = {

        lastChecked:
            now,

        lastCheckError:
            errorMessage,

        consecutiveFailures

    };


    /*
    =============================================
    AFTER REPEATED FAILURES
    =============================================
    */

    if (
        consecutiveFailures >=
        MAX_CONSECUTIVE_FAILURES
    ) {

        updateFields.monitoringEnabled =
            false;


        updateFields.retryAfter =
            new Date(
                now.getTime() +
                FAILURE_RETRY_HOURS *
                60 *
                60 *
                1000
            );


        console.log(
            `⛔ Monitoring disabled for ${getProductLabel(product)}`
        );


        console.log(
            `   Failed ${consecutiveFailures} consecutive times`
        );


        console.log(
            `   URL: ${product.url}`
        );


        console.log(
            `   Retry after: ${updateFields.retryAfter.toISOString()}`
        );

    }


    else {

        console.log(
            `⚠️ ${getProductLabel(product)} failed ` +
            `(${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`
        );

    }


    /*
    =============================================
    IMPORTANT

    updateOne() avoids full-document validation.
    =============================================
    */

    await Product.updateOne(

        {
            _id: product._id
        },

        {
            $set:
                updateFields

        }

    );


    console.error(
        `❌ Scheduler error for ${getProductLabel(product)}: ${errorMessage}`
    );

}


/*
=====================================================

UPDATE ALL PRODUCTS

=====================================================
*/

async function updateAllProducts() {

    if (
        updateRunning
    ) {

        console.log(
            "⏭️ Product scheduler already running. Skipping duplicate run."
        );

        return;

    }


    updateRunning =
        true;


    try {

        console.log(
            "📦 Updating Products..."
        );


        const products =
            await Product.find({});


        console.log(
            `📦 Products loaded: ${products.length}`
        );


        let checkedCount =
            0;

        let skippedCount =
            0;

        let failedCount =
            0;


        for (
            const product
            of products
        ) {

            /*
            =============================================
            SKIP
            =============================================
            */

            if (
                shouldSkipProduct(
                    product
                )
            ) {

                skippedCount++;

                continue;

            }


            const label =
                getProductLabel(
                    product
                );


            console.log(
                `\n🔎 Checking: ${label}`
            );


            console.log(
                `   URL: ${product.url}`
            );


            checkedCount++;


            try {

                /*
                =========================================
                SCRAPE
                =========================================
                */

                const scraped =
                    await scrapeProduct(
                        product.url
                    );


                /*
                =========================================
                VALIDATE SCRAPER RESPONSE
                =========================================
                */

                if (
                    !scraped ||
                    typeof scraped !== "object"
                ) {

                    throw new Error(
                        "Scraper returned invalid result"
                    );

                }


                /*
                =========================================
                USEFUL DATA CHECK
                =========================================
                */

                const hasUsefulData =
                    (
                        scraped.currentPrice !==
                        null &&
                        scraped.currentPrice !==
                        undefined
                    ) ||
                    Boolean(
                        scraped.title
                    );


                if (
                    !hasUsefulData
                ) {

                    throw new Error(
                        "Scraper returned no usable product data"
                    );

                }


                /*
                =========================================
                SUCCESS
                =========================================
                */

                await markSuccess(
                    product,
                    scraped
                );


            } catch (
            err
            ) {

                failedCount++;


                /*
                =========================================
                RECORD FAILURE WITHOUT product.save()
                =========================================
                */

                await markFailure(
                    product,
                    err
                );

            }

        }


        /*
        =============================================
        SUMMARY
        =============================================
        */

        console.log(
            "\n📊 Scheduler Summary"
        );


        console.log(
            `   Checked: ${checkedCount}`
        );


        console.log(
            `   Skipped: ${skippedCount}`
        );


        console.log(
            `   Failed: ${failedCount}`
        );


        console.log(
            "✅ Product update cycle complete."
        );


    } finally {

        updateRunning =
            false;

    }

}


module.exports = {

    updateAllProducts

};