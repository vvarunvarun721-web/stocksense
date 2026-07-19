const BaseAdapter = require("./baseAdapter");

class RelianceAdapter extends BaseAdapter {

    constructor() {

        super("Reliance");

    }

    async search(queries) {

        console.log("Searching Reliance...");

        return this.normalize({

            title: "Dummy Reliance Product",

            price: 75000,

            image: "https://dummyimage.com",

            url: "https://amazon.in",

            availability: true

        });

    }

}

module.exports = new RelianceAdapter();