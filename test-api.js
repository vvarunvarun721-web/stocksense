const axios = require("axios");

async function run() {

    const response = await axios.post(

        "http://localhost:5000/api/analyze",

        {

            url: "https://www.amazon.in/dp/B0CHX3QKQX"

        }

    );

    console.dir(response.data, {

        depth: null

    });

}

run();