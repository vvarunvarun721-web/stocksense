console.log("🔥 NEW SEARCH GENERATOR LOADED");

function generateSearchQueries(product) {

    console.log(product);

    const queries = new Set();

    const {
        brand,
        productName,
        weight,
        flavour
    } = product;

    if (brand && productName)
        queries.add(`${brand} ${productName}`);

    if (brand && productName && weight)
        queries.add(`${brand} ${productName} ${weight}`);

    if (brand && weight)
        queries.add(`${brand} ${weight}`);

    if (brand && flavour)
        queries.add(`${brand} ${flavour}`);

    return [...queries];

}

module.exports = {
    generateSearchQueries
};