const { scrapeAmazon } = require('./scraper/scrape');

async function test() {
  const result = await scrapeAmazon('https://www.amazon.in/dp/B0BDJH7QX2');
  console.log(result);
}

test();
