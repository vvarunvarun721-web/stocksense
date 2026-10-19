function recommendProducts(products) {

    if (!products.length) {

        return {

            bestDeal: null,

            alternatives: []

        };

    }

    // Sort by lowest price
    const sorted = [...products].sort(
        (a, b) => a.price - b.price
    );

    const bestDeal = sorted[0];

    const alternatives = sorted.slice(1);

    const savings =
        alternatives.length > 0
            ? alternatives[0].price - bestDeal.price
            : 0;

    return {

        bestDeal: {

            ...bestDeal,

            savings

        },

        alternatives

    };

}

module.exports = {

    recommendProducts

};