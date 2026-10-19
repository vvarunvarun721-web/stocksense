const {

    getSearchHistory

} = require("../services/history/searchHistoryService");

async function history(req, res) {

    try {

        const {

            userId

        } = req.params;

        const data =
            await getSearchHistory(
                userId
            );

        res.json({

            success: true,

            history: data

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

module.exports = {

    history

};