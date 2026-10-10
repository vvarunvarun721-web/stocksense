function formatResponse(products) {

    const platforms = new Set();

    products.forEach(product => {

        if (product.platform) {

            platforms.add(product.platform);

        }

    });

    return {

        totalPlatforms: platforms.size,

        totalProducts: products.length,

        products

    };

}

module.exports = {

    formatResponse

};