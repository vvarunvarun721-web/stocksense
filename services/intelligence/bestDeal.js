function findBestDeal(products) {

    if (!products.length) {

        return null;

    }

    return products.reduce(

        (best, current) =>

            current.price < best.price

                ? current

                : best

    );

}

module.exports = {

    findBestDeal

};