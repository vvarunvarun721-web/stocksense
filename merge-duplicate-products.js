require("dotenv").config();

const mongoose = require("mongoose");

const connectDB =
    require("./config/database");

const Product =
    require("./models/Product");

const PlatformProduct =
    require("./models/PlatformProduct");


const CANONICAL_PRODUCT_ID =
    "6a5fb963ad4f7633487f02ea";

const DUPLICATE_PRODUCT_ID =
    "6a8a8052cb8248c35bcca24f";


async function mergeDuplicate() {

    console.log(
        "\n======================================"
    );

    console.log(
        "STARTING SAFE DUPLICATE CLEANUP"
    );


    const canonical =
        await Product.findById(
            CANONICAL_PRODUCT_ID
        ).lean();


    const duplicate =
        await Product.findById(
            DUPLICATE_PRODUCT_ID
        ).lean();


    if (!canonical) {

        throw new Error(
            "Canonical product not found"
        );

    }


    if (!duplicate) {

        throw new Error(
            "Duplicate product not found"
        );

    }


    if (
        canonical.url !==
        duplicate.url
    ) {

        throw new Error(
            "URLs do not match. Cleanup aborted."
        );

    }


    console.log(
        "Canonical:",
        canonical.title,
        canonical._id.toString()
    );


    console.log(
        "Duplicate:",
        duplicate.title,
        duplicate._id.toString()
    );


    /*
    =================================================
    MERGE MISSING CANONICAL DATA

    Product A is canonical, but it currently has
    category = null while the duplicate has groceries.

    =================================================
    */

    const mergedFields = {};


    if (
        !canonical.category &&
        duplicate.category
    ) {

        mergedFields.category =
            duplicate.category;

    }


    if (
        !canonical.brand &&
        duplicate.brand
    ) {

        mergedFields.brand =
            duplicate.brand;

    }


    if (
        !canonical.weight &&
        duplicate.weight
    ) {

        mergedFields.weight =
            duplicate.weight;

    }


    if (
        !canonical.flavour &&
        duplicate.flavour
    ) {

        mergedFields.flavour =
            duplicate.flavour;

    }


    if (
        !canonical.storage &&
        duplicate.storage
    ) {

        mergedFields.storage =
            duplicate.storage;

    }


    if (
        !canonical.ram &&
        duplicate.ram
    ) {

        mergedFields.ram =
            duplicate.ram;

    }


    if (
        !canonical.model &&
        duplicate.model
    ) {

        mergedFields.model =
            duplicate.model;

    }


    if (
        !canonical.image &&
        duplicate.image
    ) {

        mergedFields.image =
            duplicate.image;

    }


    if (
        Object.keys(
            mergedFields
        ).length > 0
    ) {

        await Product.updateOne(

            {
                _id:
                    canonical._id
            },

            {
                $set:
                    mergedFields
            }

        );


        console.log(
            "✅ Canonical product fields updated:",
            mergedFields
        );

    }


    /*
    =================================================
    CHECK PLATFORM PRODUCTS

    The canonical product already has one Amazon
    and one Flipkart listing.

    Therefore the duplicate listings can be safely
    removed instead of reassigning them.

    =================================================
    */

    const duplicateListings =
        await PlatformProduct.find({

            productId:
                duplicate._id

        }).lean();


    console.log(
        `Duplicate platform listings: ${duplicateListings.length}`
    );


    for (
        const listing
        of duplicateListings
    ) {

        console.log(
            `🗑️ Removing duplicate ${listing.platform} listing`
        );


        await PlatformProduct.deleteOne({

            _id:
                listing._id

        });

    }


    /*
    =================================================
    DELETE DUPLICATE PRODUCT

    Watchlists are NOT moved because the inspection
    showed the canonical product already owns the
    existing watchlist and the duplicate owns none.

    =================================================
    */

    await Product.deleteOne({

        _id:
            duplicate._id

    });


    console.log(
        "🗑️ Duplicate Product deleted"
    );


    /*
    =================================================
    VERIFY
    =================================================
    */

    const remainingProducts =
        await Product.find({

            url:
                canonical.url

        }).lean();


    console.log(
        "\nRemaining Products:",
        remainingProducts.length
    );


    const canonicalListings =
        await PlatformProduct.find({

            productId:
                canonical._id

        }).lean();


    console.log(
        "Canonical PlatformProducts:",
        canonicalListings.length
    );


    console.dir(
        canonicalListings.map(
            item => ({

                platform:
                    item.platform,

                title:
                    item.title,

                price:
                    item.latestPrice

            })
        ),
        {
            depth: null
        }
    );


    if (
        remainingProducts.length !== 1
    ) {

        throw new Error(
            "Cleanup verification failed: URL is still duplicated."
        );

    }


    console.log(
        "\n✅ DUPLICATE CLEANUP COMPLETED"
    );

}


/*
=====================================================
RUN
=====================================================
*/

(async () => {

    try {

        await connectDB();

        await mergeDuplicate();

    } catch (err) {

        console.error(
            "\n❌ CLEANUP FAILED:"
        );

        console.error(
            err.message
        );

        process.exitCode =
            1;

    } finally {

        await mongoose.connection.close();

    }

})();