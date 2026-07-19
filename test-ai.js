require("dotenv").config();
console.log(process.env.GROQ_API_KEY);

const { normalizeProduct } = require("./services/ai/normalize");

async function run() {

    const result = await normalizeProduct(

        "Samsung Galaxy S25 Ultra 12GB RAM 256GB Titanium Black"

    );

    console.log(result);

}

run();