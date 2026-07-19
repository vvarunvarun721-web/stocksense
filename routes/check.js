const express = require('express');
const verifyToken = require('../middleware/auth');
const { runPriceCheck } = require('../cron');

const router = express.Router();

// Manually trigger a price/stock check right now (for demos/testing)
router.post('/check-now', verifyToken, async (req, res) => {
  try {
    const results = await runPriceCheck();
    res.json({ message: 'Check complete', results });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

module.exports = router;
