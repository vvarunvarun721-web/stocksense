const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }, // stores HASHED password, never plain text
  watchlist: [
    { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }
  ]
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
