const platformRanking =
    require("./platformRanking");

function normalizeCategory(
    category
) {

    if (
        !category
    ) {

        return "electronics";

    }


    const normalized =
        String(category)
            .toLowerCase()
            .trim();


    const aliases = {

        /*
        =============================================
        ELECTRONICS
        =============================================
        */

        electronic:
            "electronics",

        electronics:
            "electronics",


        /*
        =============================================
        FASHION
        =============================================
        */

        fashion:
            "fashion",

        clothes:
            "fashion",

        clothing:
            "fashion",

        footwear:
            "fashion",

        shoes:
            "fashion",


        /*
        =============================================
        GROCERIES
        =============================================
        */

        grocery:
            "groceries",

        groceries:
            "groceries",

        food:
            "groceries",


        /*
        =============================================
        BEVERAGES
        =============================================
        */

        beverage:
            "beverages",

        beverages:
            "beverages",

        drinks:
            "beverages",

        drink:
            "beverages",


        /*
        =============================================
        BEAUTY / PERSONAL CARE
        =============================================
        */

        beauty:
            "beauty",

        skincare:
            "beauty",

        "skin care":
            "beauty",

        cosmetics:
            "beauty",

        makeup:
            "beauty",

        "personal care":
            "beauty",

        personalcare:
            "beauty",

        fragrance:
            "beauty",

        fragrances:
            "beauty",

        perfume:
            "beauty",

        perfumes:
            "beauty",

        haircare:
            "beauty",

        "hair care":
            "beauty",


        /*
        =============================================
        HOME
        =============================================
        */

        home:
            "home",

        kitchen:
            "home",

        "home & kitchen":
            "home",

        "home appliances":
            "home"

    };


    return (
        aliases[normalized] ||
        "electronics"
    );

}

function getPlatformsForCategory(
    category
) {

    const normalizedCategory =
        normalizeCategory(
            category
        );


    return (
        platformRanking[
        normalizedCategory
        ] ||
        []
    );

}

module.exports = {

    normalizeCategory,

    getPlatformsForCategory

};