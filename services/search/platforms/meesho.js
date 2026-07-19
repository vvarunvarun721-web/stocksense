const BaseAdapter = require("./baseAdapter");

class MeeshoAdapter extends BaseAdapter {

    constructor() {

        super("Meesho");

    }

    async search(queries) {

        console.log("Searching Meesho...");

        return this.normalize({

            title: "Dummy Meesho Product",

            price: 75000,

            image: "https://dummyimage.com",

            url: "https://amazon.in",

            availability: true

        });

    }

}

module.exports = new MeeshoAdapter();