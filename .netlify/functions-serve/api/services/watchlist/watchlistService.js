const Watchlist = require("../../models/Watchlist");
async function addToWatchlist(

    userId,

    productId,

    targetPrice = null

) {

    const exists = await Watchlist.findOne({

        userId,

        productId

    });

    if (exists) {

        return exists;

    }

    return await Watchlist.create({

        userId,

        productId,

        targetPrice

    });

}

async function getWatchlist(userId) {

    return await Watchlist
        .find({ userId })
        .populate("productId");

}

async function removeFromWatchlist(userId, productId) {

    return await Watchlist.deleteOne({

        userId,

        productId

    });

}

module.exports = {

    addToWatchlist,

    getWatchlist,

    removeFromWatchlist

};