const axios = require("axios");

async function run() {

    const response = await axios.post(

        "http://localhost:5000/api/search",

        {

            query: "Boost Nutrition Drink"

        }

    );

    console.dir(response.data, { depth: null });

}

run();