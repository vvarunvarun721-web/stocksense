const mongoose = require("mongoose");

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,

    ref: "User",

    required: true,
  },

  productId: {
    type: mongoose.Schema.Types.ObjectId,

    ref: "Product",

    required: true,
  },

  targetPrice: {
    type: Number,

    default: null,
  },

  notifyOnDrop: {
    type: Boolean,

    default: true,
  },

  lastNotifiedPrice: {
    type: Number,
    default: null,
  },

  notifyOnRestock: {
    type: Boolean,

    default: false,
  },

  lastAvailability: {
    type: String,

    enum: ["IN_STOCK", "OUT_OF_STOCK", "UNKNOWN"],

    default: "UNKNOWN",
  },

  lastRestockNotified: {
    type: Boolean,

    default: false,
  },

  sourceUrl: {
    type: String,

    default: null,
  },

  createdAt: {
    type: Date,

    default: Date.now,
  },
});

module.exports = mongoose.model("Watchlist", watchlistSchema);
