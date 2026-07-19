const registry = require("./registry");

async function searchAll(queries) {

    const searches = registry.map(platform =>
        platform.search(queries)
    );

    const results = await Promise.allSettled(searches);

    return results;
}

module.exports = {
    searchAll
};