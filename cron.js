const cron = require('node-cron');
const Product = require('./models/Product');
const { scrapeAmazon } = require('./scraper/scrape');

// The actual check logic — reusable by both cron AND a manual trigger route
async function runPriceCheck() {
  console.log('🔍 Running price/stock check...');
  const products = await Product.find({});
  const updates = [];

  for (const product of products) {
    const result = await scrapeAmazon(product.url);

    if (result.error) {
      console.log(`⚠️ Failed to scrape ${product.url}: ${result.error}`);
      updates.push({ url: product.url, status: 'error', error: result.error });
      continue;
    }

    const priceChanged = result.price !== null && result.price !== product.currentPrice;
    const stockChanged = result.inStock !== product.inStock;

    if (priceChanged) {
      product.priceHistory.push({ price: result.price, checkedAt: new Date() });
      product.currentPrice = result.price;
      console.log(`💰 Price changed for ${product.url}: ${result.price}`);
    }

    if (stockChanged) {
      product.inStock = result.inStock;
      console.log(`📦 Stock status changed for ${product.url}: ${result.inStock}`);
    }

    if (result.name && !product.name) {
      product.name = result.name;
    }

    if (priceChanged || stockChanged) {
      await product.save();
    }

    updates.push({
      url: product.url,
      name: product.name,
      price: product.currentPrice,
      inStock: product.inStock,
      priceChanged,
      stockChanged
    });

    // Small delay between products so we don't hammer the site all at once
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log('✅ Check complete.');
  return updates;
}

// Runs automatically every 30 minutes
cron.schedule('*/30 * * * *', () => {
  runPriceCheck();
});

console.log('⏰ Price/stock scheduler started — checking every 30 minutes.');

module.exports = { runPriceCheck };
