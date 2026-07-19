const express = require('express');
const Product = require('../models/Product');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// ADD a product to track (protected route)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ message: 'Product URL is required' });
    }

    const newProduct = new Product({
      url,
      addedBy: req.userId
    });

    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET all products for the logged-in user
router.get('/', verifyToken, async (req, res) => {
  try {
    const products = await Product.find({ addedBy: req.userId });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE a product (only if it belongs to the logged-in user)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const product = await Product.findOne({ _id: req.params.id, addedBy: req.userId });

    if (!product) {
      return res.status(404).json({ message: 'Product not found or not yours' });
    }

    await product.deleteOne();
    res.json({ message: 'Product removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
