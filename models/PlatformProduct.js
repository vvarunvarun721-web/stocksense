const mongoose = require("mongoose");

const platformProductSchema = new mongoose.Schema(

    {

        productId: {

            type: mongoose.Schema.Types.ObjectId,

            ref: "Product",

            required: true

        },

        platform: {

            type: String,

            required: true

        },

        url: {

            type: String,

            required: true

        },

        title: String,

        image: String,

        seller: String,

        rating: Number,

        reviews: Number,

        availability: Boolean,

        latestPrice: Number,

        lastChecked: {

            type: Date,

            default: Date.now

        }

    },

    {

        timestamps: true

    }

);

platformProductSchema.index({

    productId: 1,

    platform: 1

}, {

    unique: true

});

module.exports = mongoose.model(

    "PlatformProduct",

    platformProductSchema

);