const axios = require("axios");

(async () => {

    const query =
        "Boost Nutrition Drink";

    const url =
        "https://www.meesho.com/search";


    const response =
        await axios.get(
            url,
            {
                params: {
                    q: query
                },

                timeout: 15000,

                validateStatus:
                    () => true,

                headers: {

                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",

                    "Accept":
                        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                    "Accept-Language":
                        "en-IN,en;q=0.9"

                }

            }
        );


    console.log(
        "STATUS:",
        response.status
    );


    const html =
        String(
            response.data || ""
        );


    console.log(
        "HTML LENGTH:",
        html.length
    );


    /*
    =====================================================
    INTERESTING MARKERS
    =====================================================
    */

    const markers = [

        "__NEXT_DATA__",

        "__NEXT_DATA__",

        "application/ld+json",

        "application/json",

        "__APOLLO",

        "apollo",

        "redux",

        "searchresult",

        "products",

        "productId",

        "productName",

        "productname",

        "catalog",

        "catalogue",

        "price",

        "meesho"

    ];


    console.log(
        "\n========== MARKERS ==========\n"
    );


    for (
        const marker
        of markers
    ) {

        const index =
            html
                .toLowerCase()
                .indexOf(
                    marker.toLowerCase()
                );


        console.log(
            marker,
            "=>",
            index
        );

    }


    /*
    =====================================================
    EXTRACT SCRIPT TAGS
    =====================================================
    */

    const scriptRegex =
        /<script\b[^>]*>([\s\S]*?)<\/script>/gi;


    const scripts = [];


    let match;


    while (
        (
            match =
                scriptRegex.exec(
                    html
                )
        ) !== null
    ) {

        const content =
            match[1] || "";


        if (
            content.length > 100
        ) {

            scripts.push(
                content
            );

        }

    }


    console.log(
        "\nSCRIPT COUNT:",
        scripts.length
    );


    /*
    =====================================================
    PRINT ONLY INTERESTING SCRIPTS
    =====================================================
    */

    let printed = 0;


    for (
        let i = 0;
        i < scripts.length;
        i++
    ) {

        const script =
            scripts[i];


        const lower =
            script.toLowerCase();


        if (
            /product|catalog|search|apollo|redux|__next|meesho/.test(
                lower
            )
        ) {

            console.log(
                `\n========== SCRIPT ${i} ==========\n`
            );


            console.log(
                script.slice(
                    0,
                    12000
                )
            );


            printed++;


            if (
                printed >= 5
            ) {

                break;

            }

        }

    }


    /*
    =====================================================
    PRINT HTML HEAD
    =====================================================
    */

    console.log(
        "\n========== HTML HEAD ==========\n"
    );


    console.log(
        html.slice(
            0,
            6000
        )
    );


})().catch(
    console.error
);