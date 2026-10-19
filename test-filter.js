const { filterResults } = require("./services/search/filterResults");

const original = {
    brand: "Boost",
    productName: "Chocolate Nutrition Drink",
    weight: "800 g",
    flavour: "Chocolate"
};

const candidates = [
    {
        title: "Boost Chocolate Nutrition Drink 800 g",
        price: 334
    },
    {
        title: "Bournvita Chocolate Drink",
        price: 412
    }
];

async function run() {

    const result = await filterResults(
        original,
        candidates
    );

    console.dir(result, {
        depth: null
    });

}

run();