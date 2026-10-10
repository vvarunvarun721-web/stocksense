const {

    addToWatchlist,

    getWatchlist,

    removeFromWatchlist

} = require("../services/watchlist/watchlistService");

async function add(req, res) {

    try {

        const {

            userId,

            productId,

            targetPrice

        } = req.body;

        const item =
            await addToWatchlist(
                userId,
                productId,
                targetPrice
            );

        res.json({

            success: true,

            watchlist: item

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

async function list(req, res) {

    try {

        const {

            userId

        } = req.params;

        const items =
            await getWatchlist(userId);

        res.json({

            success: true,

            items

        });

    }

    catch (err) {

        res.status(500).json({

            success: false,

            message: err.message

        });

    }

}

async function remove(req, res) {

    try {

        const {

            userId,

            productId

        } = req.body;

        await removeFromWatchlist(

            userId,

            productId

        );

        res.json({

            success: true

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

    add,

    list,

    remove

};