const { searchProducts } = require("../services/discovery/searchPipeline");

const {
    saveSearch
} = require("../services/history/searchHistoryService");


async function search(req, res) {

    try {

        const {
            query,
            userId,
            category
        } = req.body || {};


        if (!query) {

            return res.status(400).json({

                success: false,

                message: "Query required"

            });

        }


        if (userId) {

            await saveSearch(
                userId,
                query
            );

        }


        const result =
            await searchProducts(
                query,
                category
            );


        res.json({

            success: true,

            ...result

        });

    }

    catch (err) {

        console.error(err);

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}


module.exports = {
    search
};