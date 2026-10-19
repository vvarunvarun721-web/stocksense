"use strict";


/*
=====================================================

CANDIDATE VERIFICATION PIPELINE

=====================================================

Pipeline:

Candidates
    ↓
Fast Deterministic Verification
    ↓
Accepted / Rejected
    ↓
Top N Deep Verification
    ↓
Accepted / Rejected / AI
    ↓
Final buckets


IMPORTANT:

This file does NOT call AI directly.
=====================================================
*/


const {
    analyzeProduct
} = require(
    "../productIntelligence/productDecisionEngine"
);


const {
    deepVerifyProduct
} = require(
    "../productIntelligence/deepVerifier"
);


const {
    REQUEST_MODES,
    getRequestMode
} = require(
    "./stocksenseRequestMode"
);


/*
=====================================================
PERFORMANCE CONFIGURATION
=====================================================
*/

const VERIFICATION_CONFIG = {

    /*
    Never deep-verify every candidate.

    CandidateCollector may produce 8-10 candidates.
    We only deeply inspect the strongest few.
    */

    MAX_DEEP_CANDIDATES:
        5,


    /*
    Keep AI/deep candidates bounded.
    */

    MAX_AI_CANDIDATES:
        5,


    /*
    Defensive limit for very large input.
    */

    MAX_INPUT_CANDIDATES:
        30
};


/*
=====================================================
VERIFY SINGLE CANDIDATE
=====================================================
*/

function verifyCandidate(
    requestedProduct,
    candidate
) {

    /*
    =================================================
    BASIC SAFETY
    =================================================
    */

    if (
        !candidate ||
        typeof candidate !== "object"
    ) {

        return {

            status:
                "REJECTED",

            verification:
                "INVALID_CANDIDATE",

            candidate,

            analysis:
                null
        };
    }


    /*
    =================================================
    FAST PRODUCT ANALYSIS
    =================================================
    */

    const analysis =
        analyzeProduct(
            requestedProduct,
            candidate
        );


    const decision =
        analysis?.decision?.decision ||
        "VERIFY_MORE";


    const requestMode =
        getRequestMode(
            requestedProduct
        );


    console.log(
        `🔎 VERIFY: ${candidate.title || candidate.productName || "UNKNOWN"}`
    );


    console.log(
        `📊 DECISION: ${decision}`
    );


    /*
    =================================================
    VISUAL REQUEST
    =================================================
    */

    if (
        requestMode ===
        REQUEST_MODES.VISUAL
    ) {

        const clearRejections = [

            "DIFFERENT_VARIANT",

            "REJECT_DIFFERENT_PRODUCT",

            "REJECT"

        ];


        if (
            clearRejections.includes(
                decision
            )
        ) {

            return {

                status:
                    "REJECTED",

                verification:
                    "VISUAL_CLEAR_CONFLICT",

                candidate,

                analysis
            };
        }


        return {

            status:
                "NEEDS_AI",

            verification:
                "VISUAL_AI_REQUIRED",

            candidate,

            analysis
        };
    }


    /*
    =================================================
    EXACT
    =================================================
    */

    if (
        decision ===
        "SHOW_EXACT"
    ) {

        return {

            status:
                "ACCEPTED",

            verification:
                "EXACT",

            candidate,

            analysis
        };
    }


    /*
    =================================================
    STRONG
    =================================================
    */

    if (
        decision ===
        "SHOW_STRONG"
    ) {

        return {

            status:
                "ACCEPTED",

            verification:
                "STRONG",

            candidate,

            analysis
        };
    }


    /*
    =================================================
    CLEAR REJECTIONS
    =================================================
    */

    const clearRejections = [

        "DIFFERENT_VARIANT",

        "REJECT_DIFFERENT_PRODUCT",

        "REJECT"

    ];


    if (
        clearRejections.includes(
            decision
        )
    ) {

        return {

            status:
                "REJECTED",

            verification:
                "CLEAR_CONFLICT",

            candidate,

            analysis
        };
    }


    /*
    =================================================
    UNCERTAIN
    =================================================
    */

    return {

        status:
            "NEEDS_DEEP_VERIFICATION",

        verification:
            "UNCERTAIN",

        candidate,

        analysis
    };
}


/*
=====================================================
DEEP CANDIDATE PRIORITY
=====================================================

Higher score first.

We use the deterministic score produced by
Product Decision Engine.

=====================================================
*/

function getDeepPriority(
    item
) {

    const score =
        Number(
            item?.analysis?.score?.score ||
            0
        );


    const coverage =
        Number(
            item?.analysis?.evidence?.coverage ||
            0
        );


    const informationCoverage =
        Number(
            item?.analysis?.evidence?.informationCoverage ||
            0
        );


    return (
        score * 0.6 +
        coverage * 0.2 +
        informationCoverage * 0.2
    );
}


/*
=====================================================
SELECT TOP DEEP CANDIDATES
=====================================================
*/

function selectDeepCandidates(
    deepQueue
) {

    return deepQueue
        .slice()
        .sort(
            (
                a,
                b
            ) =>
                getDeepPriority(b) -
                getDeepPriority(a)
        )
        .slice(
            0,
            VERIFICATION_CONFIG.MAX_DEEP_CANDIDATES
        );
}


/*
=====================================================
VERIFY ALL CANDIDATES
=====================================================
*/

async function verifyCandidates(
    requestedProduct,
    candidates = []
) {

    const startedAt =
        Date.now();


    /*
    =================================================
    RESULT BUCKETS
    =================================================
    */

    const accepted =
        [];

    const rejected =
        [];

    const uncertain =
        [];

    const deepQueue =
        [];


    /*
    =================================================
    SAFETY
    =================================================
    */

    if (
        !Array.isArray(
            candidates
        )
    ) {

        console.warn(
            "⚠️ Candidates is not an array"
        );

        candidates =
            [];
    }


    /*
    Defensive input limit.
    */

    const inputCandidates =
        candidates.slice(
            0,
            VERIFICATION_CONFIG.MAX_INPUT_CANDIDATES
        );


    console.log(
        "\n========================================"
    );


    console.log(
        "🚀 STARTING CANDIDATE VERIFICATION"
    );


    console.log(
        "TOTAL CANDIDATES:",
        inputCandidates.length
    );


    console.log(
        "========================================"
    );


    /*
    =================================================
    FIRST PASS
    FAST DETERMINISTIC VERIFICATION
    =================================================
    */

    console.log(
        "\n⚡ FIRST PASS: FAST VERIFICATION"
    );


    for (
        const candidate
        of inputCandidates
    ) {

        try {

            const result =
                verifyCandidate(
                    requestedProduct,
                    candidate
                );


            /*
            ACCEPTED
            */

            if (
                result.status ===
                "ACCEPTED"
            ) {

                accepted.push(
                    result
                );

                continue;
            }


            /*
            REJECTED
            */

            if (
                result.status ===
                "REJECTED"
            ) {

                rejected.push(
                    result
                );

                continue;
            }


            /*
            VISUAL → AI
            */

            if (
                result.verification ===
                "VISUAL_AI_REQUIRED"
            ) {

                uncertain.push(
                    result
                );

                continue;
            }


            /*
            EVERYTHING ELSE → DEEP QUEUE
            */

            deepQueue.push(
                result
            );

        } catch (error) {

            console.error(
                "❌ Candidate verification failed:",
                error.message
            );


            uncertain.push({

                status:
                    "NEEDS_AI",

                verification:
                    "FAST_VERIFICATION_ERROR",

                candidate,

                error:
                    error.message
            });
        }
    }


    /*
    =================================================
    FIRST PASS SUMMARY
    =================================================
    */

    console.log(
        "\n📊 FIRST PASS SUMMARY"
    );


    console.log({

        accepted:
            accepted.length,

        rejected:
            rejected.length,

        deepQueue:
            deepQueue.length,

        uncertain:
            uncertain.length

    });


    /*
    =================================================
    IMPORTANT PERFORMANCE FIX
    =================================================

    OLD:

        deepQueue.map(...)
        ALL candidates

    NEW:

        Sort by deterministic confidence
        ↓
        Select only top 5
    =================================================
    */

    const selectedDeepCandidates =
        selectDeepCandidates(
            deepQueue
        );


    const skippedDeepCandidates =
        Math.max(
            0,
            deepQueue.length -
            selectedDeepCandidates.length
        );


    console.log(
        `🧠 Deep candidates selected: ${selectedDeepCandidates.length}/${deepQueue.length}`
    );


    if (
        skippedDeepCandidates > 0
    ) {

        console.log(
            `⏭️ Skipped ${skippedDeepCandidates} lower-priority deep candidates`
        );
    }


    /*
    =================================================
    SECOND PASS
    DEEP DETERMINISTIC VERIFICATION
    =================================================
    */

    if (
        selectedDeepCandidates.length >
        0
    ) {

        console.log(
            "\n🧠 SECOND PASS: DEEP VERIFICATION"
        );
    }


    /*
    =================================================
    RUN DEEP VERIFICATION CONCURRENTLY
    =================================================
    */

    const deepResults =
        await Promise.all(
            selectedDeepCandidates.map(
                async item => {

                    const title =
                        item?.candidate?.title ||
                        item?.candidate?.productName ||
                        "UNKNOWN";


                    console.log(
                        `🧠 DEEP VERIFYING: ${title}`
                    );


                    try {

                        const deepResult =
                            await deepVerifyProduct(
                                requestedProduct,
                                item.candidate
                            );


                        return {

                            item,

                            deepResult,

                            error:
                                null
                        };

                    } catch (error) {

                        return {

                            item,

                            deepResult:
                                null,

                            error
                        };
                    }
                }
            )
        );


    /*
    =================================================
    PROCESS DEEP RESULTS
    =================================================
    */

    for (
        const result
        of deepResults
    ) {

        const {
            item,
            deepResult,
            error
        } = result;


        /*
        ERROR
        */

        if (
            error
        ) {

            console.error(
                "❌ Deep verification failed:",
                error.message
            );


            uncertain.push({

                status:
                    "NEEDS_AI",

                verification:
                    "DEEP_VERIFICATION_ERROR",

                candidate:
                    item.candidate,

                initialAnalysis:
                    item.analysis,

                error:
                    error.message
            });


            continue;
        }


        /*
        VERIFIED
        */

        if (
            deepResult?.status ===
            "VERIFIED"
        ) {

            accepted.push({

                status:
                    "ACCEPTED",

                verification:
                    "DEEP_VERIFIED",

                candidate:
                    item.candidate,

                analysis:
                    deepResult
            });


            continue;
        }


        /*
        REJECTED
        */

        if (
            deepResult?.status ===
            "REJECTED"
        ) {

            rejected.push({

                status:
                    "REJECTED",

                verification:
                    "DEEP_REJECTION",

                candidate:
                    item.candidate,

                analysis:
                    deepResult
            });


            continue;
        }


        /*
        STILL UNCERTAIN
        */

        uncertain.push({

            status:
                "NEEDS_AI",

            verification:
                "DETERMINISTIC_INSUFFICIENT",

            candidate:
                item.candidate,

            initialAnalysis:
                item.analysis,

            deepResult
        });
    }


    /*
    =================================================
    SKIPPED DEEP CANDIDATES
    =================================================

    Do NOT silently reject them.

    They are preserved for AI/uncertain handling.
    =================================================
    */

    const selectedSet =
        new Set(
            selectedDeepCandidates.map(
                item =>
                    item.candidate
            )
        );


    for (
        const item
        of deepQueue
    ) {

        if (
            selectedSet.has(
                item.candidate
            )
        ) {
            continue;
        }


        uncertain.push({

            status:
                "NEEDS_AI",

            verification:
                "DEEP_QUEUE_LIMIT_REACHED",

            candidate:
                item.candidate,

            initialAnalysis:
                item.analysis
        });
    }


    /*
    =================================================
    FINAL SUMMARY
    =================================================
    */

    const totalTime =
        Date.now() -
        startedAt;


    const summary = {

        totalCandidates:
            inputCandidates.length,

        accepted:
            accepted.length,

        uncertain:
            uncertain.length,

        rejected:
            rejected.length,

        deepCandidatesConsidered:
            selectedDeepCandidates.length,

        deepCandidatesSkipped:
            skippedDeepCandidates,

        acceptanceRate:

            inputCandidates.length > 0

                ? Number(
                    (
                        accepted.length /
                        inputCandidates.length
                    ).toFixed(4)
                )

                : 0,

        totalTimeMs:
            totalTime
    };


    const result = {

        summary,

        accepted,

        uncertain,

        rejected
    };


    /*
    =================================================
    FINAL LOG
    =================================================
    */

    console.log(
        "\n========================================"
    );


    console.log(
        "📊 FINAL VERIFICATION SUMMARY"
    );


    console.log(
        "========================================"
    );


    console.log(
        summary
    );


    console.log(
        "========================================"
    );


    return result;
}


/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = {

    verifyCandidate,

    verifyCandidates,

    VERIFICATION_CONFIG
};