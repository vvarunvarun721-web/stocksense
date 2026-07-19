class BaseAdapter {

    constructor(platform) {

        this.platform = platform;

    }

    normalize(product) {

        return {

            platform: this.platform,

            title: product.title || null,

            price: product.price || null,

            image: product.image || null,

            url: product.url || null,

            availability: product.availability || false

        };

    }

}

module.exports = BaseAdapter;