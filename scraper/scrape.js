const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeAmazon(url) {
  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(data);

    const name = $('#productTitle').text().trim();
    const priceText = $('.a-price-whole').first().text().trim();
    const price = priceText ? parseFloat(priceText.replace(/,/g, '')) : null;

    const outOfStockText = $('#outOfStock').text().trim();
    const inStock = !outOfStockText;

    return { name, price, inStock };
  } catch (err) {
    console.error('Scrape error:', err.message);
    return { name: null, price: null, inStock: null, error: err.message };
  }
}

module.exports = { scrapeAmazon };
