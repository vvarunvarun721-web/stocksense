const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  url: { type: String, required: true },
  name: { type: String, default: '' },
  currentPrice: { type: Number, default: null },
  inStock: { type: Boolean, default: null },
  priceHistory: [
    {
      price: Number,
      checkedAt: { type: Date, default: Date.now }
    }
  ],
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
