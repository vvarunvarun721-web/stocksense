const { processProduct } = require("./services/pipeline/productPipeline");

async function run() {

    const result = await processProduct(
        "https://www.amazon.in/gp/product/B00J3QHWJE"
    );

    console.dir(result, {
        depth: null
    });

}

run();