const {
    matchProduct
} = require("./productMatcher");

const {
    scoreMatch
} = require("./matchScorer");

const {
    validateIdentity
} = require("./identityValidator");

const {
    analyzeEvidence
} = require("./evidenceAnalyzer");

const {
    analyzeProduct
} = require("./productDecisionEngine");


const originalProduct = {
    brand: "Boost",

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

    {
        name: "EXACT PRODUCT",

        title:
            "BOOST Energy & Nutrition Drink Chocolate 800 g"
    },


    {
        name: "WRONG WEIGHT",

        title:
            "BOOST Energy & Nutrition Drink Chocolate 500 g"
    },


    {
        name: "WRONG FLAVOUR",

        title:
            "BOOST Energy & Nutrition Drink Vanilla 800 g"
    },


    {
        name: "COMPLETELY DIFFERENT BRAND",

        title:
            "Horlicks Health Nutrition Drink Chocolate 800 g"
    },


    {
        name: "PARTIAL PRODUCT",

        title:
            "Boost Nutrition Drink Chocolate"
    }

];


for (const testCase of testCases) {

    console.log("\n");
    console.log("========================================");

    console.log(
        `TEST: ${testCase.name}`
    );

    console.log(
        `TITLE: ${testCase.title}`
    );

    console.log("========================================");


    const matchResult =
        matchProduct(
            originalProduct,
            {
                title:
                    testCase.title
            }
        );


    const score =
        scoreMatch(
            matchResult
        );

    const identity =
        validateIdentity(matchResult);

    const evidence =
        analyzeEvidence(matchResult);

    const result =
        analyzeProduct(
            originalProduct,
            {
                title:
                    testCase.title
            }
        );

    console.log("\nMATCH RESULT:");

    console.dir(
        matchResult,
        {
            depth: null
        }
    );


    console.log("\nFINAL SCORE:");

    console.dir(
        score,
        {
            depth: null
        }
    );

    console.log("\nIDENTITY VALIDATION:");

    console.dir(
        identity,
        {
            depth: null
        }
    );

    console.log("\nEVIDENCE ANALYSIS:");

    console.dir(
        evidence,
        {
            depth: null
        }
    );

    console.log("\nCOMPLETE PRODUCT ANALYSIS:");

    console.dir(
        result,
        {
            depth: null
        }
    );

}