const BaseAdapter = require("./baseAdapter");

class MyntraAdapter extends BaseAdapter {

    constructor() {

        super("Myntra");

    }

    async search(queries) {

        console.log("Searching Myntra...");

        return this.normalize({

            title: "Dummy Myntra Product",

            price: 75000,

            image: "https://dummyimage.com",

            url: "https://amazon.in",

            availability: true

        });

    }

}

module.exports = new MyntraAdapter();