const BaseAdapter = require("./baseAdapter");

class TatacliqAdapter extends BaseAdapter {

    constructor() {

        super("Tatacliq");

    }

    async search(queries) {

        console.log("Searching Tatacliq...");

        return this.normalize({

            title: "Dummy Tatacliq Product",

            price: 75000,

            image: "https://dummyimage.com",

            url: "https://amazon.in",

            availability: true

        });

    }

}

module.exports = new TatacliqAdapter();