const { generateSearchQueries } = require("./services/ai/searchGenerator");

const product = {
    brand: "Boost",
    productName: "Chocolate Nutrition Drink",
    weight: "800 g",
    flavour: "Chocolate"
};

console.log(generateSearchQueries(product));