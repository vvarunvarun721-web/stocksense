const mongoose = require("mongoose");

const priceHistorySchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    /*
            =================================================
            EXACT SOURCE URL
            =================================================
            Keeps price history separated for every
            individual marketplace URL.
            =================================================
            */

    sourceUrl: {
      type: String,
      required: true,
      index: true,
    },

    platform: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      default: null,
    },

    stock: {
      type: Boolean,
      default: null,
    },

    seller: {
      type: String,
      default: null,
    },

    checkedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },

  {
    timestamps: true,
  },
);

/*
=========================================================
COMPOUND INDEX
=========================================================

Allows StockSense to quickly fetch:

product + exact URL + newest/oldest history

=========================================================
*/

priceHistorySchema.index({
  productId: 1,

  sourceUrl: 1,

  checkedAt: -1,
});

module.exports = mongoose.model("PriceHistory", priceHistorySchema);
