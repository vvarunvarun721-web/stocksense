/*
=====================================================
PRODUCT MATCH SCORER
=====================================================

Scoring rules:

MATCHED       → full points
MISMATCHED    → 0 points
UNKNOWN       → ignored from confidence denominator
NOT_REQUESTED → ignored
*/


const WEIGHTS = {

    brand: 25,

    productName: 30,

    weight: 25,

    flavour: 10,

    model: 5,

    variant: 3,

    color: 2

};


/*
=====================================================
GET MATCH LEVEL
=====================================================
*/

function getMatchLevel(
    percentage,
    requiredFieldsMatched
) {

    if (
        percentage >= 95 &&
        requiredFieldsMatched
    ) {

        return "EXACT";

    }


    if (
        percentage >= 80
    ) {

        return "STRONG";

    }


    if (
        percentage >= 60
    ) {

        return "POSSIBLE";

    }


    return "WEAK";

}


/*
=====================================================
SCORE MATCH
=====================================================
*/

function scoreMatch(
    matchResult = {}
) {

    let earnedPoints = 0;

    let possiblePoints = 0;

    const details = {};


    for (
        const [
            attribute,
            weight
        ]
        of Object.entries(
            WEIGHTS
        )
    ) {

        const result =
            matchResult[attribute];


        if (!result) {

            continue;

        }


        const status =
            result.status ||
            "UNKNOWN";


        /*
        =============================================
        NOT REQUESTED
        =============================================
        */

        if (
            status === "NOT_REQUESTED"
        ) {

            details[attribute] = {

                status,

                points: 0,

                maxPoints: 0

            };

            continue;

        }


        /*
        =============================================
        UNKNOWN
        =============================================

        We do not have enough information.

        UNKNOWN should not be treated as a mismatch.

        We therefore exclude it from the denominator.
        */

        if (
            status === "UNKNOWN"
        ) {

            details[attribute] = {

                status,

                points: 0,

                maxPoints: 0

            };

            continue;

        }


        /*
        =============================================
        MATCHED / MISMATCHED
        =============================================
        */

        possiblePoints += weight;


        const matched =
            status === "MATCHED";


        const points =
            matched
                ? weight
                : 0;


        earnedPoints += points;


        details[attribute] = {

            status,

            points,

            maxPoints: weight

        };

    }


    /*
    =================================================
    PERCENTAGE
    =================================================
    */

    const percentage =
        possiblePoints > 0
            ? Math.round(
                (
                    earnedPoints /
                    possiblePoints
                ) * 100
            )
            : 0;


    /*
    =================================================
    CORE IDENTITY FIELDS
    =================================================

    A core field is considered okay when:

    MATCHED
    UNKNOWN
    NOT_REQUESTED

    Only an explicit MISMATCHED result fails it.
    */

    const coreFields = [

        "brand",

        "productName",

        "weight"

    ];


    const requiredFieldsMatched =
        coreFields.every(
            field => {

                const status =
                    matchResult[field]?.status;

                return (
                    status !==
                    "MISMATCHED"
                );

            }
        );


    /*
    =================================================
    FINAL LEVEL
    =================================================
    */

    const level =
        getMatchLevel(
            percentage,
            requiredFieldsMatched
        );


    return {

        score:
            percentage,

        level,

        earnedPoints,

        possiblePoints,

        requiredFieldsMatched,

        details

    };

}


module.exports = {

    WEIGHTS,

    scoreMatch,

    getMatchLevel

};