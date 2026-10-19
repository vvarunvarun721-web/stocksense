const PriceHistory = require("../../models/PriceHistory");

async function detectPriceEvent(productId) {

    const history = await PriceHistory
        .find({ productId })
        .sort({ checkedAt: -1 })
        .limit(2);

    if (history.length < 2) {

        return {

            event: "NONE",

            message: "Not enough history"

        };

    }

    const latest = history[0];
    const previous = history[1];

    if (latest.price < previous.price) {

        return {

            event: "PRICE_DROP",

            amount: previous.price - latest.price,

            previousPrice: previous.price,

            currentPrice: latest.price

        };

    }

    if (latest.price > previous.price) {

        return {

            event: "PRICE_INCREASE",

            amount: latest.price - previous.price,

            previousPrice: previous.price,

            currentPrice: latest.price

        };

    }

    return {

        event: "NO_CHANGE",

        currentPrice: latest.price

    };

}

module.exports = {

    detectPriceEvent

};