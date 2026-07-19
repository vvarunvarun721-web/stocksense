const BaseAdapter = require("./baseAdapter");

class CromaAdapter extends BaseAdapter {

    constructor() {

        super("Croma");

    }

    async search(queries) {

        console.log("Searching Croma...");

        return this.normalize({

            title: "Dummy Croma Product",

            price: 75000,

            image: "https://dummyimage.com",

            url: "https://amazon.in",

            availability: true

        });

    }

}

module.exports = new CromaAdapter();