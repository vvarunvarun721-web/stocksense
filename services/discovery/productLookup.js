const Product = require("../../models/Product");

async function findProducts(query) {

    return await Product.find({

        $or: [

            {
                title: {
                    $regex: query,
                    $options: "i"
                }
            },

            {
                brand: {
                    $regex: query,
                    $options: "i"
                }
            }

        ]

    });

}

module.exports = {

    findProducts

};