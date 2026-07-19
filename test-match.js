require("dotenv").config();

const { matchProducts } = require("./services/ai/matcher");

async function run() {

    const amazon = {

        brand: "Samsung",
        model: "Galaxy S25 Ultra",
        ram: "12GB",
        storage: "256GB",
        color: "Titanium Black"

    };

    const flipkart = {

        brand: "Samsung",
        model: "S25 Ultra",
        ram: "12GB",
        storage: "256GB",
        color: "Black"

    };

    const result = await matchProducts(
        amazon,
        flipkart
    );

    console.log(result);

}

run();