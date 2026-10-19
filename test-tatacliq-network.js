const axios = require("axios");

(async () => {

    const response = await axios.get(
        "https://searchbff.tatacliq.com/products/mpl/search",
        {
            params: {
                searchText:
                    "Boost Nutrition Drink:relevance:inStockFlag:true",

                isKeywordRedirect: "false",
                isKeywordRedirectEnabled: "true",
                channel: "WEB",
                isMDE: "true",
                isTextSearch: "false",
                isFilter: "false",
                qc: "false",
                page: 0,
                mcvid: "",
                customerId: "",
                isSuggested: "false",
                isFilterDataRequired: "true",
                isPwa: "true",
                pageSize: 40,
                typeID: "all"
            },

            headers: {
                Accept:
                    "application/json, text/plain, */*",

                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",

                "Accept-Language":
                    "en-IN,en;q=0.9",

                Referer:
                    "https://www.tatacliq.com/search/?searchCategory=all&text=Boost%20Nutrition%20Drink",

                Origin:
                    "https://www.tatacliq.com"
            },

            timeout: 20000
        }
    );

    console.log("STATUS:", response.status);

    console.log(
        "\nTOP LEVEL KEYS:"
    );

    console.log(
        Object.keys(
            response.data || {}
        )
    );

    console.log(
        "\nRAW RESPONSE SHAPE:"
    );

    console.dir(
        response.data,
        {
            depth: 5,
            maxArrayLength: 3
        }
    );

})().catch(err => {

    console.error(
        "Tata CLiQ API inspection failed:",
        err.message
    );

});