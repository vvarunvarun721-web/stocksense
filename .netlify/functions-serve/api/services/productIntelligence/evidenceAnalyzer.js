/*
=====================================================
EVIDENCE ANALYZER
=====================================================

This module measures how much of the requested
product identity has actually been verified.

Important distinction:

MATCHED
    → Positive evidence found.

MISMATCHED
    → Explicit conflicting evidence found.

UNKNOWN
    → Not enough information.

NOT_REQUESTED
    → User did not provide this attribute.


This module returns:

1. coverage
   → How much of the requested identity matched.

2. informationCoverage
   → How much requested information was actually known.

3. evidenceQuality
   → HIGH / MEDIUM / LOW

4. verificationLevel
   → STRONG / PARTIAL / WEAK
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
GET EVIDENCE QUALITY
=====================================================

Measures how much information we actually know.

MATCHED + MISMATCHED
=
Known evidence
*/

function getEvidenceQuality(
    informationCoverage
) {

    if (
        informationCoverage >= 85
    ) {

        return "HIGH";

    }


    if (
        informationCoverage >= 60
    ) {

        return "MEDIUM";

    }


    return "LOW";

}


/*
=====================================================
GET VERIFICATION LEVEL
=====================================================

Measures how much of the requested identity
was positively verified.
*/

function getVerificationLevel(
    coverage
) {

    if (
        coverage >= 80
    ) {

        return "STRONG_VERIFICATION";

    }


    if (
        coverage >= 50
    ) {

        return "PARTIAL_VERIFICATION";

    }


    return "WEAK_VERIFICATION";

}


/*
=====================================================
ANALYZE EVIDENCE
=====================================================
*/

function analyzeEvidence(
    matchResult = {}
) {

    let requestedPoints = 0;

    let verifiedPoints = 0;

    let unknownPoints = 0;

    let mismatchPoints = 0;


    const details = {};


    /*
    =================================================
    ANALYZE EVERY ATTRIBUTE
    =================================================
    */

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
            status ===
            "NOT_REQUESTED"
        ) {

            details[attribute] = {

                status,

                requested:
                    false,

                weight:
                    0

            };

            continue;

        }


        /*
        =============================================
        REQUESTED ATTRIBUTE
        =============================================
        */

        requestedPoints += weight;


        /*
        =============================================
        MATCHED
        =============================================
        */

        if (
            status ===
            "MATCHED"
        ) {

            verifiedPoints +=
                weight;

        }


        /*
        =============================================
        UNKNOWN
        =============================================
        */

        else if (
            status ===
            "UNKNOWN"
        ) {

            unknownPoints +=
                weight;

        }


        /*
        =============================================
        MISMATCHED
        =============================================
        */

        else if (
            status ===
            "MISMATCHED"
        ) {

            mismatchPoints +=
                weight;

        }


        /*
        =============================================
        DETAILS
        =============================================
        */

        details[attribute] = {

            status,

            requested:
                true,

            weight

        };

    }


    /*
    =================================================
    POSITIVE EVIDENCE COVERAGE
    =================================================

    What percentage of the requested product
    information was positively verified?
    */

    const coverage =
        requestedPoints > 0
            ? Math.round(

                (
                    verifiedPoints /
                    requestedPoints
                ) * 100

            )
            : 0;


    /*
    =================================================
    INFORMATION COVERAGE
    =================================================

    MATCHED + MISMATCHED

    Both mean we actually know something.

    UNKNOWN means information is missing.
    */

    const knownPoints =
        verifiedPoints +
        mismatchPoints;


    const informationCoverage =
        requestedPoints > 0
            ? Math.round(

                (
                    knownPoints /
                    requestedPoints
                ) * 100

            )
            : 0;


    /*
    =================================================
    EVIDENCE QUALITY
    =================================================
    */

    const evidenceQuality =
        getEvidenceQuality(
            informationCoverage
        );


    /*
    =================================================
    VERIFICATION LEVEL
    =================================================
    */

    const verificationLevel =
        getVerificationLevel(
            coverage
        );


    /*
    =================================================
    RETURN
    =================================================
    */

    return {

        coverage,

        informationCoverage,

        evidenceQuality,

        verificationLevel,

        requestedPoints,

        verifiedPoints,

        unknownPoints,

        mismatchPoints,

        knownPoints,

        details

    };

}


module.exports = {

    analyzeEvidence,

    getEvidenceQuality,

    getVerificationLevel

};