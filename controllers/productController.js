const {
    getProductDetails
} = require("../services/product/productDetailsService");

async function getProduct(req, res) {

    try {

        const { id } = req.params;

        const product =
            await getProductDetails(id);

        res.json({

            success: true,

            data: product

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

module.exports = {

    getProduct

};