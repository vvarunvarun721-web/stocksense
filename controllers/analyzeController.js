const { processProduct } = require("../services/pipeline/productPipeline");

async function analyzeProduct(req, res) {

    try {

        const { url } = req.body;

        if (!url) {

            return res.status(400).json({

                success: false,

                message: "Product URL is required."

            });

        }

        const result = await processProduct(url);

        res.json({

            success: true,

            data: result

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

    analyzeProduct

};