const BaseAdapter = require("./baseAdapter");

class AjioAdapter extends BaseAdapter {

    constructor() {

        super("Ajio");

    }

    async search(queries) {

        console.log("Searching Ajio...");

        return this.normalize({

            title: "Dummy Ajio Product",

            price: 75000,

            image: "https://dummyimage.com",

            url: "https://amazon.in",

            availability: true

        });

    }

}

module.exports = new AjioAdapter();