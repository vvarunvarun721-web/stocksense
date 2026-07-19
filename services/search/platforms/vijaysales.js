const BaseAdapter = require("./baseAdapter");

class VijaysalesAdapter extends BaseAdapter {

    constructor() {

        super("Vijaysales");

    }

    async search(queries) {

        console.log("Searching Vijaysales...");

        return this.normalize({

            title: "Dummy Vijaysales Product",

            price: 75000,

            image: "https://dummyimage.com",

            url: "https://amazon.in",

            availability: true

        });

    }

}

module.exports = new VijaysalesAdapter();