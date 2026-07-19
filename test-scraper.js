const { scrapeProduct } = require("./scraper");

async function run() {

  const product = await scrapeProduct(
    "https://www.amazon.in/gp/product/B00J3QHWJE/ref=ox_sc_act_title_2?smid=A15APWRK6P7LBV&psc=1"
  );

  console.log(product);

}

run();