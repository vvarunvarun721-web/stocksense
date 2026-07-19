const { searchAll } = require("./services/search/manager");

async function run() {

    const queries = [

        "Samsung Galaxy S25 Ultra"

    ];

    const results = await searchAll(queries);

    console.dir(results, { depth: null });

}

run();