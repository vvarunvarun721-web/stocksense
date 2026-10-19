require("dotenv").config();

const connectDB =
    require("./config/database");

const Product =
    require("./models/Product");

const PlatformProduct =
    require("./models/PlatformProduct");

const Watchlist =
    require("./models/Watchlist");


(async () => {

    try {

        await connectDB();


        const duplicates =
            await Product.aggregate([

                {
                    $group: {

                        _id: "$url",

                        count: {
                            $sum: 1
                        },

                        ids: {
                            $push: "$_id"
                        }

                    }

                },

                {
                    $match: {

                        count: {
                            $gt: 1
                        }

                    }

                }

            ]);


        for (
            const group
            of duplicates
        ) {

            console.log(
                "\n======================================"
            );

            console.log(
                "DUPLICATE URL:",
                group._id
            );


            for (
                const id
                of group.ids
            ) {

                const idString =
                    id.toString();


                console.log(
                    "\n--------------------------------------"
                );

                console.log(
                    "PRODUCT ID:",
                    idString
                );


                const product =
                    await Product.findById(
                        id
                    ).lean();


                console.log(
                    "PRODUCT:"
                );

                console.dir(
                    product,
                    {
                        depth: null
                    }
                );


                const platformProducts =
                    await PlatformProduct.find({
                        productId: id
                    }).lean();


                console.log(
                    "PLATFORM PRODUCTS:",
                    platformProducts.length
                );

                console.dir(
                    platformProducts,
                    {
                        depth: null
                    }
                );


                const watchlists =
                    await Watchlist.find({
                        productId: id
                    }).lean();


                console.log(
                    "WATCHLISTS:",
                    watchlists.length
                );

                console.dir(
                    watchlists,
                    {
                        depth: null
                    }
                );

            }

        }


        console.log(
            "\n✅ Duplicate reference inspection complete."
        );


    } catch (err) {

        console.error(
            "❌ Inspection failed:"
        );

        console.error(
            err
        );

    } finally {

        process.exit(0);

    }

})();