const { generateQueries } = require("./services/ai/searchGenerator");

const product = {
    brand: "Samsung",
    model: "Galaxy S25 Ultra",
    storage: "256GB",
    ram: "12GB",
    color: "Titanium Black"
};

console.log(generateQueries(product));