const {

    findBestDeal

} = require("./bestDeal");

const {

    calculateSavings

} = require("./savings");

const {

    recommend

} = require("./recommendation");

function buildResponse(

    originalProduct,

    matchedProducts

) {

    const bestDeal =

        findBestDeal(matchedProducts);

    const recommendation =

        recommend(matchedProducts);

    const savings =

        bestDeal

            ? calculateSavings(

                originalProduct.currentPrice,

                bestDeal.price

            )

            : null;

    return {

        originalProduct,

        bestDeal,

        recommendation,

        savings,

        matchedProducts

    };

}

module.exports = {

    buildResponse

};