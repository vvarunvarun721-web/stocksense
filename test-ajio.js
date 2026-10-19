const ajio = require("./services/search/platforms/ajio");

async function run() {

    const originalProduct = {
        brand: "Boost",
        productName: "Chocolate Nutrition Drink Refill Pack",
        category: "beverages",
        model: null,
        variant: null,
        weight: "0.8 kg",
        flavour: "Chocolate",
        color: null
    };

    const query =
        "boost chocolate nutrition drink refill pack";

    console.log("========================================");
    console.log("AJIO DIRECT TEST");
    console.log("========================================");

    const started = Date.now();

    try {

        const results =
            await ajio.search(
                query,
                originalProduct
            );

        console.log("\n========================================");
        console.log("AJIO FINAL RESULTS");
        console.log("========================================");

        console.log(
            `Count: ${results.length}`
        );

        for (
            const product
            of results
        ) {

            console.log(
                `\n${product.title}`
            );

            console.log(
                `Price: ₹${product.price}`
            );

            console.log(
                `Brand: ${product.brand || "N/A"}`
            );

            console.log(
                `Original Price: ₹${product.originalPrice || "N/A"}`
            );

            console.log(
                `Discount: ${product.discountPercent || "N/A"}%`
            );

            console.log(
                `URL: ${product.url}`
            );

        }

        console.log(
            `\nAJIO TOTAL: ${Date.now() - started} ms`
        );

    }
    catch (error) {

        console.error(
            "AJIO TEST FAILED:",
            error
        );

    }

}

run();