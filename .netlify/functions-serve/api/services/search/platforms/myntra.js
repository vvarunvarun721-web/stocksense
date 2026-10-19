const https = require("https");

const BaseAdapter = require("./baseAdapter");


class MyntraAdapter extends BaseAdapter {

    constructor() {

        super("Myntra");

        this.baseUrl =
            "https://www.myntra.com";

    }


    /*
    =====================================================
    FETCH MYNTRA SEARCH PAGE
    =====================================================
    */

    async fetchSearchPage(query) {

        const url =
            `${this.baseUrl}/search?rawQuery=${encodeURIComponent(query)}`;


        console.log(
            `Myntra URL: ${url}`
        );


        return new Promise(
            (resolve, reject) => {

                const request =
                    https.get(
                        url,
                        {
                            headers: {

                                "User-Agent":
                                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

                                "Accept":
                                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                                "Accept-Language":
                                    "en-US,en;q=0.9",

                                "Connection":
                                    "close"

                            },

                            timeout: 30000

                        },

                        response => {

                            let data = "";


                            response.setEncoding(
                                "utf8"
                            );


                            response.on(
                                "data",
                                chunk => {

                                    data += chunk;

                                }
                            );


                            response.on(
                                "end",
                                () => {

                                    if (
                                        response.statusCode < 200 ||
                                        response.statusCode >= 300
                                    ) {

                                        reject(
                                            new Error(
                                                `Myntra returned HTTP ${response.statusCode}`
                                            )
                                        );

                                        return;

                                    }


                                    resolve(data);

                                }
                            );

                        }
                    );


                request.on(
                    "timeout",
                    () => {

                        request.destroy(
                            new Error(
                                "Myntra request timed out"
                            )
                        );

                    }
                );


                request.on(
                    "error",
                    error => {

                        reject(error);

                    }
                );

            }
        );

    }


    /*
    =====================================================
    EXTRACT window.__myx JSON
    =====================================================
    */

    extractSearchData(html) {

        const marker =
            "window.__myx = ";


        const start =
            html.indexOf(marker);


        if (start === -1) {

            throw new Error(
                "Myntra search data not found"
            );

        }


        const jsonStart =
            start + marker.length;


        const scriptEnd =
            html.indexOf(
                "</script>",
                jsonStart
            );


        if (scriptEnd === -1) {

            throw new Error(
                "Myntra search data closing script not found"
            );

        }


        let jsonText =
            html
                .substring(
                    jsonStart,
                    scriptEnd
                )
                .trim();


        /*
        Remove optional semicolon
        */

        if (
            jsonText.endsWith(";")
        ) {

            jsonText =
                jsonText.slice(
                    0,
                    -1
                );

        }


        try {

            return JSON.parse(
                jsonText
            );

        } catch (error) {

            throw new Error(
                `Myntra JSON parse failed: ${error.message}`
            );

        }

    }


    /*
    =====================================================
    NORMALIZE MYNTRA PRODUCT
    =====================================================
    */

    normalizeMyntraProduct(product) {

        const productPath =
            product.landingPageUrl || "";


        const productUrl =
            productPath.startsWith("http")
                ? productPath
                : `${this.baseUrl}/${productPath}`;


        /*
        Prefer searchImage.
        Fall back to first product image.
        */

        const image =
            product.searchImage ||
            (
                product.images &&
                    product.images.length > 0
                    ? product.images[0].src
                    : null
            );


        /*
        Availability
        */

        let availability = true;


        if (
            Array.isArray(
                product.inventoryInfo
            )
        ) {

            availability =
                product.inventoryInfo.some(
                    item =>
                        item.available === true &&
                        Number(item.inventory || 0) > 0
                );

        }


        return this.normalize({

            title:
                product.productName ||
                product.product ||
                null,

            price:
                Number.isFinite(
                    Number(product.price)
                )
                    ? Number(product.price)
                    : null,

            image,

            url:
                productUrl,

            rating:
                product.rating != null
                    ? Number(product.rating)
                    : null,

            reviews:
                product.ratingCount != null
                    ? Number(product.ratingCount)
                    : null,

            availability

        });

    }


    /*
    =====================================================
    SEARCH
    =====================================================
    */

    async search(query, originalProduct) {

        console.log(
            `Myntra: Searching "${query}"`
        );


        try {

            /*
            ---------------------------------------------
            FETCH SEARCH HTML
            ---------------------------------------------
            */

            const html =
                await this.fetchSearchPage(
                    query
                );


            console.log(
                `Myntra: HTML received (${html.length} bytes)`
            );


            /*
            ---------------------------------------------
            EXTRACT EMBEDDED DATA
            ---------------------------------------------
            */

            const data =
                this.extractSearchData(
                    html
                );


            const products =
                data
                    ?.searchData
                    ?.results
                    ?.products;


            if (
                !Array.isArray(products)
            ) {

                console.log(
                    "Myntra: Product array not found"
                );

                return [];

            }


            console.log(
                `Myntra: Found ${products.length} products`
            );


            /*
            ---------------------------------------------
            NORMALIZE PRODUCTS
            ---------------------------------------------
            */

            const normalizedProducts =
                products
                    .map(
                        product => {

                            try {

                                return this.normalizeMyntraProduct(
                                    product
                                );

                            } catch (error) {

                                console.error(
                                    "Myntra product normalization failed:",
                                    error.message
                                );

                                return null;

                            }

                        }
                    )
                    .filter(Boolean);


            /*
            ---------------------------------------------
            REMOVE PRODUCTS WITHOUT TITLE / PRICE
            ---------------------------------------------
            */

            const validProducts =
                normalizedProducts.filter(
                    product =>
                        product.title &&
                        product.price != null
                );


            /*
            ---------------------------------------------
            LIMIT RESULTS
            ---------------------------------------------
            */

            const finalProducts =
                validProducts.slice(
                    0,
                    20
                );


            console.log(
                `Myntra: Returning ${finalProducts.length} products`
            );


            /*
            ---------------------------------------------
            DEBUG
            ---------------------------------------------
            */

            for (
                const product
                of finalProducts.slice(0, 5)
            ) {

                console.log(
                    `Myntra: ${product.title} → ₹${product.price}`
                );

            }


            return finalProducts;

        } catch (error) {

            console.error(
                "Myntra search failed:",
                error.message
            );


            return [];

        }

    }

}


module.exports =
    new MyntraAdapter();