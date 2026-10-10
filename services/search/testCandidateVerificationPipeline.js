/*
=====================================================
TEST CANDIDATE VERIFICATION PIPELINE
=====================================================
*/


const {
    verifyCandidates
} = require(
    "./candidateVerificationPipeline"
);



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
CANDIDATES

These normally come from CandidateCollector.
=====================================================
*/


const candidates = [

    /*
    =============================================
    EXACT
    =============================================
    */

    {

        title:
            "BOOST Energy Nutrition Drink Chocolate 800 g",

        platform:
            "Amazon",

        price:
            334

    },


    /*
    =============================================
    INCOMPLETE BUT POSSIBLY SAME
    =============================================
    */

    {

        title:
            "Boost Nutrition Drink Chocolate",

        platform:
            "Flipkart",

        price:
            320,

        weight:
            "800g",

        flavour:
            "Chocolate"

    },


    /*
    =============================================
    WRONG WEIGHT
    =============================================
    */

    {

        title:
            "BOOST Energy Nutrition Drink Chocolate 500 g",

        platform:
            "Meesho",

        price:
            250

    },


    /*
    =============================================
    DIFFERENT BRAND
    =============================================
    */

    {

        title:
            "Horlicks Health Nutrition Drink Chocolate 800 g",

        platform:
            "Amazon",

        price:
            350

    },


    /*
    =============================================
    WRONG FLAVOUR
    =============================================
    */

    {

        title:
            "BOOST Energy Nutrition Drink Vanilla 800 g",

        platform:
            "Flipkart",

        price:
            330

    }

];



/*
=====================================================
RUN TEST
=====================================================
*/


async function runTest() {

    console.log("\n");

    console.log(
        "🚀 STOCKSENSE PRODUCT VERIFICATION TEST"
    );


    const result =
        await verifyCandidates(

            requestedProduct,

            candidates

        );


    console.log("\n");

    console.log(
        "========================================"
    );

    console.log(
        "📊 FINAL VERIFICATION RESULT"
    );

    console.log(
        "========================================"
    );


    console.dir(

        result,

        {

            depth:
                null

        }

    );


    /*
    =============================================
    ACCEPTED PRODUCTS
    =============================================
    */

    console.log("\n");

    console.log(
        "✅ ACCEPTED PRODUCTS"
    );


    for (
        const item of result.accepted
    ) {

        console.log({

            title:
                item.candidate.title,

            platform:
                item.candidate.platform,

            price:
                item.candidate.price,

            verification:
                item.verification

        });

    }


    /*
    =============================================
    REJECTED PRODUCTS
    =============================================
    */

    console.log("\n");

    console.log(
        "❌ REJECTED PRODUCTS"
    );


    for (
        const item of result.rejected
    ) {

        console.log({

            title:
                item.candidate.title,

            platform:
                item.candidate.platform,

            price:
                item.candidate.price,

            verification:
                item.verification

        });

    }

}



/*
=====================================================
START
=====================================================
*/


runTest()

    .catch(

        error => {

            console.error(

                "\n❌ TEST FAILED:",

                error

            );

        }

    );