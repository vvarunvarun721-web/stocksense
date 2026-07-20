const flipkart = require("./services/search/platforms/flipkart");

async function run() {

    const products = await flipkart.search(
        "Boost Chocolate Nutrition Drink 800 g"
    );

    console.dir(products, {
        depth: null
    });

}

run();