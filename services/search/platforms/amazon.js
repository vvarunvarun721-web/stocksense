const genericSearch = require("../genericSearch");
const selectors = require("../../../config/selectors");
const BaseAdapter = require("./baseAdapter");

class AmazonAdapter extends BaseAdapter {

    constructor() {
        super("Amazon");
    }

    async search(queries) {

        return await genericSearch(
            selectors.amazon,
            queries[0]
        );

    }

}

module.exports = new AmazonAdapter();