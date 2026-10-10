/*
=====================================================
STOCKSENSE BUY / WAIT DECISION ENGINE
=====================================================

Uses existing price intelligence data.

Decision:
- BUY_NOW
- GOOD_TIME
- FAIR_PRICE
- WAIT

This is a decision-support score, not a guaranteed
future-price prediction.
=====================================================
*/

function clamp(
    value,
    min,
    max
) {

    return Math.max(
        min,
        Math.min(
            max,
            value
        )
    );

}


function getPricePosition(
    currentPrice,
    lowestPrice,
    highestPrice
) {

    if (
        currentPrice == null ||
        lowestPrice == null ||
        highestPrice == null
    ) {

        return null;

    }

    const range =
        highestPrice -
        lowestPrice;


    if (
        range <= 0
    ) {

        return 0.5;

    }


    return clamp(
        (
            currentPrice -
            lowestPrice
        ) /
        range,
        0,
        1
    );

}


function getBuyDecision(
    priceAnalysis
) {

    const currentPrice =
        Number(
            priceAnalysis?.currentPrice
        );

    const lowestPrice =
        Number(
            priceAnalysis?.lowestPrice
        );

    const highestPrice =
        Number(
            priceAnalysis?.highestPrice
        );

    const averagePrice =
        Number(
            priceAnalysis?.averagePrice
        );

    const trend =
        String(
            priceAnalysis?.trend ||
            "STABLE"
        ).toUpperCase();


    /*
    =============================================
    SAFETY CHECK
    =============================================
    */

    if (
        !Number.isFinite(currentPrice) ||
        !Number.isFinite(lowestPrice) ||
        !Number.isFinite(highestPrice) ||
        !Number.isFinite(averagePrice)
    ) {

        return {

            decision:
                "INSUFFICIENT_DATA",

            confidence:
                0,

            score:
                0,

            message:
                "Not enough price history to make a buy decision.",

            metrics: {}

        };

    }


    /*
    =============================================
    PRICE POSITION

    0   = historical low
    1   = historical high
    =============================================
    */

    const position =
        getPricePosition(
            currentPrice,
            lowestPrice,
            highestPrice
        );


    /*
    =============================================
    DISTANCE FROM HISTORICAL LOW
    =============================================
    */

    const lowDistancePct =
        lowestPrice > 0
            ? (
                (
                    currentPrice -
                    lowestPrice
                ) /
                lowestPrice
            ) * 100
            : 0;


    /*
    =============================================
    DIFFERENCE FROM AVERAGE
    =============================================
    */

    const averageDifferencePct =
        averagePrice > 0
            ? (
                (
                    currentPrice -
                    averagePrice
                ) /
                averagePrice
            ) * 100
            : 0;


    /*
    =============================================
    START SCORE

    Higher = better time to buy.
    =============================================
    */

    let score = 50;


    /*
    =============================================
    HISTORICAL POSITION

    Near historical low = strong positive signal.
    Near historical high = strong negative signal.
    =============================================
    */

    if (
        position <= 0.15
    ) {

        score += 30;

    }
    else if (
        position <= 0.30
    ) {

        score += 20;

    }
    else if (
        position <= 0.45
    ) {

        score += 10;

    }
    else if (
        position >= 0.85
    ) {

        score -= 30;

    }
    else if (
        position >= 0.70
    ) {

        score -= 20;

    }
    else if (
        position >= 0.55
    ) {

        score -= 10;

    }


    /*
    =============================================
    CURRENT PRICE VS AVERAGE
    =============================================
    */

    if (
        averageDifferencePct <= -5
    ) {

        score += 20;

    }
    else if (
        averageDifferencePct <= -2
    ) {

        score += 12;

    }
    else if (
        averageDifferencePct <= 0
    ) {

        score += 6;

    }
    else if (
        averageDifferencePct >= 5
    ) {

        score -= 20;

    }
    else if (
        averageDifferencePct >= 2
    ) {

        score -= 10;

    }


    /*
    =============================================
    TREND

    Falling prices can make waiting useful.
    Rising prices can make buying sooner useful
    when the current price is already attractive.

    =============================================
    */

    if (
        trend === "DOWN"
    ) {

        score -= 8;

    }
    else if (
        trend === "UP"
    ) {

        /*
        Rising + already cheap:
        don't penalize as heavily.
        */

        if (
            position <= 0.30
        ) {

            score += 4;

        }
        else {

            score -= 6;

        }

    }


    score =
        Math.round(
            clamp(
                score,
                0,
                100
            )
        );


    /*
    =============================================
    DECISION
    =============================================
    */

    let decision;
    let message;


    if (
        score >= 80
    ) {

        decision =
            "BUY_NOW";

        message =
            "Price is close to the historical low and looks attractive right now.";

    }
    else if (
        score >= 65
    ) {

        decision =
            "GOOD_TIME";

        message =
            "Price looks favorable compared with recent history.";

    }
    else if (
        score >= 45
    ) {

        decision =
            "FAIR_PRICE";

        message =
            "Price is reasonable, but there is no strong buying signal.";

    }
    else {

        decision =
            "WAIT";

        message =
            "Current price is relatively high compared with the historical range.";

    }


    /*
    =============================================
    CONFIDENCE

    Confidence increases when the price is clearly
    near one side of the historical range and the
    comparison data is meaningful.

    =============================================
    */

    const positionStrength =
        position == null
            ? 0
            : Math.abs(
                0.5 -
                position
            ) * 2;


    const averageStrength =
        clamp(
            Math.abs(
                averageDifferencePct
            ) / 10,
            0,
            1
        );


    const confidence =
        Math.round(
            clamp(
                55 +
                (
                    positionStrength *
                    25
                ) +
                (
                    averageStrength *
                    20
                ),
                50,
                95
            )
        );


    /*
    =============================================
    RETURN
    =============================================
    */

    return {

        decision,

        confidence,

        score,

        message,

        metrics: {

            currentPrice,

            lowestPrice,

            highestPrice,

            averagePrice,

            trend,

            pricePosition:
                Number(
                    (
                        position *
                        100
                    ).toFixed(1)
                ),

            aboveLowestPct:
                Number(
                    lowDistancePct.toFixed(
                        2
                    )
                ),

            vsAveragePct:
                Number(
                    averageDifferencePct.toFixed(
                        2
                    )
                )

        }

    };

}


module.exports = {

    getBuyDecision

};