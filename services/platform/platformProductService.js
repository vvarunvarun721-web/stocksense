const PlatformProduct = require("../../models/PlatformProduct");

async function findOrCreatePlatformProduct(productId, platformData) {

    /*
    =====================================================
    VALIDATE REQUIRED PLATFORM DATA
    =====================================================
    */

    if (!platformData.url) {

        console.error(
            `❌ Cannot save ${platformData.platform} product: missing URL`
        );

        console.error(
            "Product:",
            platformData.title
        );

        return null;

    }


    let platformProduct =
        await PlatformProduct.findOne({

            productId,

            platform: platformData.platform

        });
    if (platformProduct) {

        console.log(
            `🔄 ${platformData.platform} listing updated`
        );

        return platformProduct;

    }

    platformProduct =
        await PlatformProduct.create({

            productId,

            platform: platformData.platform,

            url: platformData.url,

            title: platformData.title,

            image: platformData.image,

            seller: platformData.seller || null,

            rating: Number(platformData.rating) || null,

            reviews: Number(
                String(platformData.reviews || "")
                    .replace(/[(),]/g, "")
            ) || null,

            availability:
                platformData.availability,

            latestPrice:
                platformData.price,

            lastChecked:
                new Date()

        });

    console.log(
        `✅ ${platformData.platform} listing created`
    );

    return platformProduct;

}

async function updatePlatformProduct(
    platformProduct,
    platformData
) {

    platformProduct.title =
        platformData.title;

    platformProduct.image =
        platformData.image;

    platformProduct.seller =
        platformData.seller || null;

    platformProduct.rating =
        Number(platformData.rating) || null;

    platformProduct.reviews =
        Number(
            String(platformData.reviews || "")
                .replace(/[(),]/g, "")
        ) || null;

    platformProduct.availability =
        platformData.availability;

    platformProduct.latestPrice =
        platformData.price;

    platformProduct.lastChecked =
        new Date();

    await platformProduct.save();

    return platformProduct;

}

async function getPlatformProducts(productId) {

    return PlatformProduct.find({

        productId

    });

}

module.exports = {

    findOrCreatePlatformProduct,

    updatePlatformProduct,

    getPlatformProducts

};