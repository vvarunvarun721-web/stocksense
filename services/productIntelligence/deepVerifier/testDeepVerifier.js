const {
    deepVerifyProduct
} = require("../deepVerifier");


/*
=====================================================
REQUESTED PRODUCT
=====================================================
*/

const requestedProduct = {

    brand:
        "Boost",

    productName:
        "Energy Nutrition Drink",

    weight:
        "800g",

    flavour:
        "Chocolate"

};


/*
=====================================================
TEST CASES
=====================================================
*/

const testCases = [


    /*
    =============================================
    CASE 1

    Title incomplete

    But structured information proves identity.
    =============================================
    */

    {

        name:
            "INCOMPLETE TITLE WITH STRUCTURED EVIDENCE",

        candidate: {

            title:
                "Boost Nutrition Drink Chocolate",

            weight:
                "800g",

            flavour:
                "Chocolate"

        }

    },


    /*
    =============================================
    CASE 2

    Still missing important information.
    =============================================
    */

    {

        name:
            "INSUFFICIENT EVIDENCE",

        candidate: {

            title:
                "Boost Nutrition Drink"

        }

    },


    /*
    =============================================
    CASE 3

    Structured data reveals wrong weight.
    =============================================
    */

    {

        name:
            "WRONG STRUCTURED WEIGHT",

        candidate: {

            title:
                "Boost Nutrition Drink Chocolate",

            weight:
                "500g",

            flavour:
                "Chocolate"

        }

    }


];


for (
    const testCase
    of testCases
) {


    console.log("\n");

    console.log(
        "========================================"
    );

    console.log(
        `TEST: ${testCase.name}`
    );

    console.log(
        "========================================"
    );


    const result =

        deepVerifyProduct(

            requestedProduct,

            testCase.candidate

        );


    console.log(
        "\nDEEP VERIFICATION RESULT:"
    );


    console.dir(

        result,

        {
            depth:
                null
        }

    );


}