const BaseAdapter = require("./baseAdapter");

class FlipkartAdapter extends BaseAdapter {

    constructor() {

        super("Flipkart");

    }

    async search(queries) {

        console.log("Searching Flipkart...");

        return this.normalize({

            title: "Dummy Flipkart Product",

            price: 75000,

            image: "https://dummyimage.com",

            url: "https://amazon.in",

            availability: true

        });

    }

}

module.exports = new FlipkartAdapter();