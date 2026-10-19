require("dotenv").config();

const connectDB =
    require("./config/database");

const {
    processProduct
} = require("./services/pipeline/productPipeline");


async function run() {

    try {

        await connectDB();

        const url =
            "https://www.amazon.in/gp/product/B00J3QHWJE";

        console.log(
            "🧪 TEST URL:",
            url
        );

        const result =
            await processProduct(
                url
            );

        console.dir(
            result,
            {
                depth: null
            }
        );

    } catch (err) {

        console.error(
            "❌ Pipeline test failed:",
            err
        );

        process.exitCode = 1;

    } finally {

        process.exit();

    }

}


run();