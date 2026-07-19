const mongoose = require("mongoose");

const priceHistorySchema = new mongoose.Schema({

    productId: {

        type: mongoose.Schema.Types.ObjectId,

        ref: "Product",

        required: true

    },

    platform: {

        type: String,

        required: true

    },

    price: {

        type: Number,

        required: true

    },

    stock: {

        type: Boolean,

        default: true

    },

    seller: String,

    checkedAt: {

        type: Date,

        default: Date.now

    }

});

module.exports = mongoose.model(
    "PriceHistory",
    priceHistorySchema
);