class BaseAdapter {

    constructor(platform) {

        this.platform = platform;

    }


    normalize(product) {

        return {

            platform:
                this.platform,

            title:
                product.title ??
                null,

            price:
                product.price ??
                null,

            image:
                product.image ??
                null,

            url:
                product.url ??
                null,

            rating:
                product.rating ??
                null,

            reviews:
                product.reviews ??
                null,

            availability:
                product.availability ??
                false

        };

    }


    async search(query) {

        throw new Error(
            `${this.platform} search() not implemented`
        );

    }

}


module.exports = BaseAdapter;