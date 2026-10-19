const Product = require("../../models/Product");
const PlatformProduct = require("../../models/PlatformProduct");
const PriceHistory = require("../../models/PriceHistory");

const {
    analyzePrice
} = require("../intelligence/priceAnalyzer");

async function getProductDetails(productId) {

    const product = await Product.findById(productId);

    if (!product) {
        throw new Error("Product not found");
    }

    const platforms = await PlatformProduct.find({
        productId
    });

    const history = await PriceHistory.find({
        productId
    }).sort({
        checkedAt: 1
    });

    const priceAnalysis =
        await analyzePrice(productId);

    return {

        product,

        platforms,

        history,

        priceAnalysis

    };

}

module.exports = {

    getProductDetails

};