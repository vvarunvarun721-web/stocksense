/*
=====================================================
STOCKSENSE PRICE INTELLIGENCE ENGINE
=====================================================

Combines:

1. Historical price position
2. Price vs average
3. Trend
4. Historical range
5. Volatility proxy
6. Short-term forecast range
7. BUY / WAIT decision
8. Confidence

IMPORTANT:
This is a heuristic decision engine based on
historical price behavior. It is NOT a guaranteed
future-price prediction.

=====================================================
*/

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/*
=====================================================
SAFE NUMBER
=====================================================
*/

function num(value, fallback = null) {
  const n = Number(value);

  return Number.isFinite(n) ? n : fallback;
}

/*
=====================================================
PRICE POSITION

0   = historical low
0.5 = middle
1   = historical high
=====================================================
*/

function calculatePricePosition(current, low, high) {
  if (current == null || low == null || high == null) {
    return null;
  }

  const range = high - low;

  if (range <= 0) {
    return 0.5;
  }

  return clamp((current - low) / range, 0, 1);
}

/*
=====================================================
FORECAST ENGINE

We intentionally use a conservative range rather
than pretending to know an exact future price.

=====================================================
*/

function calculateForecast(current, low, high, average, trend, totalSnapshots) {
  if (current == null || low == null || high == null || average == null) {
    return {
      available: false,

      predictedPrice: null,

      lowerBound: null,

      upperBound: null,

      expectedLow: null,

      expectedHigh: null,
    };
  }

  const historicalRange = Math.max(high - low, current * 0.02);

  /*
    ---------------------------------------------
    TREND BIAS
    ---------------------------------------------
    */

  let trendBiasPct = 0;

  if (trend === "UP") {
    trendBiasPct = 1.5;
  } else if (trend === "DOWN") {
    trendBiasPct = -1.5;
  }

  /*
    ---------------------------------------------
    DATA CONFIDENCE

    More snapshots = narrower forecast range.
    ---------------------------------------------
    */

  const snapshotFactor = Math.min(
    Math.max(Number(totalSnapshots) || 0, 1),
    200,
  );

  const confidenceFactor =
    snapshotFactor >= 100
      ? 0.6
      : snapshotFactor >= 50
        ? 0.75
        : snapshotFactor >= 20
          ? 0.9
          : 1.1;

  /*
    ---------------------------------------------
    FORECAST CENTER

    Keep average as an anchor so one current price
    doesn't dominate the estimate.
    ---------------------------------------------
    */

  const forecastCenter =
    current * 0.55 + average * 0.45 + (current * trendBiasPct) / 100;

  /*
    ---------------------------------------------
    FORECAST RANGE
    ---------------------------------------------
    */

  const spread = historicalRange * 0.35 * confidenceFactor;

  const lowerBound = Math.max(1, forecastCenter - spread);

  const upperBound = forecastCenter + spread;

  /*
    ---------------------------------------------
    EXPECTED LOW/HIGH

    Conservative range for UI.
    ---------------------------------------------
    */

  const expectedLow = Math.max(
    1,
    Math.min(current, forecastCenter - historicalRange * 0.25),
  );

  const expectedHigh = Math.max(
    current,
    forecastCenter + historicalRange * 0.25,
  );

  return {
    available: true,

    predictedPrice: Number(forecastCenter.toFixed(2)),

    lowerBound: Number(lowerBound.toFixed(2)),

    upperBound: Number(upperBound.toFixed(2)),

    expectedLow: Number(expectedLow.toFixed(2)),

    expectedHigh: Number(expectedHigh.toFixed(2)),
  };
}

/*
=====================================================
BUY / WAIT SCORE
=====================================================
*/

function calculateDecision(current, low, high, average, trend, forecast) {
  const position = calculatePricePosition(current, low, high);

  if (position == null) {
    return {
      decision: "INSUFFICIENT_DATA",

      score: 0,

      confidence: 0,

      reason: "Not enough price data.",
    };
  }

  let score = 50;

  const reasons = [];

  /*
    ---------------------------------------------
    HISTORICAL POSITION
    ---------------------------------------------
    */

  if (position <= 0.15) {
    score += 30;

    reasons.push("Very close to the historical low");
  } else if (position <= 0.3) {
    score += 20;

    reasons.push("Price is in the lower part of the historical range");
  } else if (position <= 0.45) {
    score += 10;

    reasons.push("Price is slightly below the middle of the historical range");
  } else if (position >= 0.85) {
    score -= 30;

    reasons.push("Price is close to the historical high");
  } else if (position >= 0.7) {
    score -= 20;

    reasons.push("Price is in the upper part of the historical range");
  }

  /*
    ---------------------------------------------
    CURRENT VS AVERAGE
    ---------------------------------------------
    */

  const vsAveragePct = average > 0 ? ((current - average) / average) * 100 : 0;

  if (vsAveragePct <= -5) {
    score += 20;

    reasons.push("Price is well below the historical average");
  } else if (vsAveragePct <= -2) {
    score += 12;

    reasons.push("Price is below the historical average");
  } else if (vsAveragePct <= 1) {
    score += 5;

    reasons.push("Price is around the historical average");
  } else if (vsAveragePct >= 5) {
    score -= 20;

    reasons.push("Price is well above the historical average");
  } else if (vsAveragePct >= 2) {
    score -= 10;

    reasons.push("Price is above the historical average");
  }

  /*
    ---------------------------------------------
    TREND
    ---------------------------------------------
    */

  if (trend === "DOWN") {
    score -= 8;

    reasons.push("Price trend is currently falling");
  } else if (trend === "UP") {
    if (position <= 0.3) {
      score += 5;

      reasons.push("Price is rising but still relatively low");
    } else {
      score -= 5;

      reasons.push("Price trend is currently rising");
    }
  }

  /*
    ---------------------------------------------
    FORECAST
    ---------------------------------------------
    */

  if (forecast?.available) {
    const predicted = forecast.predictedPrice;

    const forecastVsCurrentPct =
      current > 0 ? ((predicted - current) / current) * 100 : 0;

    if (forecastVsCurrentPct <= -3) {
      score -= 8;

      reasons.push("Forecast indicates possible near-term price weakness");
    } else if (forecastVsCurrentPct >= 3) {
      score += 8;

      reasons.push("Forecast indicates possible near-term price increase");
    }
  }

  score = Math.round(clamp(score, 0, 100));

  /*
    ---------------------------------------------
    DECISION
    ---------------------------------------------
    */

  let decision;

  if (score >= 80) {
    decision = "BUY_NOW";
  } else if (score >= 65) {
    decision = "GOOD_TIME";
  } else if (score >= 45) {
    decision = "FAIR_PRICE";
  } else {
    decision = "WAIT";
  }

  /*
    ---------------------------------------------
    CONFIDENCE

    Confidence is based on how decisive the score
    and historical range are.

    ---------------------------------------------
    */

  const decisiveness = Math.abs(score - 50) / 50;

  const confidence = Math.round(
    clamp(55 + decisiveness * 30 + (forecast?.available ? 10 : 0), 50, 95),
  );

  return {
    decision,

    score,

    confidence,

    reason: reasons.length > 0 ? reasons.join(" • ") : "Mixed price signals.",
  };
}

/*
=====================================================
MAIN ENGINE
=====================================================
*/

function analyzePriceIntelligence(priceAnalysis) {
  /*
  =====================================================
  MINIMUM HISTORY REQUIRED
  =====================================================
  */

  const MIN_RELIABLE_SNAPSHOTS = 7;

  const current = num(priceAnalysis?.currentPrice);

  const low = num(priceAnalysis?.lowestPrice);

  const high = num(priceAnalysis?.highestPrice);

  const average = num(priceAnalysis?.averagePrice);

  const totalSnapshots = num(priceAnalysis?.totalSnapshots, 0);

  const trend = String(priceAnalysis?.trend || "STABLE").toUpperCase();

  /*
  =====================================================
  BASIC DATA VALIDATION
  =====================================================
  */

  if (current == null || low == null || high == null || average == null) {
    console.log("⚠️ Price Intelligence: insufficient price data");

    return {
      decision: {
        decision: "INSUFFICIENT_DATA",

        score: null,

        confidence: 0,

        reason: "Not enough historical price data.",
      },

      forecast: {
        available: false,

        predictedPrice: null,

        lowerBound: null,

        upperBound: null,

        expectedLow: null,

        expectedHigh: null,
      },

      metrics: {
        currentPrice: current,

        lowestPrice: low,

        highestPrice: high,

        averagePrice: average,

        totalSnapshots,

        trend,

        pricePosition: null,

        aboveLowestPct: null,

        vsAveragePct: null,

        historicalRange: null,

        historyStatus: "INSUFFICIENT",

        minimumSnapshots: MIN_RELIABLE_SNAPSHOTS,
      },
    };
  }

  /*
  =====================================================
  HISTORY VALIDATION
  =====================================================

  IMPORTANT:

  Do not calculate Buy Score when the product has
  insufficient historical observations.

  This prevents:

      1 snapshot
      current = average = low = high

  from becoming:

      FAIR_PRICE
      55 / 100

  =====================================================
  */

  if (totalSnapshots < MIN_RELIABLE_SNAPSHOTS) {
    console.log(
      `⚠️ Price Intelligence: insufficient history ` +
        `(${totalSnapshots}/${MIN_RELIABLE_SNAPSHOTS})`,
    );

    return {
      decision: {
        decision: "INSUFFICIENT_DATA",

        score: null,

        confidence: 0,

        reason:
          `Not enough historical price observations. ` +
          `StockSense has ${totalSnapshots} snapshot(s); ` +
          `at least ${MIN_RELIABLE_SNAPSHOTS} are required ` +
          `for a reliable Buy Score.`,
      },

      forecast: {
        available: false,

        predictedPrice: null,

        lowerBound: null,

        upperBound: null,

        expectedLow: null,

        expectedHigh: null,
      },

      metrics: {
        currentPrice: current,

        lowestPrice: low,

        highestPrice: high,

        averagePrice: average,

        totalSnapshots,

        trend,

        pricePosition: null,

        aboveLowestPct: null,

        vsAveragePct: null,

        historicalRange: Number(Math.max(high - low, 0).toFixed(2)),

        historyStatus: "INSUFFICIENT",

        minimumSnapshots: MIN_RELIABLE_SNAPSHOTS,
      },
    };
  }

  /*
  =====================================================
  FULL PRICE INTELLIGENCE
  =====================================================
  */

  const pricePosition = calculatePricePosition(current, low, high);

  const forecast = calculateForecast(
    current,
    low,
    high,
    average,
    trend,
    totalSnapshots,
  );

  const decision = calculateDecision(
    current,
    low,
    high,
    average,
    trend,
    forecast,
  );

  /*
  =====================================================
  EXTRA METRICS
  =====================================================
  */

  const vsAveragePct = average > 0 ? ((current - average) / average) * 100 : 0;

  const aboveLowPct = low > 0 ? ((current - low) / low) * 100 : 0;

  const priceRange = high - low;

  /*
  =====================================================
  FINAL RESULT
  =====================================================
  */

  return {
    decision,

    forecast,

    metrics: {
      currentPrice: current,

      lowestPrice: low,

      highestPrice: high,

      averagePrice: average,

      totalSnapshots,

      trend,

      pricePosition: Number((pricePosition * 100).toFixed(2)),

      aboveLowestPct: Number(aboveLowPct.toFixed(2)),

      vsAveragePct: Number(vsAveragePct.toFixed(2)),

      historicalRange: Number(priceRange.toFixed(2)),

      historyStatus: "SUFFICIENT",

      minimumSnapshots: MIN_RELIABLE_SNAPSHOTS,
    },
  };
}

/*
=====================================================
EXPORTS
=====================================================
*/

module.exports = {
  analyzePriceIntelligence,

  calculatePricePosition,

  calculateForecast,

  calculateDecision,
};
