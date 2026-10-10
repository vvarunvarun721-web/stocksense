import {
  useEffect,
  useRef,
  useState,
} from "react";

import "./App.css";
import StockSenseFavicon from "./components/StockSenseFavicon";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/*
=====================================================
FORMAT PRICE
=====================================================
*/

function formatPrice(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "—";
  }

  return `₹${number.toLocaleString(
    "en-IN"
  )}`;
}


/*
=====================================================
AVAILABILITY HELPERS
=====================================================
*/

function getAvailabilityState(value) {

  if (
    value === false ||
    String(value || "")
      .toLowerCase()
      .includes("outofstock") ||
    String(value || "")
      .toLowerCase()
      .includes("out of stock") ||
    String(value || "")
      .toLowerCase()
      .includes("out-of-stock") ||
    String(value || "")
      .toLowerCase()
      .includes("sold out")
  ) {

    return "OUT_OF_STOCK";

  }

  if (
    value === true ||
    String(value || "")
      .toLowerCase()
      .includes("instock") ||
    String(value || "")
      .toLowerCase()
      .includes("in stock") ||
    String(value || "")
      .toLowerCase()
      .includes("in-stock")
  ) {

    return "IN_STOCK";

  }

  return "UNKNOWN";
}


function getAvailabilityValue(
  listing
) {

  if (!listing) {
    return "UNKNOWN";
  }

  return getAvailabilityState(
    listing.availability ??
    listing.stock ??
    listing.inStock ??
    listing.available
  );
}


function hasUsableLivePrice(
  listing
) {

  if (!listing) {
    return false;
  }

  const price =
    listing.price ??
    listing.currentPrice ??
    listing.salePrice;

  return Number.isFinite(
    Number(price)
  );
}


/*
=====================================================
FORMAT PERCENT
=====================================================
*/

function formatPercent(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "—";
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(number)
  ) {
    return "—";
  }

  return `${number.toFixed(2)}%`;
}


/*
=====================================================
DECISION CLASS
=====================================================
*/

function getDecisionClass(
  decision
) {

  switch (
  String(
    decision || ""
  ).toUpperCase()
  ) {

    case "BUY_NOW":
      return "decision-buy";

    case "GOOD_TIME":
      return "decision-good";

    case "WAIT":
      return "decision-wait";

    case "FAIR_PRICE":
      return "decision-fair";

    case "OUT_OF_STOCK":
      return "decision-out-stock";

    default:
      return "decision-neutral";
  }
}


/*
=====================================================
DECISION LABEL
=====================================================
*/

function getDecisionLabel(
  decision
) {

  switch (
  String(
    decision || ""
  ).toUpperCase()
  ) {

    case "BUY_NOW":
      return "Buy now";

    case "GOOD_TIME":
      return "Good time";

    case "WAIT":
      return "Wait";

    case "FAIR_PRICE":
      return "Fair price";

    case "OUT_OF_STOCK":
      return "Out of stock";

    default:
      return "Price data";
  }
}


/*
=====================================================
TREND SYMBOL
=====================================================
*/

function getTrendSymbol(
  trend
) {

  switch (
  String(
    trend || ""
  ).toUpperCase()
  ) {

    case "UP":
      return "↗";

    case "DOWN":
      return "↘";

    default:
      return "→";
  }
}


/*
=====================================================
CHECK WHETHER INPUT IS A URL
=====================================================
*/

function isValidProductUrl(
  value
) {

  try {

    const url =
      new URL(
        value.trim()
      );

    return (
      url.protocol ===
      "http:" ||
      url.protocol ===
      "https:"
    );

  }
  catch {

    return false;

  }
}




/*
=====================================================
PRICE HISTORY / RANGE VISUAL
=====================================================

URL analysis always gets a visible price visual.
If the backend returns history snapshots, we draw
an actual time-series line. If the endpoint currently
returns only aggregate price intelligence, we show an
honest low/average/current/high range visual instead
of inventing historical points.
=====================================================
*/


function PriceHistoryVisual({
  history = [],
  intelligence = null,
}) {

  const metrics =
    intelligence?.metrics ||
    intelligence ||
    {};

  const toNumber = value => {
    const number = Number(value);

    return Number.isFinite(number)
      ? number
      : null;
  };

  const backendCurrentPrice =
    toNumber(
      metrics.currentPrice
    );

  const backendTotalSnapshots =
    Number(
      metrics.totalSnapshots
    ) || 0;

  const normalizePoint = item => {

    const price =
      toNumber(
        item?.price ??
        item?.currentPrice ??
        item?.sellingPrice
      );

    const rawDate =
      item?.checkedAt ||
      item?.createdAt ||
      item?.timestamp ||
      item?.date ||
      null;

    const time =
      rawDate
        ? new Date(
            rawDate
          ).getTime()
        : NaN;

    if (
      price === null ||
      !Number.isFinite(time)
    ) {
      return null;
    }

    return {
      price,
      date:
        new Date(
          time
        ),
      time,
    };
  };

  const allPoints =
    Array.isArray(history)
      ? history
          .map(
            normalizePoint
          )
          .filter(Boolean)
          .sort(
            (a, b) =>
              a.time -
              b.time
          )
      : [];

  /*
  ---------------------------------------------------------
  LAST 12 MONTHS
  ---------------------------------------------------------
  Only real observations are displayed.

  We never create synthetic historical observations.
  ---------------------------------------------------------
  */

  const now =
    Date.now();

  const oneYearAgo =
    now -
    (
      365 *
      24 *
      60 *
      60 *
      1000
    );

  let visiblePoints =
    allPoints.filter(
      point =>
        point.time >=
        oneYearAgo
    );

  /*
  If the database contains history but all of it is older
  than one year, show the latest recorded history rather
  than showing an empty graph.
  */

  if (
    visiblePoints.length === 0 &&
    allPoints.length > 0
  ) {

    visiblePoints =
      allPoints.slice(
        -120
      );

  }

  /*
  ---------------------------------------------------------
  ONE POINT PER DAY
  ---------------------------------------------------------
  Multiple checks on the same calendar day are collapsed to
  the latest real observation for that day.
  ---------------------------------------------------------
  */

  const dailyMap =
    new Map();

  visiblePoints.forEach(
    point => {

      const key =
        `${point.date.getFullYear()}-${String(
          point.date.getMonth() + 1
        ).padStart(2, "0")}-${String(
          point.date.getDate()
        ).padStart(2, "0")}`;

      dailyMap.set(
        key,
        point
      );

    }
  );

  let chartHistory =
    Array.from(
      dailyMap.values()
    ).sort(
      (a, b) =>
        a.time -
        b.time
    );

  /*
  Keep the SVG readable when history is very dense.
  */

  if (
    chartHistory.length >
    120
  ) {

    const step =
      (
        chartHistory.length -
        1
      ) /
      119;

    chartHistory =
      Array.from(
        {
          length: 120,
        },
        (_, index) =>
          chartHistory[
            Math.round(
              index *
              step
            )
          ]
      );

  }

  const hasHistory =
    chartHistory.length > 0;

  const hasTrend =
    chartHistory.length >= 2;

  /*
  ---------------------------------------------------------
  METRICS
  ---------------------------------------------------------
  When real history exists, the visible low/average/high
  are derived from those actual observations.
  ---------------------------------------------------------
  */

  const historyPrices =
    chartHistory.map(
      point =>
        point.price
    );

  const historyLow =
    hasHistory
      ? Math.min(
          ...historyPrices
        )
      : toNumber(
          metrics.lowestPrice
        );

  const historyHigh =
    hasHistory
      ? Math.max(
          ...historyPrices
        )
      : toNumber(
          metrics.highestPrice
        );

  const historyAverage =
    hasHistory
      ? (
          historyPrices.reduce(
            (sum, price) =>
              sum + price,
            0
          ) /
          historyPrices.length
        )
      : toNumber(
          metrics.averagePrice
        );

  const currentPrice =
    hasHistory
      ? (
          backendCurrentPrice !== null
            ? backendCurrentPrice
            : chartHistory[
                chartHistory.length - 1
              ].price
        )
      : backendCurrentPrice;

  const currentPriceLabel =
    backendCurrentPrice !== null
      ? "CURRENT"
      : "LAST RECORDED";

  if (
    !hasHistory
  ) {

    return (
      <section className="price-history-panel">

        <div className="price-history-head">

          <div className="price-history-title-wrap">

            <span className="section-kicker">
              PRICE HISTORY
            </span>

            <h2>
              See the real price trend.
            </h2>

            <p>
              {backendTotalSnapshots > 0
                ? `${backendTotalSnapshots} verified snapshot${backendTotalSnapshots === 1 ? "" : "s"} exist, but their dated price points are not being returned by the API yet.`
                : "No historical price observations are available yet."}
            </p>

          </div>

          <div className="price-history-status">

            <strong>
              {backendTotalSnapshots || "—"}
            </strong>

            <span>
              snapshots
            </span>

          </div>

        </div>

        <div className="price-history-empty">

          <div className="price-history-empty-icon">
            •
          </div>

          <strong>
            Historical points are not exposed yet
          </strong>

          <p>
            The database can report the snapshot count,
            but the chart needs each snapshot's price and
            date. Once those points are returned, this area
            becomes the actual 12-month graph automatically.
          </p>

        </div>

      </section>
    );

  }

  /*
  ---------------------------------------------------------
  CHART SCALE
  ---------------------------------------------------------
  A padded vertical scale is intentionally used when all
  observed prices are equal, so a constant trend remains
  visible instead of collapsing into the bottom/top edge.
  ---------------------------------------------------------
  */

  const rawMin =
    historyLow ??
    currentPrice ??
    0;

  const rawMax =
    historyHigh ??
    currentPrice ??
    rawMin;

  const rawRange =
    rawMax -
    rawMin;

  const scalePadding =
    rawRange > 0
      ? rawRange * 0.16
      : Math.max(
          25,
          rawMax * 0.025,
          1
        );

  const minPrice =
    Math.max(
      0,
      rawMin -
        scalePadding
    );

  const maxPrice =
    rawMax +
    scalePadding;

  const width =
    1200;

  const height =
    420;

  const left =
    84;

  const right =
    32;

  const top =
    34;

  const bottom =
    64;

  const innerWidth =
    width -
    left -
    right;

  const innerHeight =
    height -
    top -
    bottom;

  const formatPrice =
    value => {

      if (
        value === null ||
        value === undefined ||
        !Number.isFinite(
          Number(value)
        )
      ) {
        return "—";
      }

      return `₹${Number(
        value
      ).toLocaleString(
        "en-IN"
      )}`;

    };

  const formatAxisPrice =
    value => {

      const numeric =
        Number(value);

      if (
        !Number.isFinite(
          numeric
        )
      ) {
        return "—";
      }

      if (
        Math.abs(
          numeric
        ) >= 100000
      ) {
        return `₹${(
          numeric /
          1000
        ).toFixed(0)}k`;
      }

      if (
        Math.abs(
          numeric
        ) >= 1000
      ) {
        return `₹${(
          numeric /
          1000
        ).toFixed(
          numeric % 1000 === 0
            ? 0
            : 1
        )}k`;
      }

      return `₹${Math.round(
        numeric
      ).toLocaleString(
        "en-IN"
      )}`;

    };

  const formatShortDate =
    date => {

      if (
        !date
      ) {
        return "";
      }

      return date.toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
        }
      );

    };

  const formatMonth =
    date => {

      if (
        !date
      ) {
        return "";
      }

      return date.toLocaleDateString(
        "en-IN",
        {
          month: "short",
          year: "2-digit",
        }
      );

    };

  const getY =
    value => {

      if (
        maxPrice ===
        minPrice
      ) {
        return (
          top +
          innerHeight /
            2
        );
      }

      return (
        top +
        (
          1 -
          (
            value -
            minPrice
          ) /
          (
            maxPrice -
            minPrice
          )
        ) *
        innerHeight
      );

    };

  const firstDate =
    chartHistory[0]
      ?.date || null;

  const lastDate =
    chartHistory[
      chartHistory.length -
      1
    ]?.date || null;

  const firstTime =
    firstDate
      ? firstDate.getTime()
      : 0;

  const lastTime =
    lastDate
      ? lastDate.getTime()
      : 0;

  const timeRange =
    Math.max(
      1,
      lastTime -
      firstTime
    );

  const getX =
    index => {

      if (
        chartHistory.length <=
        1
      ) {
        return (
          left +
          innerWidth /
            2
        );
      }

      const time =
        chartHistory[
          index
        ].time;

      return (
        left +
        (
          (
            time -
            firstTime
          ) /
          timeRange
        ) *
        innerWidth
      );

    };

  const linePoints =
    chartHistory
      .map(
        (
          point,
          index
        ) =>
          `${getX(index)},${getY(
            point.price
          )}`
      )
      .join(
        " "
      );

  const areaPoints =
    hasTrend
      ? [
          `${getX(0)},${top + innerHeight}`,
          ...chartHistory.map(
            (
              point,
              index
            ) =>
              `${getX(index)},${getY(
                point.price
              )}`
          ),
          `${getX(
            chartHistory.length -
            1
          )},${top + innerHeight}`,
        ].join(
          " "
        )
      : "";

  /*
  Date labels are based on actual dates, not fabricated
  monthly observations.
  */

  const labelPoints =
    chartHistory.length <= 6
      ? chartHistory
      : [
          chartHistory[0],
          chartHistory[
            Math.floor(
              chartHistory.length *
              0.25
            )
          ],
          chartHistory[
            Math.floor(
              chartHistory.length *
              0.50
            )
          ],
          chartHistory[
            Math.floor(
              chartHistory.length *
              0.75
            )
          ],
          chartHistory[
            chartHistory.length -
            1
          ],
        ].filter(
          (point, index, list) =>
            point &&
            list.indexOf(
              point
            ) === index
        );

  const showPoint =
    index => {

      if (
        chartHistory.length <=
        20
      ) {
        return true;
      }

      return (
        index === 0 ||
        index ===
          chartHistory.length -
          1 ||
        index %
          Math.ceil(
            chartHistory.length /
              14
          ) === 0
      );

    };

  const observedSpanDays =
    hasHistory
      ? Math.max(
          1,
          Math.round(
            (
              lastTime -
              firstTime
            ) /
            (
              24 *
              60 *
              60 *
              1000
            )
          )
        )
      : 0;

  return (
    <section className="price-history-panel">

      <div className="price-history-head">

        <div className="price-history-title-wrap">

          <span className="section-kicker">
            LAST 12 MONTHS
          </span>

          <h2>
            See the price move over time.
          </h2>

          <p>
            {hasTrend
              ? `Showing ${chartHistory.length} dated observations across ${observedSpanDays} day${observedSpanDays === 1 ? "" : "s"}.`
              : "One dated observation is available. More checks are needed to establish a trend."}
          </p>

        </div>

        <div className="price-history-status">

          <strong>
            {allPoints.length}
          </strong>

          <span>
            observations
          </span>

        </div>

      </div>

      <div className="price-chart-wrap">

        <div className="price-chart-toolbar">

          <div>
            <span>
              OBSERVED
            </span>
            <strong>
              {formatPrice(
                historyLow
              )}
              {" "}→{" "}
              {formatPrice(
                historyHigh
              )}
            </strong>
          </div>

          <div>
            <span>
              AVERAGE
            </span>
            <strong>
              {formatPrice(
                historyAverage
              )}
            </strong>
          </div>

          <div>
            <span>
              CURRENT
            </span>
            <strong>
              {formatPrice(
                currentPrice
              )}
            </strong>
          </div>

          <div>
            <span>
              RANGE
            </span>
            <strong>
              {formatPrice(
                Math.max(
                  0,
                  (
                    historyHigh ??
                    0
                  ) -
                  (
                    historyLow ??
                    0
                  )
                )
              )}
            </strong>
          </div>

        </div>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="price-history-svg"
          role="img"
          aria-label="StockSense price history chart"
        >

          {[0, 1, 2, 3, 4].map(
            index => {

              const ratio =
                index / 4;

              const y =
                top +
                innerHeight *
                  ratio;

              const value =
                maxPrice -
                (
                  maxPrice -
                  minPrice
                ) *
                ratio;

              return (
                <g
                  key={
                    `y-${index}`
                  }
                >

                  <line
                    x1={left}
                    x2={
                      width -
                      right
                    }
                    y1={y}
                    y2={y}
                    className="price-grid-line"
                  />

                  <text
                    x="6"
                    y={
                      y + 4
                    }
                    className="price-axis-label"
                  >
                    {formatAxisPrice(
                      value
                    )}
                  </text>

                </g>
              );

            }
          )}

          {historyAverage !== null && (
            <>
              <line
                x1={left}
                x2={
                  width -
                  right
                }
                y1={getY(
                  historyAverage
                )}
                y2={getY(
                  historyAverage
                )}
                className="price-average-line"
              />

              <text
                x={
                  width -
                  right
                }
                y={
                  getY(
                    historyAverage
                  ) -
                  8
                }
                textAnchor="end"
                className="price-reference-label average"
              >
                AVG{" "}
                {formatPrice(
                  historyAverage
                )}
              </text>
            </>
          )}

          {currentPrice !== null && (
            <>
              <line
                x1={left}
                x2={
                  width -
                  right
                }
                y1={getY(
                  currentPrice
                )}
                y2={getY(
                  currentPrice
                )}
                className="price-current-line"
              />

              <text
                x={left}
                y={
                  getY(
                    currentPrice
                  ) -
                  10
                }
                className="price-reference-label current"
              >
                {currentPriceLabel}{" "}
                {formatPrice(
                  currentPrice
                )}
              </text>
            </>
          )}

          {hasTrend && (
            <polygon
              points={
                areaPoints
              }
              className="price-history-area"
            />
          )}

          <polyline
            points={
              linePoints
            }
            className={
              hasTrend
                ? "price-history-line"
                : "price-history-line single-point-line"
            }
          />

          {chartHistory.map(
            (
              point,
              index
            ) => {

              if (
                !showPoint(
                  index
                )
              ) {
                return null;
              }

              return (
                <circle
                  key={
                    `${point.time}-${index}`
                  }
                  cx={
                    getX(
                      index
                    )
                  }
                  cy={
                    getY(
                      point.price
                    )
                  }
                  r={
                    hasTrend
                      ? 5
                      : 8
                  }
                  className={
                    hasTrend
                      ? "price-history-point"
                      : "price-history-point single"
                  }
                >

                  <title>
                    {formatPrice(
                      point.price
                    )}
                    {" • "}
                    {formatShortDate(
                      point.date
                    )}
                  </title>

                </circle>
              );

            }
          )}

          {labelPoints.map(
            (
              point,
              index
            ) => {

              if (
                !point
              ) {
                return null;
              }

              const x =
                getX(
                  chartHistory.indexOf(
                    point
                  )
                );

              return (
                <text
                  key={
                    `date-${index}-${point.time}`
                  }
                  x={x}
                  y={
                    height -
                    18
                  }
                  textAnchor="middle"
                  className="price-date-label"
                >
                  {chartHistory.length <= 6
                    ? formatShortDate(
                        point.date
                      )
                    : formatMonth(
                        point.date
                      )}
                </text>
              );

            }
          )}

        </svg>

        {!hasTrend && (
          <div className="price-chart-note">
            <strong>
              Single observed point
            </strong>
            <span>
              More dated checks will turn this into a real
              time-series line.
            </span>
          </div>
        )}

      </div>

      <div className="price-history-metrics">

        <div>
          <span>
            OBSERVED LOW
          </span>
          <strong>
            {formatPrice(
              historyLow
            )}
          </strong>
        </div>

        <div>
          <span>
            {currentPriceLabel}
          </span>
          <strong>
            {formatPrice(
              currentPrice
            )}
          </strong>
        </div>

        <div>
          <span>
            OBSERVED AVERAGE
          </span>
          <strong>
            {formatPrice(
              historyAverage
            )}
          </strong>
        </div>

        <div>
          <span>
            OBSERVED HIGH
          </span>
          <strong>
            {formatPrice(
              historyHigh
            )}
          </strong>
        </div>

      </div>

    </section>
  );
}


function PriceIntelligenceCard({
  intelligence,
}) {

  const [
    detailsOpen,
    setDetailsOpen,
  ] = useState(false);

  if (
    !intelligence
  ) {
    return null;
  }

  const decisionData =
    typeof intelligence.decision ===
      "object"
      ? intelligence.decision
      : {};

  const forecast =
    intelligence.forecast ||
    {};

  const metrics =
    intelligence.metrics ||
    {};

  const decision =
    decisionData.decision ||
    intelligence.decisionName ||
    (
      typeof intelligence.decision ===
        "string"
        ? intelligence.decision
        : ""
    );

  const score =
    decisionData.score ??
    intelligence.score ??
    null;

  const confidence =
    decisionData.confidence ??
    intelligence.confidence ??
    null;

  const reason =
    decisionData.reason ||
    intelligence.reason ||
    "Historical price information is available.";

  const trend =
    metrics.trend ||
    intelligence.trend ||
    "STABLE";

  const currentPrice =
    metrics.currentPrice ??
    intelligence.currentPrice;

  const lowestPrice =
    metrics.lowestPrice ??
    intelligence.lowestPrice;

  const averagePrice =
    metrics.averagePrice ??
    intelligence.averagePrice;

  const highestPrice =
    metrics.highestPrice ??
    intelligence.highestPrice;

  const totalSnapshots =
    metrics.totalSnapshots ??
    intelligence.totalSnapshots;

  const predictedPrice =
    forecast.predictedPrice;

  const lowerBound =
    forecast.lowerBound;

  const upperBound =
    forecast.upperBound;

  const forecastReady =
    forecast.available !== false &&
    Number.isFinite(
      Number(
        lowerBound
      )
    ) &&
    Number.isFinite(
      Number(
        upperBound
      )
    );

  const vsAverage =
    metrics.vsAveragePct;

  const aboveLowest =
    metrics.aboveLowestPct;

  const historicalRange =
    metrics.historicalRange ??
    (
      Number.isFinite(
        Number(
          highestPrice
        )
      ) &&
      Number.isFinite(
        Number(
          lowestPrice
        )
      )
        ? Number(
            highestPrice
          ) -
          Number(
            lowestPrice
          )
        : null
    );

  return (

    <section className="intelligence-card">

      <div className="intelligence-header">

        <div>

          <span className="section-kicker">
            PRICE INTELLIGENCE
          </span>

          <h2>
            Should you buy now?
          </h2>

        </div>

        {decision && (

          <button
            type="button"
            className={
              `decision-badge ${getDecisionClass(
                decision
              )} decision-badge-button`
            }
            onClick={() =>
              setDetailsOpen(
                value => !value
              )
            }
            aria-expanded={
              detailsOpen
            }
            title="Open price intelligence details"
          >

            <span className="decision-dot" />

            {getDecisionLabel(
              decision
            )}

            <span className="decision-chevron">
              {detailsOpen
                ? "⌃"
                : "⌄"}
            </span>

          </button>

        )}

      </div>

      <div className="intelligence-main">

        <div className="decision-price">

          <span>
            {Number.isFinite(Number(currentPrice))
              ? "Current price"
              : "Live price"}
          </span>

          <strong>
            {Number.isFinite(Number(currentPrice))
              ? formatPrice(currentPrice)
              : "Price unavailable"}
          </strong>

          {confidence !== null && (

            <small>
              Confidence{" "}
              <b>
                {confidence}%
              </b>
            </small>

          )}

        </div>

        {score !== null && (

          <div className="decision-score">

            <div className="score-ring">

              <span>
                {score}
              </span>

              <small>
                /100
              </small>

            </div>

            <span>
              Buy score
            </span>

          </div>

        )}

      </div>

      <div className="intelligence-grid">

        <div className="intel-stat">

          <span>
            Forecast range
          </span>

          <strong>

            {forecastReady
              ? `${formatPrice(
                  lowerBound
                )} – ${formatPrice(
                  upperBound
                )}`
              : "Collecting history"}

          </strong>

          {forecastReady ? (

            <small>
              Predicted{" "}
              <b>
                {formatPrice(
                  predictedPrice
                )}
              </b>
            </small>

          ) : (

            <small>
              A forecast needs enough reliable historical observations.
            </small>

          )}

        </div>

        <div className="intel-stat">

          <span>
            Historical low
          </span>

          <strong>
            {formatPrice(
              lowestPrice
            )}
          </strong>

          <small>
            Current is{" "}
            <b>
              {formatPercent(
                aboveLowest
              )}
            </b>{" "}
            above low
          </small>

        </div>

        <div className="intel-stat">

          <span>
            Historical average
          </span>

          <strong>
            {formatPrice(
              averagePrice
            )}
          </strong>

          <small>
            Current is{" "}
            <b>
              {formatPercent(
                vsAverage
              )}
            </b>{" "}
            vs average
          </small>

        </div>

        <div className="intel-stat">

          <span>
            Historical high
          </span>

          <strong>
            {formatPrice(
              highestPrice
            )}
          </strong>

          <small>
            {totalSnapshots
              ? `${totalSnapshots} price snapshots`
              : "Historical data"}
          </small>

        </div>

      </div>

      {detailsOpen && (

        <div className="decision-details">

          <div className="decision-detail-main">

            <span>
              DECISION
            </span>

            <strong>
              {getDecisionLabel(
                decision
              )}
            </strong>

            <p>
              {Number.isFinite(Number(currentPrice))
                ? reason
                : "The live marketplace price is unavailable because the current listing is out of stock. Historical price data remains available below."}
            </p>

          </div>

          <div className="decision-detail-grid">

            <div>
              <span>
                CURRENT
              </span>
              <strong>
                {formatPrice(
                  currentPrice
                )}
              </strong>
            </div>

            <div>
              <span>
                LOW
              </span>
              <strong>
                {formatPrice(
                  lowestPrice
                )}
              </strong>
            </div>

            <div>
              <span>
                AVERAGE
              </span>
              <strong>
                {formatPrice(
                  averagePrice
                )}
              </strong>
            </div>

            <div>
              <span>
                HIGH
              </span>
              <strong>
                {formatPrice(
                  highestPrice
                )}
              </strong>
            </div>

            <div>
              <span>
                RANGE
              </span>
              <strong>
                {formatPrice(
                  historicalRange
                )}
              </strong>
            </div>

            <div>
              <span>
                SNAPSHOTS
              </span>
              <strong>
                {totalSnapshots || "—"}
              </strong>
            </div>

            <div>
              <span>
                TREND
              </span>
              <strong>
                {String(
                  trend
                ).toUpperCase()}
              </strong>
            </div>

            <div>
              <span>
                FORECAST
              </span>
              <strong>
                {forecastReady
                  ? "AVAILABLE"
                  : "COLLECTING"}
              </strong>
            </div>

          </div>

        </div>

      )}

      <div className="intelligence-footer">

        <div className="trend-pill">

          <span className="trend-icon">

            {getTrendSymbol(
              trend
            )}

          </span>

          <span>
            Trend
          </span>

          <strong>
            {String(
              trend
            ).toUpperCase()}
          </strong>

        </div>

        <div className="intelligence-reason">

          <span>
            Why?
          </span>

          <p>
            {reason}
          </p>

        </div>

      </div>

    </section>

  );

}


/*
=====================================================
PRICE COMPARISON SUMMARY

=====================================================
*/

function PriceComparisonSummary({
  products,
  searchQuery,
}) {

  if (
    !Array.isArray(products) ||
    products.length === 0
  ) {
    return null;
  }


  /*
  ---------------------------------------------------
  ONLY PRODUCTS WITH VALID PRICES
  ---------------------------------------------------
  */

  const pricedProducts =
    products.filter(
      product => {

        const price =
          Number(
            product?.price
          );

        return (
          Number.isFinite(price) &&
          price >= 0
        );

      }
    );


  if (
    pricedProducts.length === 0
  ) {
    return null;
  }


  /*
  ---------------------------------------------------
  SORT LOWEST → HIGHEST
  ---------------------------------------------------
  */

  const sortedProducts =
    [
      ...pricedProducts,
    ].sort(
      (
        a,
        b
      ) =>
        Number(a.price) -
        Number(b.price)
    );


  const lowest =
    sortedProducts[0];


  const highest =
    sortedProducts[
      sortedProducts.length - 1
    ];


  const lowestPrice =
    Number(
      lowest.price
    );


  const highestPrice =
    Number(
      highest.price
    );


  const priceDifference =
    highestPrice -
    lowestPrice;


  /*
  ---------------------------------------------------
  POTENTIAL SAVINGS
  ---------------------------------------------------
  */

  const savingsPercentage =
    highestPrice > 0
      ? (
          priceDifference /
          highestPrice
        ) * 100
      : 0;


  /*
  ---------------------------------------------------
  AVERAGE PRICE
  ---------------------------------------------------
  */

  const averagePrice =
    pricedProducts.reduce(
      (
        total,
        product
      ) =>
        total +
        Number(
          product.price
        ),
      0
    ) /
    pricedProducts.length;


  /*
  ---------------------------------------------------
  UNIQUE MARKETPLACES
  ---------------------------------------------------
  */

  const platforms =
    [
      ...new Set(
        pricedProducts
          .map(
            product =>
              product.platform
          )
          .filter(Boolean)
      ),
    ];


  /*
  ---------------------------------------------------
  CHEAPEST RESULT BY MARKETPLACE
  ---------------------------------------------------
  */

  const platformPrices =
    platforms.map(
      platform => {

        const platformProducts =
          pricedProducts.filter(
            product =>
              product.platform ===
              platform
          );


        return {
          platform,

          product:
            platformProducts.sort(
              (
                a,
                b
              ) =>
                Number(a.price) -
                Number(b.price)
            )[0],
        };

      }
    );


  /*
  ---------------------------------------------------
  SEARCH QUERY
  ---------------------------------------------------
  */

  const displayQuery =
    searchQuery?.trim() ||
    "this product";


  return (

    <section className="price-comparison-section">

      {/* =================================================
          HEADER
      ================================================= */}

      <div
        style={{
          marginBottom:
            "18px",
        }}
      >

        <span className="section-kicker">
          PRICE COMPARISON
        </span>


        <h2
          style={{
            margin:
              "6px 0",
            fontSize:
              "28px",
            lineHeight:
              1.2,
          }}
        >
          Compare before you buy.
        </h2>


        <p
          style={{
            margin:
              0,
            color:
              "rgba(255,255,255,0.5)",
            fontSize:
              "14px",
          }}
        >
          StockSense found{" "}

          <strong
            style={{
              color:
                "rgba(255,255,255,0.82)",
            }}
          >
            {
              pricedProducts.length
            }
          </strong>{" "}

          verified priced listings for{" "}

          <strong
            style={{
              color:
                "rgba(255,255,255,0.82)",
            }}
          >
            {
              displayQuery
            }
          </strong>
          .
        </p>

      </div>


      {/* =================================================
          COMPARISON STATS
      ================================================= */}

      <div
        style={{
          display:
            "grid",
          gridTemplateColumns:
            "repeat(4, minmax(0, 1fr))",
          gap:
            "12px",
        }}
      >

        {/* LOWEST PRICE */}

        <div
          style={{
            padding:
              "18px",
            borderRadius:
              "16px",
            border:
              "1px solid rgba(255,255,255,0.1)",
            background:
              "rgba(255,255,255,0.035)",
          }}
        >

          <span
            style={{
              display:
                "block",
              fontSize:
                "11px",
              letterSpacing:
                "0.12em",
              color:
                "rgba(255,255,255,0.42)",
              marginBottom:
                "8px",
            }}
          >
            LOWEST PRICE
          </span>


          <strong
            style={{
              display:
                "block",
              fontSize:
                "25px",
              color:
                "#fff",
            }}
          >
            {
              formatPrice(
                lowestPrice
              )
            }
          </strong>


          <span
            style={{
              display:
                "block",
              marginTop:
                "5px",
              fontSize:
                "12px",
              color:
                "rgba(255,255,255,0.5)",
            }}
          >
            {
              lowest.platform ||
              "Marketplace"
            }
          </span>

        </div>


        {/* SAVINGS */}

        <div
          style={{
            padding:
              "18px",
            borderRadius:
              "16px",
            border:
              "1px solid rgba(255,255,255,0.1)",
            background:
              "rgba(255,255,255,0.035)",
          }}
        >

          <span
            style={{
              display:
                "block",
              fontSize:
                "11px",
              letterSpacing:
                "0.12em",
              color:
                "rgba(255,255,255,0.42)",
              marginBottom:
                "8px",
            }}
          >
            POTENTIAL SAVINGS
          </span>


          <strong
            style={{
              display:
                "block",
              fontSize:
                "25px",
              color:
                "#fff",
            }}
          >
            {
              formatPrice(
                priceDifference
              )
            }
          </strong>


          <span
            style={{
              display:
                "block",
              marginTop:
                "5px",
              fontSize:
                "12px",
              color:
                "rgba(255,255,255,0.5)",
            }}
          >
            {
              savingsPercentage.toFixed(
                1
              )
            }% vs highest verified listing
          </span>

        </div>


        {/* AVERAGE */}

        <div
          style={{
            padding:
              "18px",
            borderRadius:
              "16px",
            border:
              "1px solid rgba(255,255,255,0.1)",
            background:
              "rgba(255,255,255,0.035)",
          }}
        >

          <span
            style={{
              display:
                "block",
              fontSize:
                "11px",
              letterSpacing:
                "0.12em",
              color:
                "rgba(255,255,255,0.42)",
              marginBottom:
                "8px",
            }}
          >
            AVERAGE PRICE
          </span>


          <strong
            style={{
              display:
                "block",
              fontSize:
                "25px",
              color:
                "#fff",
            }}
          >
            {
              formatPrice(
                averagePrice
              )
            }
          </strong>


          <span
            style={{
              display:
                "block",
              marginTop:
                "5px",
              fontSize:
                "12px",
              color:
                "rgba(255,255,255,0.5)",
            }}
          >
            Across verified results
          </span>

        </div>


        {/* MARKETPLACES */}

        <div
          style={{
            padding:
              "18px",
            borderRadius:
              "16px",
            border:
              "1px solid rgba(255,255,255,0.1)",
            background:
              "rgba(255,255,255,0.035)",
          }}
        >

          <span
            style={{
              display:
                "block",
              fontSize:
                "11px",
              letterSpacing:
                "0.12em",
              color:
                "rgba(255,255,255,0.42)",
              marginBottom:
                "8px",
            }}
          >
            MARKETPLACES
          </span>


          <strong
            style={{
              display:
                "block",
              fontSize:
                "25px",
              color:
                "#fff",
            }}
          >
            {
              platforms.length
            }
          </strong>


          <span
            style={{
              display:
                "block",
              marginTop:
                "5px",
              fontSize:
                "12px",
              color:
                "rgba(255,255,255,0.5)",
              lineHeight:
                1.5,
            }}
          >
            {
              platforms.join(
                " • "
              )
            }
          </span>

        </div>

      </div>


      {/* =================================================
          LOWEST VERIFIED LISTING
      ================================================= */}

      <div
        style={{
          marginTop:
            "14px",
          padding:
            "20px",
          borderRadius:
            "18px",
          border:
            "1px solid rgba(255,255,255,0.12)",
          background:
            "rgba(255,255,255,0.045)",
          display:
            "flex",
          alignItems:
            "center",
          justifyContent:
            "space-between",
          gap:
            "20px",
        }}
      >

        <div>

          <span
            style={{
              display:
                "block",
              fontSize:
                "11px",
              letterSpacing:
                "0.12em",
              color:
                "rgba(255,255,255,0.42)",
              marginBottom:
                "6px",
            }}
          >
            LOWEST VERIFIED OFFER
          </span>


          <strong
            style={{
              display:
                "block",
              fontSize:
                "18px",
              color:
                "#fff",
              lineHeight:
                1.4,
            }}
          >
            {
              lowest.title ||
              "Product"
            }
          </strong>


          <span
            style={{
              display:
                "block",
              marginTop:
                "5px",
              fontSize:
                "12px",
              color:
                "rgba(255,255,255,0.5)",
            }}
          >
            {
              lowest.platform ||
              "Marketplace"
            }
          </span>

        </div>


        <div
          style={{
            textAlign:
              "right",
            flexShrink:
              0,
          }}
        >

          <strong
            style={{
              display:
                "block",
              fontSize:
                "32px",
              color:
                "#fff",
            }}
          >
            {
              formatPrice(
                lowestPrice
              )
            }
          </strong>


          {
            priceDifference >
              0 && (

              <span
                style={{
                  display:
                    "block",
                  marginTop:
                    "2px",
                  fontSize:
                    "12px",
                  color:
                    "rgba(255,255,255,0.5)",
                }}
              >
                Up to{" "}
                {
                  formatPrice(
                    priceDifference
                  )
                }{" "}
                less than the highest
                verified listing
              </span>

            )
          }


          {lowest.url && (

            <a
              href={
                lowest.url
              }
              target="_blank"
              rel="noreferrer"
              style={{
                display:
                  "inline-block",
                marginTop:
                  "8px",
                color:
                  "rgba(255,255,255,0.75)",
                fontSize:
                  "12px",
                fontWeight:
                  700,
                textDecoration:
                  "none",
              }}
            >
              Open lowest price ↗
            </a>

          )}

        </div>

      </div>


      {/* =================================================
          MARKETPLACE PRICE TABLE
      ================================================= */}

      {platformPrices.length >
        1 && (

        <div
          style={{
            marginTop:
              "14px",
            borderRadius:
              "18px",
            border:
              "1px solid rgba(255,255,255,0.1)",
            overflow:
              "hidden",
            background:
              "rgba(255,255,255,0.025)",
          }}
        >

          <div
            style={{
              padding:
                "15px 18px",
              borderBottom:
                "1px solid rgba(255,255,255,0.08)",
              fontSize:
                "11px",
              letterSpacing:
                "0.12em",
              color:
                "rgba(255,255,255,0.45)",
            }}
          >
            LOWEST VERIFIED PRICE BY MARKETPLACE
          </div>


          {platformPrices.map(
            (
              item,
              index
            ) => (

              <div
                key={
                  item.platform
                }
                style={{
                  display:
                    "grid",
                  gridTemplateColumns:
                    "1.1fr 2fr auto auto",
                  gap:
                    "14px",
                  alignItems:
                    "center",
                  padding:
                    "15px 18px",
                  borderBottom:
                    index ===
                    platformPrices.length - 1
                      ? "none"
                      : "1px solid rgba(255,255,255,0.06)",
                }}
              >

                <strong
                  style={{
                    color:
                      "#fff",
                    fontSize:
                      "13px",
                  }}
                >
                  {
                    item.platform
                  }
                </strong>


                <span
                  style={{
                    color:
                      "rgba(255,255,255,0.58)",
                    fontSize:
                      "12px",
                    whiteSpace:
                      "nowrap",
                    overflow:
                      "hidden",
                    textOverflow:
                      "ellipsis",
                  }}
                >
                  {
                    item.product?.title ||
                    "Product"
                  }
                </span>


                <strong
                  style={{
                    color:
                      "#fff",
                    fontSize:
                      "14px",
                  }}
                >
                  {
                    formatPrice(
                      item.product?.price
                    )
                  }
                </strong>


                {
                  item.product?.url && (

                  <a
                    href={
                      item.product.url
                    }
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color:
                        "rgba(255,255,255,0.68)",
                      fontSize:
                        "11px",
                      textDecoration:
                        "none",
                    }}
                  >
                    View ↗
                  </a>

                )
                }

              </div>

            )
          )}

        </div>

      )}


      {/* =================================================
          CLARITY NOTE
      ================================================= */}

      <p
        style={{
          margin:
            "14px 4px 0",
          textAlign:
            "center",
          color:
            "rgba(255,255,255,0.32)",
          fontSize:
            "11px",
          lineHeight:
            1.6,
        }}
      >
        Comparison uses currently verified
        listings. Different brands, models,
        capacities or variants may have
        different specifications, even when
        they match the same search intent.
      </p>

    </section>

  );

}


/*
=====================================================
SMART PRODUCT COMPARISON HELPERS
=====================================================
*/

function normalizeComparisonText(value) {

  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUnit(value, unit) {

  const number = Number(value);
  const normalizedUnit = String(unit || "").toLowerCase();

  if (!Number.isFinite(number)) {
    return null;
  }

  if (normalizedUnit === "kg") {
    return { value: number * 1000, unit: "g" };
  }

  if (normalizedUnit === "mg") {
    return { value: number / 1000, unit: "g" };
  }

  if (normalizedUnit === "l" || normalizedUnit === "litre" || normalizedUnit === "litres") {
    return { value: number * 1000, unit: "ml" };
  }

  return { value: number, unit: normalizedUnit };
}

function firstStructuredValue(product, keys) {

  for (const key of keys) {
    const value = product?.[key];

    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
}

function extractComparisonAttributes(product) {

  const title = String(product?.title || "");
  const combined = `${title} ${JSON.stringify(product || {})}`;

  const capacityRaw =
    firstStructuredValue(product, [
      "capacity",
      "eggCapacity",
      "quantity",
      "count",
    ]) ||
    (() => {
      const match = combined.match(/\b(\d{1,3})\s*(?:eggs?|pcs?|pieces?|units?)\b/i);
      return match ? `${match[1]} units` : "";
    })();

  const wattageRaw =
    firstStructuredValue(product, [
      "wattage",
      "power",
      "powerConsumption",
    ]) ||
    (() => {
      const match = combined.match(/\b(\d{2,4}(?:\.\d+)?)\s*(?:w|watts?)\b/i);
      return match ? `${match[1]} W` : "";
    })();

  const weightRaw =
    firstStructuredValue(product, [
      "weight",
      "netWeight",
      "size",
    ]) ||
    (() => {
      const match = combined.match(/\b(\d+(?:\.\d+)?)\s*(kg|g|mg)\b/i);
      return match ? `${match[1]} ${match[2]}` : "";
    })();

  const volumeRaw =
    firstStructuredValue(product, [
      "volume",
      "capacityVolume",
    ]) ||
    (() => {
      const match = combined.match(/\b(\d+(?:\.\d+)?)\s*(ml|l|litre|litres)\b/i);
      return match ? `${match[1]} ${match[2]}` : "";
    })();

  const material =
    firstStructuredValue(product, [
      "material",
      "bodyMaterial",
    ]) ||
    (() => {
      const match = combined.match(/\b(stainless steel|steel|plastic|aluminium|aluminum|glass)\b/i);
      return match ? match[1] : "";
    })();

  const flavour =
    firstStructuredValue(product, [
      "flavour",
      "flavor",
    ]);

  const packRaw =
    firstStructuredValue(product, [
      "packSize",
      "pack",
      "packOf",
    ]) ||
    (() => {
      const match = combined.match(/\bpack\s*(?:of)?\s*(\d{1,3})\b/i);
      return match ? `Pack of ${match[1]}` : "";
    })();

  const capacityMatch = capacityRaw.match(/(\d+(?:\.\d+)?)/);
  const wattageMatch = wattageRaw.match(/(\d+(?:\.\d+)?)/);
  const weightMatch = weightRaw.match(/(\d+(?:\.\d+)?)\s*(kg|g|mg)/i);
  const volumeMatch = volumeRaw.match(/(\d+(?:\.\d+)?)\s*(ml|l|litre|litres)/i);
  const packMatch = packRaw.match(/(\d+(?:\.\d+)?)/);

  const weight = weightMatch
    ? normalizeUnit(weightMatch[1], weightMatch[2])
    : null;

  const volume = volumeMatch
    ? normalizeUnit(volumeMatch[1], volumeMatch[2])
    : null;

  return {
    brand: String(product?.brand || "").trim(),
    capacity: capacityMatch ? Number(capacityMatch[1]) : null,
    wattage: wattageMatch ? Number(wattageMatch[1]) : null,
    weightValue: weight?.unit === "g" ? weight.value : null,
    weightLabel: weight ? `${weight.value % 1 === 0 ? weight.value : weight.value.toFixed(1)} g` : "",
    volumeValue: volume?.unit === "ml" ? volume.value : null,
    volumeLabel: volume ? `${volume.value % 1 === 0 ? volume.value : volume.value.toFixed(1)} ml` : "",
    material,
    flavour,
    packCount: packMatch ? Number(packMatch[1]) : null,
  };
}

function buildSearchIdentity(searchQuery) {

  const stopWords = new Set([
    "best",
    "buy",
    "online",
    "cheap",
    "price",
    "prices",
    "latest",
    "deal",
    "deals",
    "product",
    "products",
  ]);

  return normalizeComparisonText(searchQuery)
    .split(" ")
    .filter(Boolean)
    .filter(word => word.length > 2)
    .filter(word => !stopWords.has(word))
    .slice(0, 6);
}

function createSmartGroupKey(product, searchQuery) {

  const attributes = extractComparisonAttributes(product);
  const identity = buildSearchIdentity(searchQuery);

  const titleText = normalizeComparisonText(product?.title);
  const identityMatches = identity.filter(word =>
    titleText.includes(word)
  );

  const identityPart =
    identityMatches.length > 0
      ? identityMatches.join("-")
      : identity.join("-") || "product";

  const specs = [
    attributes.capacity !== null ? `cap-${attributes.capacity}` : "",
    attributes.wattage !== null ? `power-${attributes.wattage}` : "",
    attributes.weightValue !== null ? `weight-${attributes.weightValue}g` : "",
    attributes.volumeValue !== null ? `volume-${attributes.volumeValue}ml` : "",
    attributes.packCount !== null ? `pack-${attributes.packCount}` : "",
    attributes.material ? `material-${normalizeComparisonText(attributes.material)}` : "",
    attributes.flavour ? `flavour-${normalizeComparisonText(attributes.flavour)}` : "",
  ].filter(Boolean);

  return `${identityPart}|${specs.join("|") || "standard"}`;
}

function getVariantLabel(attributes) {

  const pieces = [];

  if (attributes.capacity !== null) {
    pieces.push(`${attributes.capacity}-unit capacity`);
  }

  if (attributes.wattage !== null) {
    pieces.push(`${attributes.wattage}W`);
  }

  if (attributes.weightLabel) {
    pieces.push(attributes.weightLabel);
  }

  if (attributes.volumeLabel) {
    pieces.push(attributes.volumeLabel);
  }

  if (attributes.packCount !== null) {
    pieces.push(`Pack of ${attributes.packCount}`);
  }

  if (attributes.material) {
    pieces.push(attributes.material);
  }

  if (attributes.flavour) {
    pieces.push(attributes.flavour);
  }

  return pieces.length > 0
    ? pieces.join(" • ")
    : "Standard variant";
}

function getUnitValue(product, attributes) {

  const price = Number(product?.price);

  if (!Number.isFinite(price) || price < 0) {
    return null;
  }

  if (attributes.capacity && attributes.capacity > 0) {
    return {
      value: price / attributes.capacity,
      label: "per unit",
    };
  }

  if (attributes.weightValue && attributes.weightValue > 0) {
    return {
      value: price / attributes.weightValue * 100,
      label: "per 100 g",
    };
  }

  if (attributes.volumeValue && attributes.volumeValue > 0) {
    return {
      value: price / attributes.volumeValue * 100,
      label: "per 100 ml",
    };
  }

  if (attributes.packCount && attributes.packCount > 0) {
    return {
      value: price / attributes.packCount,
      label: "per pack unit",
    };
  }

  return null;
}

function buildSmartComparisonGroups(products, searchQuery) {

  const groups = new Map();

  for (const product of products || []) {

    const price = Number(product?.price);

    if (!Number.isFinite(price) || price < 0) {
      continue;
    }

    const attributes = extractComparisonAttributes(product);
    const key = createSmartGroupKey(product, searchQuery);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        products: [],
        attributes,
      });
    }

    groups.get(key).products.push({
      ...product,
      __attributes: attributes,
    });
  }

  return [...groups.values()]
    .map(group => {

      const sorted = [...group.products].sort(
        (a, b) => Number(a.price) - Number(b.price)
      );

      const platformMap = new Map();

      for (const product of sorted) {
        const platform = product.platform || "Marketplace";
        if (!platformMap.has(platform)) {
          platformMap.set(platform, product);
        }
      }

      const unitValueProducts = sorted
        .map(product => ({
          product,
          unitValue: getUnitValue(product, product.__attributes),
        }))
        .filter(item => item.unitValue);

      return {
        ...group,
        products: sorted,
        cheapest: sorted[0],
        highest: sorted[sorted.length - 1],
        marketplaces: [...platformMap.values()],
        unitValueProducts,
      };
    })
    .sort((a, b) => {
      if (b.marketplaces.length !== a.marketplaces.length) {
        return b.marketplaces.length - a.marketplaces.length;
      }
      return Number(a.cheapest?.price || 0) - Number(b.cheapest?.price || 0);
    });
}

/*
=====================================================
SMART PRODUCT / VARIANT COMPARISON
=====================================================
*/

function SmartProductComparison({
  products,
  searchQuery,
}) {

  const groups = buildSmartComparisonGroups(
    products,
    searchQuery
  );

  if (groups.length === 0) {
    return null;
  }

  return (
    <section className="smart-comparison-section">

      <div style={{ marginBottom: "18px" }}>
        <span className="section-kicker">
          SMART PRODUCT COMPARISON
        </span>

        <h2
          style={{
            margin: "6px 0",
            fontSize: "27px",
            lineHeight: 1.2,
          }}
        >
          Compare variants, not just prices.
        </h2>

        <p
          style={{
            margin: 0,
            color: "rgba(255,255,255,0.5)",
            fontSize: "14px",
            lineHeight: 1.6,
          }}
        >
          StockSense groups the verified listings by comparable
          attributes such as capacity, power, weight, volume,
          pack size and material before showing price differences.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: "14px",
        }}
      >

        {groups.map((group, index) => {

          const attributes = group.attributes;
          const variantLabel = getVariantLabel(attributes);
          const cheapest = group.cheapest;
          const cheapestUnitValue = getUnitValue(
            cheapest,
            cheapest.__attributes
          );

          return (
            <article
              key={group.key}
              style={{
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.035)",
                borderRadius: "18px",
                padding: "18px",
                boxShadow: "0 16px 40px rgba(0,0,0,0.16)",
              }}
            >

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <span
                    style={{
                      display: "block",
                      color: "rgba(255,255,255,0.4)",
                      fontSize: "10px",
                      letterSpacing: "0.12em",
                      marginBottom: "6px",
                    }}
                  >
                    VARIANT GROUP {index + 1}
                  </span>

                  <h3
                    style={{
                      margin: 0,
                      fontSize: "18px",
                      lineHeight: 1.3,
                    }}
                  >
                    {variantLabel}
                  </h3>
                </div>

                <span
                  style={{
                    flexShrink: 0,
                    padding: "6px 9px",
                    borderRadius: "999px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.58)",
                    fontSize: "10px",
                  }}
                >
                  {group.products.length} listings
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "8px",
                  marginBottom: "14px",
                }}
              >
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      color: "rgba(255,255,255,0.4)",
                      fontSize: "10px",
                      marginBottom: "5px",
                    }}
                  >
                    LOWEST IN GROUP
                  </span>
                  <strong style={{ fontSize: "21px" }}>
                    {formatPrice(cheapest.price)}
                  </strong>
                </div>

                <div
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      color: "rgba(255,255,255,0.4)",
                      fontSize: "10px",
                      marginBottom: "5px",
                    }}
                  >
                    MARKETPLACES
                  </span>
                  <strong style={{ fontSize: "21px" }}>
                    {group.marketplaces.length}
                  </strong>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  marginBottom: "14px",
                }}
              >
                {group.marketplaces.map(product => (
                  <span
                    key={`${group.key}-${product.platform}`}
                    style={{
                      padding: "6px 8px",
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.05)",
                      color: "rgba(255,255,255,0.66)",
                      fontSize: "11px",
                    }}
                  >
                    {product.platform}: {formatPrice(product.price)}
                  </span>
                ))}
              </div>

              <div
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  paddingTop: "12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                  gap: "12px",
                }}
              >
                <div>
                  <span
                    style={{
                      display: "block",
                      color: "rgba(255,255,255,0.38)",
                      fontSize: "10px",
                      marginBottom: "4px",
                    }}
                  >
                    LOWEST OFFER
                  </span>

                  <strong style={{ fontSize: "13px" }}>
                    {cheapest.platform || "Marketplace"}
                  </strong>

                  {cheapestUnitValue && (
                    <small
                      style={{
                        display: "block",
                        marginTop: "4px",
                        color: "rgba(255,255,255,0.42)",
                      }}
                    >
                      ₹{cheapestUnitValue.value.toFixed(2)} {cheapestUnitValue.label}
                    </small>
                  )}
                </div>

                {cheapest.url ? (
                  <a
                    href={cheapest.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      textDecoration: "none",
                      padding: "8px 11px",
                      borderRadius: "9px",
                      background: "rgba(255,255,255,0.92)",
                      color: "#111",
                      fontSize: "11px",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                    }}
                  >
                    View offer ↗
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}

      </div>

      <p
        style={{
          margin: "16px 4px 0",
          color: "rgba(255,255,255,0.34)",
          fontSize: "11px",
          lineHeight: 1.6,
        }}
      >
        Unit-value figures are derived from specifications visible in the verified listing title or product fields. Different variants can have different capabilities, so these figures are reference metrics rather than a universal “best value” score.
      </p>
    </section>
  );
}



/*
=====================================================
MAIN APP
=====================================================
*/

function App() {

  /*
  ===================================================
  SEARCH
  ===================================================
  */

  const [
    query,
    setQuery,
  ] = useState("");


  const [
    category,
    setCategory,
  ] = useState("all");


  /*
  ===================================================
  NAVIGATION MENU
  ===================================================
  */

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false);


  /*
  ===================================================
  RESULTS
  ===================================================
  */

  const [
    results,
    setResults,
  ] = useState([]);


  /*
  ===================================================
  LOADING
  ===================================================
  */

  const [
    loading,
    setLoading,
  ] = useState(false);


  /*
  ===================================================
  ERROR
  ===================================================
  */

  const [
    error,
    setError,
  ] = useState("");


  /*
  ===================================================
  PRODUCT
  ===================================================
  */

  const [
    searchedProduct,
    setSearchedProduct,
  ] = useState(null);


  const [
    currentListing,
    setCurrentListing,
  ] = useState(null);


  /*
  ===================================================
  WATCHLIST
  ===================================================
  */

  const [
    watchlist,
    setWatchlist,
  ] = useState(() => {
    try {
      const stored = localStorage.getItem("stocksense_watchlist");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    }
    catch {
      return [];
    }
  });


  /*
  ===================================================
  PRICE INTELLIGENCE
  ===================================================
  */

  const [
    priceIntelligence,
    setPriceIntelligence,
  ] = useState(null);


  const [
    priceHistory,
    setPriceHistory,
  ] = useState([]);


  const [
    priceEvent,
    setPriceEvent,
  ] = useState(null);


  const [
    restockMessage,
    setRestockMessage,
  ] = useState("");


  const [
    recommendations,
    setRecommendations,
  ] = useState(null);


  /*
  ===================================================
  REQUEST CONTROL
  ===================================================
  */

  const requestController =
    useRef(null);


  const requestId =
    useRef(0);


  /*
===================================================
BRAND INTRO / SPLASH
===================================================
*/

const [
  splashVisible,
  setSplashVisible,
] = useState(true);

  /*
  ===================================================
  AUTHENTICATION
  ===================================================
  */

  const [
    authenticated,
    setAuthenticated,
  ] = useState(false);


  const [
    currentUser,
    setCurrentUser,
  ] = useState(null);


  const [
    authOpen,
    setAuthOpen,
  ] = useState(false);


  const [
    authMode,
    setAuthMode,
  ] = useState("login");


  const [
    authName,
    setAuthName,
  ] = useState("");


  const [
    authEmail,
    setAuthEmail,
  ] = useState("");


  const [
    authPassword,
    setAuthPassword,
  ] = useState("");


  const [
    authLoading,
    setAuthLoading,
  ] = useState(false);


  const [
    authError,
    setAuthError,
  ] = useState("");


  /*
  ===================================================
  RESTORE AUTHENTICATION
  ===================================================
  */

  useEffect(() => {

    const token =
      localStorage.getItem(
        "stocksense_token"
      );


    const storedUser =
      localStorage.getItem(
        "stocksense_user"
      );


    if (
      token
    ) {

      setAuthenticated(
        true
      );

    }


    if (
      storedUser
    ) {

      try {

        const parsedUser =
          JSON.parse(
            storedUser
          );

        setCurrentUser(
          parsedUser
        );

      }
      catch {

        localStorage.removeItem(
          "stocksense_user"
        );

      }

    }

  }, []);


  useEffect(() => {

    if (!menuOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };

  }, [menuOpen]);


  useEffect(() => {
    try {
      localStorage.setItem(
        "stocksense_watchlist",
        JSON.stringify(watchlist)
      );
    }
    catch {
      // Keep the watchlist available in memory even if local storage is blocked.
    }
  }, [watchlist]);


  function getWatchlistKey(item) {
    return String(
      item?.url ||
      `${item?.platform || "marketplace"}::${item?.title || "product"}`
    ).trim().toLowerCase();
  }


  function makeWatchlistItem(item, fallbackTitle = query) {
    const currentPrice = Number(
      item?.price ?? item?.currentPrice
    );

    const stockStatus =
      getAvailabilityValue(item) ||
      (item?.stock || "UNKNOWN").toString().toUpperCase();

    return {
      key: getWatchlistKey(item),
      title: item?.title || fallbackTitle || "Product",
      platform: item?.platform || "Marketplace",
      url: item?.url || "",
      image: item?.image || "",
      price: Number.isFinite(currentPrice) ? currentPrice : null,
      stock: stockStatus,
      targetPrice: item?.targetPrice ?? "",
      addedAt: item?.addedAt || new Date().toISOString(),
    };
  }


  function isInWatchlist(item) {
    const key = getWatchlistKey(item);
    return watchlist.some(
      entry => entry.key === key
    );
  }


  function addToWatchlist(item, fallbackTitle = query) {
    const entry = makeWatchlistItem(
      item,
      fallbackTitle
    );

    setWatchlist(previous => {
      if (previous.some(current => current.key === entry.key)) {
        return previous;
      }

      return [
        entry,
        ...previous,
      ];
    });
  }


  function removeFromWatchlist(key) {
    setWatchlist(previous =>
      previous.filter(
        entry => entry.key !== key
      )
    );
  }


  function updateWatchlistTarget(key, value) {
    setWatchlist(previous =>
      previous.map(entry =>
        entry.key === key
          ? {
              ...entry,
              targetPrice: value,
            }
          : entry
      )
    );
  }


  function navigateFromMenu(target) {

    setMenuOpen(false);

    window.setTimeout(() => {

      if (target === "home") {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }

      if (target === "search") {
        const input = document.querySelector(".search-shell input");

        input?.focus();

        document.querySelector(".hero")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        return;
      }

      const targetSelectors = {
        overview: ".product-overview",
        intelligence: ".intelligence-card",
        history: ".price-history-panel",
        compare: ".results",
        watchlist: ".watchlist-panel",
        alerts: ".restock-alert-button",
      };

      const element =
        document.querySelector(targetSelectors[target]);

      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }

    }, 40);
  }

  /*
===================================================
BRAND INTRO
===================================================
*/

useEffect(() => {

  const timer =
    window.setTimeout(() => {

      setSplashVisible(false);

    }, 2800);

  return () => {
    window.clearTimeout(timer);
  };

}, []);

/*
===================================================
OPEN LOGIN AFTER SPLASH
===================================================
*/

useEffect(() => {

  if (
    !splashVisible &&
    !authenticated
  ) {

    setAuthMode("login");
    setAuthError("");
    setAuthOpen(true);

  }

}, [
  splashVisible,
  authenticated,
]);

  /*
  ===================================================
  RESTOCK ALERT / INVENTORY EFFECT
  ===================================================
  */


  useEffect(() => {

    if (
      !currentListing ||
      getAvailabilityValue(
        currentListing
      ) !== "IN_STOCK"
    ) {
      return;
    }

    const watchedUrl =
      String(
        currentListing.url ||
        ""
      ).trim();

    if (!watchedUrl) {
      return;
    }

    const key =
      `stocksense_restock_${watchedUrl}`;

    const saved =
      localStorage.getItem(key);

    if (!saved) {
      return;
    }

    const title =
      searchedProduct?.title ||
      currentListing.title ||
      "Product";

    setRestockMessage(
      `${title} is back in stock on ${currentListing.platform || "the marketplace"}.`
    );

    if (
      typeof Notification !==
      "undefined" &&
      Notification.permission ===
      "granted"
    ) {
      try {
        new Notification(
          "StockSense • Back in stock",
          {
            body:
              `${title} is available again.`,
          }
        );
      }
      catch {
        // Browser notification may be unavailable.
      }
    }

    localStorage.removeItem(key);

  }, [
    currentListing,
    searchedProduct,
  ]);


  /*
  ===================================================
  LOGIN
  ===================================================
  */

  async function loginUser(
    email,
    password
  ) {

    const response =
      await fetch(
        `${API_BASE_URL}/api/auth/login`,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              email,
              password,
            }),
        }
      );


    let data = {};


    try {

      data =
        await response.json();

    }
    catch {

      data = {};

    }


    if (
      !response.ok
    ) {

      throw new Error(
        data.message ||
        data.error ||
        "Login failed."
      );

    }


    if (
      !data.token
    ) {

      throw new Error(
        "Login succeeded, but no authentication token was returned."
      );

    }


    /*
    ---------------------------------------------------
    SAVE TOKEN
    ---------------------------------------------------
    */

    localStorage.setItem(
      "stocksense_token",
      data.token
    );


    /*
    ---------------------------------------------------
    SAVE USER
    ---------------------------------------------------
    */

    if (
      data.user
    ) {

      localStorage.setItem(
        "stocksense_user",
        JSON.stringify(
          data.user
        )
      );


      setCurrentUser(
        data.user
      );

    }


    setAuthenticated(
      true
    );


    setAuthOpen(
      false
    );


    setAuthError(
      ""
    );


    setAuthPassword(
      ""
    );


    setError(
      ""
    );

  }


  /*
  ===================================================
  LOGIN / SIGNUP FORM
  ===================================================
  */

  async function handleAuthSubmit(
    event
  ) {

    event.preventDefault();


    const email =
      authEmail.trim();


    const password =
      authPassword;


    /*
    ---------------------------------------------------
    VALIDATION
    ---------------------------------------------------
    */

    if (
      !email ||
      !password
    ) {

      setAuthError(
        "Please enter your email and password."
      );

      return;

    }


    if (
      authMode ===
      "signup" &&
      !authName.trim()
    ) {

      setAuthError(
        "Please enter your name."
      );

      return;

    }


    try {

      setAuthLoading(
        true
      );


      setAuthError(
        ""
      );


      /*
      =================================================
      SIGNUP
      =================================================
      */

      if (
        authMode ===
        "signup"
      ) {

        const response =
          await fetch(
            `${API_BASE_URL}/api/auth/signup`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  name:
                    authName.trim(),

                  email,

                  password,
                }),
            }
          );


        let data = {};


        try {

          data =
            await response.json();

        }
        catch {

          data = {};

        }


        if (
          !response.ok
        ) {

          throw new Error(
            data.message ||
            data.error ||
            "Signup failed."
          );

        }


        /*
        ----------------------------------------------
        AUTO LOGIN
        ----------------------------------------------
        */

        await loginUser(
          email,
          password
        );


        setAuthName("");

      }
      else {

        /*
        =================================================
        LOGIN
        =================================================
        */

        await loginUser(
          email,
          password
        );

      }

    }
    catch (err) {

      console.error(
        "StockSense authentication failed:",
        err
      );


      setAuthError(
        err.message ||
        "Authentication failed."
      );

    }
    finally {

      setAuthLoading(
        false
      );

    }

  }


  /*
  ===================================================
  OPEN AUTH
  ===================================================
  */

  function openAuth(
    mode = "login"
  ) {

    setAuthMode(
      mode
    );


    setAuthError(
      ""
    );


    setAuthOpen(
      true
    );

  }


  /*
  ===================================================
  HANDLE SEARCH / ANALYZE
  ===================================================
  */

  async function handleSearch() {

    const trimmedQuery =
      query.trim();


    /*
    =================================================
    VALIDATION
    =================================================
    */

    if (
      !trimmedQuery
    ) {

      setError(
        "Please enter a product name or paste a product URL."
      );

      return;

    }


    /*
    =================================================
    AUTH
    =================================================
    */

    const token =
      localStorage.getItem(
        "stocksense_token"
      );


    if (
      !token
    ) {

      setError("");

      openAuth(
        "login"
      );

      return;

    }


    /*
    =================================================
    DETECT INPUT TYPE
    =================================================
    */

    const inputIsUrl =
      isValidProductUrl(
        trimmedQuery
      );


    /*
    =================================================
    CANCEL PREVIOUS REQUEST
    =================================================
    */

    if (
      requestController.current
    ) {

      requestController.current.abort();

    }


    const controller =
      new AbortController();


    requestController.current =
      controller;


    const currentRequestId =
      ++requestId.current;


    try {

      setLoading(
        true
      );


      setError(
        ""
      );


      /*
      =================================================
      CLEAR PREVIOUS DATA
      =================================================
      */

      setResults([]);

      setSearchedProduct(
        null
      );

      setCurrentListing(
        null
      );

      setPriceIntelligence(
        null
      );

      setPriceHistory(
        []
      );

      setPriceEvent(
        null
      );

      setRestockMessage(
        ""
      );

      setRecommendations(
        null
      );


      /*
      =================================================
      ENDPOINT
      =================================================
      */

      const endpoint =
        inputIsUrl

          ? `${API_BASE_URL}/api/check-now`

          : `${API_BASE_URL}/api/search`;


      /*
      =================================================
      BODY
      =================================================
      */

      const requestBody =
        inputIsUrl

          ? {
            url:
              trimmedQuery,
          }

          : {
            query:
              trimmedQuery,

            ...(category !==
              "all"
              ? {
                category,
              }
              : {}),
          };


      console.log(
        "StockSense input:",
        trimmedQuery
      );


      console.log(
        "StockSense mode:",
        inputIsUrl
          ? "URL ANALYSIS"
          : "PRODUCT SEARCH"
      );


      console.log(
        "StockSense endpoint:",
        endpoint
      );


      /*
      =================================================
      API REQUEST
      =================================================
      */

      const response =
        await fetch(
          endpoint,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              Authorization:
                `Bearer ${token}`,
            },

            body:
              JSON.stringify(
                requestBody
              ),

            signal:
              controller.signal,
          }
        );


      /*
      =================================================
      RESPONSE JSON
      =================================================
      */

      let data = {};


      try {

        data =
          await response.json();

      }
      catch {

        data = {};

      }


      /*
      =================================================
      STALE REQUEST
      =================================================
      */

      if (
        currentRequestId !==
        requestId.current
      ) {

        return;

      }


      /*
      =================================================
      AUTH ERROR
      =================================================
      */

      if (
        response.status ===
        401 ||
        response.status ===
        403
      ) {

        localStorage.removeItem(
          "stocksense_token"
        );


        localStorage.removeItem(
          "stocksense_user"
        );


        setAuthenticated(
          false
        );


        setCurrentUser(
          null
        );


        setAuthEmail(
          ""
        );


        setAuthPassword(
          ""
        );


        openAuth(
          "login"
        );


        throw new Error(
          "Your login session is no longer valid. Please login again."
        );

      }


      /*
      =================================================
      GENERAL ERROR
      =================================================
      */

      if (
        !response.ok
      ) {

        throw new Error(
          data.message ||
          data.error ||
          (
            inputIsUrl
              ? "Product analysis failed."
              : "Product search failed."
          )
        );

      }


      /*
      =================================================
      URL ANALYSIS
      =================================================
      */

      if (
        inputIsUrl
      ) {

        /*
        The check endpoint has existed in more than one response
        shape over the life of StockSense:

          { product, priceAnalysis, history, ... }
          { data: { product, priceAnalysis, history, ... } }
          { results: { ... } }
          { result: { ... } }

        Flatten one nested `data` object so historical snapshots
        are not silently lost just because the API wrapper changed.
        */

        let pipelineResult =
          data.results ||
          data.result ||
          data.data ||
          data;

        if (
          pipelineResult &&
          pipelineResult.data &&
          typeof pipelineResult.data ===
            "object" &&
          !Array.isArray(
            pipelineResult.data
          )
        ) {

          pipelineResult = {
            ...pipelineResult.data,
            ...pipelineResult,
          };

        }


        /*
        ----------------------------------------------
        PRODUCT
        ----------------------------------------------
        */

        const product =
          pipelineResult.product ||
          null;


        setSearchedProduct(
          product
        );


        /*
        ----------------------------------------------
        CURRENT LISTING
        ----------------------------------------------
        */

        const rawListing =
          pipelineResult.currentListing ||
          null;

        const scrapedListing =
          pipelineResult.scraped ||
          pipelineResult.sourceListing ||
          pipelineResult.originalListing ||
          pipelineResult.listing ||
          null;

        const mergedListing =
          rawListing || scrapedListing
            ? {
              ...(scrapedListing || {}),
              ...(rawListing || {}),

              availability:
                rawListing?.availability ??
                rawListing?.stock ??
                rawListing?.inStock ??
                rawListing?.available ??
                scrapedListing?.availability ??
                null,

              image:
                rawListing?.image ??
                scrapedListing?.image ??
                null,

              price:
                rawListing?.price ??
                rawListing?.currentPrice ??
                scrapedListing?.price ??
                scrapedListing?.currentPrice ??
                null,

              currentPrice:
                rawListing?.currentPrice ??
                rawListing?.price ??
                scrapedListing?.currentPrice ??
                scrapedListing?.price ??
                null,

              title:
                rawListing?.title ??
                scrapedListing?.title ??
                null,

              platform:
                rawListing?.platform ??
                scrapedListing?.platform ??
                pipelineResult.sourcePlatform ??
                null,

              url:
                rawListing?.url ??
                scrapedListing?.url ??
                null,
            }
            : null;

        const listing =
          mergedListing
            ? {
              ...mergedListing,
              availabilityState:
                getAvailabilityValue(
                  mergedListing
                ),
            }
            : null;


        setCurrentListing(
          listing
        );


        /*
        ----------------------------------------------
        PRICE ANALYSIS
        ----------------------------------------------
        */

        const analysis =
          pipelineResult.priceAnalysis ||
          null;


        /*
        ----------------------------------------------
        HISTORICAL SNAPSHOTS
        ----------------------------------------------
        */

        const historyCandidates =
          [
            pipelineResult.history,
            pipelineResult.priceHistory,
            pipelineResult.priceSnapshots,
            analysis?.history,
            analysis?.priceHistory,
            analysis?.snapshots,
            data?.data?.history,
            data?.data?.priceHistory,
          ];

        const history =
          historyCandidates.find(
            value =>
              Array.isArray(
                value
              ) &&
              value.length > 0
          ) ||
          [];


        setPriceHistory(
          history
        );


        console.log(
          `📈 PRICE VISUAL DATA: ${history.length} history points`
        );


        /*
        ----------------------------------------------
        FULL PRICE INTELLIGENCE
        ----------------------------------------------
        */

        let backendIntelligence =
          pipelineResult.priceIntelligence ||
          null;

        /*
        If the backend exposes the real snapshots, calculate
        low / average / high from those observations for the UI.
        This prevents a stale aggregate from making every product
        appear to have the same historical range.
        */

        const historyPrices =
          history
            .map(
              item =>
                Number(
                  item?.price ??
                  item?.currentPrice
                )
            )
            .filter(
              value =>
                Number.isFinite(
                  value
                )
            );

        if (
          backendIntelligence &&
          historyPrices.length > 0
        ) {

          const visiblePrices =
            historyPrices;

          const derivedLow =
            Math.min(
              ...visiblePrices
            );

          const derivedHigh =
            Math.max(
              ...visiblePrices
            );

          const derivedAverage =
            visiblePrices.reduce(
              (
                sum,
                value
              ) =>
                sum +
                value,
              0
            ) /
            visiblePrices.length;

          backendIntelligence = {
            ...backendIntelligence,

            metrics: {
              ...(
                backendIntelligence.metrics ||
                {}
              ),

              lowestPrice:
                derivedLow,

              highestPrice:
                derivedHigh,

              averagePrice:
                derivedAverage,

              totalSnapshots:
                Math.max(
                  Number(
                    backendIntelligence
                      ?.metrics
                      ?.totalSnapshots
                  ) || 0,
                  history.length
                ),
            },
          };

        }


        if (
          backendIntelligence
        ) {

          setPriceIntelligence(
            backendIntelligence
          );

        }
        else if (
          analysis
        ) {

          const vsAveragePct =
            analysis.averagePrice

              ? (
                (
                  Number(
                    analysis.currentPrice
                  ) -
                  Number(
                    analysis.averagePrice
                  )
                ) /
                Number(
                  analysis.averagePrice
                )
              ) *
              100

              : null;


          const aboveLowestPct =
            analysis.lowestPrice

              ? (
                (
                  Number(
                    analysis.currentPrice
                  ) -
                  Number(
                    analysis.lowestPrice
                  )
                ) /
                Number(
                  analysis.lowestPrice
                )
              ) *
              100

              : null;


          setPriceIntelligence({

            decision: {

              decision:
                "FAIR_PRICE",

              score:
                null,

              confidence:
                null,

              reason:
                "Historical price data is available.",
            },


            forecast: {

              available:
                false,

            },


            metrics: {

              currentPrice:
                analysis.currentPrice,

              lowestPrice:
                analysis.lowestPrice,

              highestPrice:
                analysis.highestPrice,

              averagePrice:
                analysis.averagePrice,

              totalSnapshots:
                analysis.totalSnapshots,

              trend:
                analysis.trend,

              priceDifference:
                analysis.priceDifference,

              vsAveragePct,

              aboveLowestPct,

            },

          });

        }


        /*
        ----------------------------------------------
        HISTORY-DRIVEN METRIC OVERRIDE
        ----------------------------------------------
        */

        if (
          !backendIntelligence &&
          historyPrices.length > 0
        ) {

          const derivedLow =
            Math.min(
              ...historyPrices
            );

          const derivedHigh =
            Math.max(
              ...historyPrices
            );

          const derivedAverage =
            historyPrices.reduce(
              (
                sum,
                value
              ) =>
                sum +
                value,
              0
            ) /
            historyPrices.length;

          setPriceIntelligence(
            current => ({
              ...current,

              metrics: {
                ...(
                  current?.metrics ||
                  {}
                ),

                lowestPrice:
                  derivedLow,

                highestPrice:
                  derivedHigh,

                averagePrice:
                  derivedAverage,

                totalSnapshots:
                  Math.max(
                    Number(
                      current
                        ?.metrics
                        ?.totalSnapshots
                    ) || 0,
                    history.length
                  ),
              },
            })
          );

        }


        /*
        ----------------------------------------------
        LIVE STOCK / PRICE SAFETY
        ----------------------------------------------
        */

        const liveListingUnavailable =
          listing &&
          getAvailabilityValue(
            listing
          ) === "OUT_OF_STOCK";


        const livePriceUnavailable =
          listing &&
          (
            liveListingUnavailable ||
            !hasUsableLivePrice(
              listing
            )
          );


        if (
          livePriceUnavailable
        ) {

          setPriceIntelligence(
            current =>
              current
                ? {
                  ...current,

                  decision: {
                    ...(current.decision || {}),
                    decision:
                      liveListingUnavailable
                        ? "OUT_OF_STOCK"
                        : current
                            ?.decision
                            ?.decision ||
                          "PRICE_DATA",
                    reason:
                      liveListingUnavailable
                        ? "The current marketplace listing is out of stock. Live price is unavailable; historical prices are still shown."
                        : "The marketplace did not expose a usable live price for the current listing.",
                  },

                  metrics: {
                    ...(current.metrics || {}),
                    currentPrice:
                      null,
                  },
                }
                : current
          );

        }


        /*
        ----------------------------------------------
        PRICE EVENT
        ----------------------------------------------
        */

        setPriceEvent(
          pipelineResult.priceEvent ||
          null
        );


        /*
        ----------------------------------------------
        RECOMMENDATIONS
        ----------------------------------------------
        */

        const nextRecommendations =
          pipelineResult.recommendations ||
          null;


        setRecommendations(
          nextRecommendations
        );


        /*
        ----------------------------------------------
        MATCHES
        ----------------------------------------------
        */

        const matches =
          Array.isArray(
            pipelineResult.matches
          )
            ? pipelineResult.matches
            : [];


        /*
        ----------------------------------------------
        ALTERNATIVES
        ----------------------------------------------
        */

        const alternatives =
          Array.isArray(
            nextRecommendations
              ?.alternatives
          )
            ? nextRecommendations
              .alternatives
            : [];


        /*
        ----------------------------------------------
        COMBINE
        ----------------------------------------------
        */

        const combined =
          [
            ...matches,
            ...alternatives,
          ];


        /*
        ----------------------------------------------
        DEDUPLICATE
        ----------------------------------------------
        */

        const uniqueProducts =
          [];


        const seen =
          new Set();


        for (
          const productItem
          of combined
        ) {

          if (
            !productItem ||
            typeof productItem !==
            "object"
          ) {

            continue;

          }


          const key =
            productItem.url ||
            `${productItem.platform || ""}|${productItem.title || ""}|${productItem.price || ""}`;


          if (
            seen.has(key)
          ) {

            continue;

          }


          seen.add(
            key
          );


          uniqueProducts.push(
            productItem
          );

        }


        setResults(
          uniqueProducts
        );


        return;

      }


      /*
      =================================================
      NORMAL PRODUCT SEARCH
      =================================================
      */

      /*
      -------------------------------------------------
      The search endpoint may return products in
      different supported structures. Handle all of
      the structures without changing the backend.
      -------------------------------------------------
      */

      const searchedProducts =
        Array.isArray(
          data.products
        )

          ? data.products

          : Array.isArray(
            data.results
          )

            ? data.results

            : [];


      const searchMatches =
        Array.isArray(
          data.matches
        )
          ? data.matches
          : [];


      const searchRecommendations =
        data.recommendations ||
        null;


      setRecommendations(
        searchRecommendations
      );


      const alternatives =
        Array.isArray(
          searchRecommendations
            ?.alternatives
        )
          ? searchRecommendations
            .alternatives
          : [];


      /*
      -------------------------------------------------
      COMBINE ALL SEARCH RESULTS
      -------------------------------------------------
      */

      const combinedSearchResults =
        [
          ...searchedProducts,
          ...searchMatches,
          ...alternatives,
        ];


      /*
      -------------------------------------------------
      DEDUPLICATE
      -------------------------------------------------
      */

      const uniqueSearchResults =
        [];


      const searchSeen =
        new Set();


      for (
        const productItem
        of combinedSearchResults
      ) {

        if (
          !productItem ||
          typeof productItem !==
          "object"
        ) {

          continue;

        }


        const key =
          productItem.url ||
          `${productItem.platform || ""}|${productItem.title || ""}|${productItem.price || ""}`;


        if (
          searchSeen.has(key)
        ) {

          continue;

        }


        searchSeen.add(
          key
        );


        uniqueSearchResults.push(
          productItem
        );

      }


      setResults(
        uniqueSearchResults
      );


      /*
      -------------------------------------------------
      OPTIONAL SEARCH RESPONSE DATA
      -------------------------------------------------
      */

      if (
        data.product
      ) {

        setSearchedProduct(
          data.product
        );

      }


      if (
        data.currentListing
      ) {

        setCurrentListing(
          data.currentListing
        );

      }


      if (
        data.priceIntelligence
      ) {

        setPriceIntelligence(
          data.priceIntelligence
        );

      }


      if (
        data.priceEvent
      ) {

        setPriceEvent(
          data.priceEvent
        );

      }

    }
    catch (err) {

      /*
      =================================================
      ABORT
      =================================================
      */

      if (
        err.name ===
        "AbortError"
      ) {

        return;

      }


      /*
      =================================================
      STALE REQUEST
      =================================================
      */

      if (
        currentRequestId !==
        requestId.current
      ) {

        return;

      }


      console.error(
        "StockSense request failed:",
        err
      );


      setError(
        err.message ||
        "StockSense request failed."
      );

    }
    finally {

      if (
        currentRequestId ===
        requestId.current
      ) {

        setLoading(
          false
        );

      }


      if (
        requestController.current ===
        controller
      ) {

        requestController.current =
          null;

      }

    }

  }


  /*
  ===================================================
  FORM SUBMIT
  ===================================================
  */

  function handleSubmit(
    event
  ) {

    event.preventDefault();


    if (
      loading
    ) {

      return;

    }


    handleSearch();

  }


  /*
  ===================================================
  LOGOUT
  ===================================================
  */

  function handleLogout() {

    if (
      requestController.current
    ) {

      requestController.current.abort();

    }


    localStorage.removeItem(
      "stocksense_token"
    );


    localStorage.removeItem(
      "stocksense_user"
    );


    setAuthenticated(
      false
    );


    setCurrentUser(
      null
    );


    setQuery(
      ""
    );


    setResults(
      []
    );


    setSearchedProduct(
      null
    );


    setCurrentListing(
      null
    );


    setPriceIntelligence(
      null
    );


    setPriceHistory(
      []
    );


    setPriceEvent(
      null
    );


    setRecommendations(
      null
    );


    setError(
      ""
    );


    setAuthName(
      ""
    );


    setAuthEmail(
      ""
    );


    setAuthPassword(
      ""
    );


    setAuthMode(
      "login"
    );


    setAuthOpen(
      true
    );

  }


  /*
  ===================================================
  SORT RESULTS BY PRICE
  ===================================================
  */

  const sortedResults =
    [
      ...results,
    ].sort(
      (
        a,
        b
      ) => {

        const priceA =
          Number(
            a?.price
          );


        const priceB =
          Number(
            b?.price
          );


        if (
          Number.isFinite(
            priceA
          ) &&
          Number.isFinite(
            priceB
          )
        ) {

          return (
            priceA -
            priceB
          );

        }


        if (
          Number.isFinite(
            priceA
          )
        ) {

          return -1;

        }


        if (
          Number.isFinite(
            priceB
          )
        ) {

          return 1;

        }


        return 0;

      }
    );


  const lowestResult =
    sortedResults.length >
      0
      ? sortedResults[0]
      : null;


  /*
  ===================================================
  INPUT MODE
  ===================================================
  */

  const currentInputIsUrl =
    isValidProductUrl(
      query
    );


  /*
  ===================================================
  RENDER
  ===================================================
  */

  return (
    <>
    <StockSenseFavicon />

    <main className="stocksense-app">


      {/* =================================================
          GLOBAL MENU
      ================================================= */}

      <button
        type="button"
        className={`menu-toggle ${menuOpen ? "is-open" : ""}`}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label={menuOpen ? "Close menu" : "Open menu"}
        aria-expanded={menuOpen}
        aria-controls="stocksense-side-menu"
      >
        <span />
        <span />
        <span />
      </button>


      {menuOpen && (
        <div
          className="menu-backdrop"
          onClick={() => setMenuOpen(false)}
          aria-hidden="true"
        />
      )}


      <aside
        id="stocksense-side-menu"
        className={`side-menu ${menuOpen ? "is-open" : ""}`}
        aria-label="StockSense navigation"
        aria-hidden={!menuOpen}
      >

        <div className="side-menu-head">
          <div>
            <span className="side-menu-kicker">StockSense</span>
            <strong>Shopping tools</strong>
          </div>

          <button
            type="button"
            className="side-menu-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            ×
          </button>
        </div>


        <div className="side-menu-user">
          <div className="side-menu-avatar">
            {authenticated
              ? (currentUser?.name || currentUser?.email || "S").charAt(0).toUpperCase()
              : "S"}
          </div>

          <div className="side-menu-user-copy">
            <strong>
              {authenticated
                ? currentUser?.name || currentUser?.email || "Signed in"
                : "Guest shopper"}
            </strong>
            <span>
              {authenticated
                ? "Your StockSense account"
                : "Sign in to save your preferences"}
            </span>
          </div>
        </div>


        <nav className="side-menu-nav">

          <span className="side-menu-section-label">Browse</span>

          <button
            type="button"
            className="side-menu-item active"
            onClick={() => navigateFromMenu("home")}
          >
            <span>Home</span>
          </button>

          <button
            type="button"
            className="side-menu-item"
            onClick={() => navigateFromMenu("search")}
          >
            <span>Search products</span>
          </button>

          <button
            type="button"
            className="side-menu-item"
            onClick={() => navigateFromMenu("overview")}
            disabled={!searchedProduct}
          >
            <span>Current product</span>
          </button>

          <span className="side-menu-section-label">Analysis</span>

          <button
            type="button"
            className="side-menu-item"
            onClick={() => navigateFromMenu("intelligence")}
            disabled={!priceIntelligence}
          >
            <span>Price intelligence</span>
          </button>

          <button
            type="button"
            className="side-menu-item"
            onClick={() => navigateFromMenu("history")}
            disabled={!priceHistory.length}
          >
            <span>Price history</span>
          </button>

          <button
            type="button"
            className="side-menu-item"
            onClick={() => navigateFromMenu("compare")}
            disabled={!results.length}
          >
            <span>Compare prices</span>
            {results.length > 0 && (
              <em className="side-menu-badge">{results.length}</em>
            )}
          </button>

          <span className="side-menu-section-label">Tools</span>

          <button
            type="button"
            className="side-menu-item"
            onClick={() => navigateFromMenu("watchlist")}
          >
            <span>Watchlist</span>
            {watchlist.length > 0 && (
              <em className="side-menu-badge side-menu-badge-highlight">
                {watchlist.length}
              </em>
            )}
          </button>

          <button
            type="button"
            className="side-menu-item"
            onClick={() => navigateFromMenu("alerts")}
            disabled={!currentListing}
          >
            <span>Restock alerts</span>
          </button>

          <button
            type="button"
            className="side-menu-item"
            onClick={() => {
              setMenuOpen(false);
              authenticated ? handleLogout() : openAuth("login");
            }}
          >
            <span>{authenticated ? "Sign out" : "Sign in"}</span>
          </button>

        </nav>


        <div className="side-menu-note">
          Prices are gathered from available marketplace listings and shown
          together so you can compare them before you buy.
        </div>

      </aside>

      {/* =================================================
          AUTH BAR
      ================================================= */}

      <div className="auth-bar">
        {authenticated ? (
          <>
            <span className="auth-user-name">
              {currentUser?.name || currentUser?.email || "Signed in"}
            </span>
            <button
              type="button"
              className="auth-action"
              onClick={handleLogout}
            >
              Sign out
            </button>
          </>
        ) : (
          <button
            type="button"
            className="auth-action auth-action-primary"
            onClick={() => openAuth("login")}
          >
            Sign in
          </button>
        )}
      </div>

      {/* =================================================
          HERO
      ================================================= */}

      <section className="hero">

        <div className="hero-brand-lockup">

          <div
            className="ss-brand-mark"
            aria-hidden="true"
          >
            <span className="ss-brand-v">V</span>
            <span className="ss-brand-s">S</span>
            <span className="ss-brand-arrow">↗</span>
          </div>

          <span className="hero-brand-name">STOCKSENSE</span>

        </div>

        <p className="eyebrow">Price comparison for everyday shopping</p>


        <h1 className="hero-title">

          Know the price before you buy.

        </h1>


        <p className="hero-description">

          Search by product name or paste a product URL.
          StockSense checks available listings, compares prices,
          and shows how today's price sits against its history.

        </p>


        {/* =================================================
            SEARCH
        ================================================= */}

        <form
          className="search-shell"
          onSubmit={
            handleSubmit
          }
        >

          <span className="search-icon" aria-hidden="true" />


          <input
            type={
              currentInputIsUrl
                ? "url"
                : "text"
            }
            value={
              query
            }
            onChange={(
              event
            ) =>
              setQuery(
                event.target.value
              )
            }
            placeholder={
              "Search for a product or paste a product URL"
            }
            disabled={
              loading
            }
          />


          <button
            type="submit"
            disabled={
              loading ||
              !query.trim()
            }
          >

            {loading

              ? (
                currentInputIsUrl
                  ? "Analyzing..."
                  : "Searching..."
              )

              : (
                currentInputIsUrl
                  ? "Analyze"
                  : "Search"
              )}

          </button>

        </form>


        {/* =================================================
            CATEGORY
        ================================================= */}

        <div className="category-tabs">

          {[
            [
              "electronics",
              "Electronics",
            ],

            [
              "fashion",
              "Fashion",
            ],

            [
              "groceries",
              "Groceries",
            ],

            [
              "home",
              "Home",
            ],
          ].map(
            ([
              value,
              label,
            ]) => (

              <button
                key={
                  value
                }
                type="button"
                disabled={
                  loading
                }
                className={
                  category ===
                  value
                    ? "active"
                    : ""
                }
                onClick={() =>
                  setCategory(
                    category ===
                    value
                      ? "all"
                      : value
                  )
                }
              >
                {
                  label
                }
              </button>

            )
          )}

        </div>


        {/* =================================================
            WATCHLIST
        ================================================= */}

        <section className="watchlist-panel" id="watchlist">

          <div className="watchlist-heading">
            <div>
              <span className="section-kicker">WATCHLIST</span>
              <h2>Products you want to keep an eye on</h2>
              <p>Save products here, set a target price, and return to the listing whenever you need it.</p>
            </div>

            <div className="watchlist-count">
              {watchlist.length} {watchlist.length === 1 ? "item" : "items"}
            </div>
          </div>

          {watchlist.length === 0 ? (
            <div className="watchlist-empty">
              <strong>Your watchlist is empty.</strong>
              <span>Use “Add to watchlist” on any product you want to track.</span>
            </div>
          ) : (
            <div className="watchlist-list">
              {watchlist.map(entry => {
                const currentPrice = Number(entry.price);
                const targetPrice = Number(entry.targetPrice);
                const targetReached =
                  Number.isFinite(currentPrice) &&
                  Number.isFinite(targetPrice) &&
                  targetPrice > 0 &&
                  currentPrice <= targetPrice;

                const stockClass =
                  entry.stock === "IN_STOCK"
                    ? "stock-in_stock"
                    : entry.stock === "OUT_OF_STOCK"
                      ? "stock-out_of_stock"
                      : "stock-unknown";

                return (
                  <article className="watchlist-item" key={entry.key}>

                    <div className="watchlist-item-main">
                      <strong>{entry.title}</strong>
                      <span>{entry.platform}</span>
                    </div>

                    <div className="watchlist-item-price">
                      <strong>
                        {Number.isFinite(currentPrice) ? formatPrice(currentPrice) : "Price unavailable"}
                      </strong>
                      <span className={stockClass}>
                        {entry.stock === "IN_STOCK"
                          ? "IN STOCK"
                          : entry.stock === "OUT_OF_STOCK"
                            ? "OUT OF STOCK"
                            : "STATUS UNKNOWN"}
                      </span>
                    </div>

                    <label className="watchlist-target">
                      <span>Target price</span>
                      <div>
                        <span>₹</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={entry.targetPrice ?? ""}
                          onChange={event =>
                            updateWatchlistTarget(
                              entry.key,
                              event.target.value
                            )
                          }
                          placeholder="Set target"
                          aria-label={`Target price for ${entry.title}`}
                        />
                      </div>
                      {targetReached && (
                        <em>Target reached</em>
                      )}
                    </label>

                    <div className="watchlist-item-actions">
                      {entry.url && (
                        <a
                          href={entry.url}
                          target="_blank"
                          rel="noreferrer"
                          className="watchlist-view"
                        >
                          View ↗
                        </a>
                      )}

                      <button
                        type="button"
                        className="watchlist-remove"
                        onClick={() => removeFromWatchlist(entry.key)}
                      >
                        Remove
                      </button>
                    </div>

                  </article>
                );
              })}
            </div>
          )}

        </section>


        {/* =================================================
            ERROR
        ================================================= */}

        {error && (

          <p className="search-error">
            {
              error
            }
          </p>

        )}


        {/* =================================================
            LOADING
        ================================================= */}

        {loading && (

          <div className="analysis-loading">

            <div className="loading-orbit" />


            <div>

              <strong>
                {
                  currentInputIsUrl
                    ? "Analyzing product"
                    : "Searching products"
                }
              </strong>


              <span>
                {
                  currentInputIsUrl

                    ? "Scraping, identifying, comparing and analyzing price history..."

                    : "Searching supported marketplaces and comparing available products..."
                }
              </span>

            </div>

          </div>

        )}


        {/* =================================================
            PRICE INTELLIGENCE
        ================================================= */}

        {!loading &&
          priceIntelligence && (

            <PriceIntelligenceCard
              intelligence={
                priceIntelligence
              }
            />

          )}


        {/* =================================================
            PRICE HISTORY VISUAL
        ================================================= */}

        {!loading &&
          currentInputIsUrl &&
          priceIntelligence && (

            <PriceHistoryVisual
              history={
                priceHistory
              }
              intelligence={
                priceIntelligence
              }
            />

          )}


        {/* =================================================
            SEARCH COMPARISON
        ================================================= */}

        {!loading &&
          !currentInputIsUrl &&
          results.length >
          0 && (

            <PriceComparisonSummary
              products={
                results
              }
              searchQuery={
                query
              }
            />

          )}


        {/* =================================================
            SMART PRODUCT / VARIANT COMPARISON
        ================================================= */}

        {!loading &&
          !currentInputIsUrl &&
          results.length >
          0 && (

            <SmartProductComparison
              products={
                results
              }
              searchQuery={
                query
              }
            />

          )}


        {/* =================================================
            ANALYZED PRODUCT
        ================================================= */}

        {!loading &&
          (
            searchedProduct ||
            currentListing
          ) && (

            <section className="product-overview">

              <div className="summary-heading product-overview-heading">

                <span className="section-kicker">
                  ANALYZED PRODUCT
                </span>

                <h2>
                  {
                    searchedProduct?.title ||
                    currentListing?.title ||
                    "Product"
                  }
                </h2>

                {searchedProduct?.brand && (
                  <span>
                    {searchedProduct.brand}
                  </span>
                )}

              </div>

              <div className="analyzed-product-card">

                <div className="analyzed-product-image">
                  {
                    (
                      currentListing?.image ||
                      searchedProduct?.image ||
                      searchedProduct?.sourceImage
                    ) ? (

                      <img
                        src={
                          currentListing?.image ||
                          searchedProduct?.image ||
                          searchedProduct?.sourceImage
                        }
                        alt={
                          searchedProduct?.title ||
                          currentListing?.title ||
                          "Product"
                        }
                      />

                    ) : (

                      <div className="analyzed-product-image-placeholder">
                        No image available
                      </div>

                    )
                  }
                </div>

                <div className="analyzed-product-content">

                  <div className="analyzed-product-brand">
                    {
                      searchedProduct?.brand ||
                      currentListing?.brand ||
                      currentListing?.platform ||
                      "Marketplace"
                    }
                  </div>

                  <h3>
                    {
                      searchedProduct?.title ||
                      currentListing?.title ||
                      "Product"
                    }
                  </h3>

                  <div className="analyzed-product-meta">

                    <div>
                      <span>Marketplace</span>
                      <strong>
                        {
                          currentListing?.platform ||
                          "Marketplace"
                        }
                      </strong>
                    </div>

                    <div>
                      <span>Status</span>
                      <strong
                        className={
                          `hero-stock-status ${
                            getAvailabilityValue(
                              currentListing
                            ) === "OUT_OF_STOCK"
                              ? "hero-stock-out"
                              : getAvailabilityValue(
                                currentListing
                              ) === "IN_STOCK"
                                ? "hero-stock-in"
                                : "hero-stock-unknown"
                          }`
                        }
                      >
                        {
                          getAvailabilityValue(
                            currentListing
                          ) === "OUT_OF_STOCK"
                            ? "OUT OF STOCK"
                            : getAvailabilityValue(
                              currentListing
                            ) === "IN_STOCK"
                              ? "IN STOCK"
                              : "STATUS UNKNOWN"
                        }
                      </strong>
                    </div>

                    <div>
                      <span>Current price</span>
                      <strong>
                        {
                          getAvailabilityValue(
                            currentListing
                          ) !== "OUT_OF_STOCK" &&
                          hasUsableLivePrice(
                            currentListing
                          )
                            ? formatPrice(
                              currentListing.price ??
                              currentListing.currentPrice
                            )
                            : "Price unavailable"
                        }
                      </strong>
                    </div>

                  </div>

                  <div className="analyzed-product-actions">

                    {currentListing && (

                      <button
                        type="button"
                        className={`watchlist-toggle-button ${
                          isInWatchlist(currentListing)
                            ? "is-added"
                            : ""
                        }`}
                        onClick={() =>
                          addToWatchlist(
                            currentListing,
                            searchedProduct?.title || query
                          )
                        }
                      >
                        {isInWatchlist(currentListing)
                          ? "✓ In watchlist"
                          : "♡ Add to watchlist"}
                      </button>

                    )}

                    {getAvailabilityValue(
                      currentListing
                    ) === "OUT_OF_STOCK" && (

                      <button
                        type="button"
                        className="restock-alert-button"
                        onClick={() => {

                          const key =
                            `stocksense_restock_${
                              String(
                                currentListing?.url ||
                                query ||
                                "product"
                              ).trim()
                            }`;

                          localStorage.setItem(
                            key,
                            JSON.stringify({
                              title:
                                searchedProduct?.title ||
                                currentListing?.title ||
                                "Product",
                              platform:
                                currentListing?.platform ||
                                "Marketplace",
                              url:
                                currentListing?.url ||
                                query,
                              requestedAt:
                                new Date().toISOString(),
                            })
                          );

                          if (
                            typeof Notification !==
                            "undefined" &&
                            Notification.permission ===
                            "default"
                          ) {
                            Notification.requestPermission().catch(() => {});
                          }

                          setRestockMessage(
                            "Restock alert saved on this device. StockSense will surface it when this product is checked again and is back in stock."
                          );

                        }}
                      >
                        🔔 Notify me when restocked
                      </button>

                    )}

                    {currentListing?.url && (
                      <a
                        href={
                          currentListing.url
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="analyzed-product-view-link"
                      >
                        View product ↗
                      </a>
                    )}

                  </div>

                </div>

              </div>

              {restockMessage && (
                <p
                  className={
                    `restock-message ${
                      getAvailabilityValue(
                        currentListing
                      ) === "IN_STOCK"
                        ? "restock-message-success"
                        : ""
                    }`
                  }
                >
                  🔔 {restockMessage}
                </p>
              )}

            </section>

          )}


        {/* =================================================
            PRODUCT IDENTITY
        ================================================= */}

        {!loading &&
          searchedProduct && (

            <section className="product-summary">

              <div className="summary-heading">

                <span className="section-kicker">
                  PRODUCT IDENTITY
                </span>


                <h2>
                  Product details
                </h2>


                <span>
                  Identified by StockSense
                </span>

              </div>


              <div className="current-listing">

                <div>

                  <span>
                    BRAND
                  </span>


                  <strong>
                    {
                      searchedProduct.brand ||
                      "—"
                    }
                  </strong>

                </div>


                <div>

                  <span>
                    CATEGORY
                  </span>


                  <strong>
                    {
                      searchedProduct.category ||
                      "—"
                    }
                  </strong>

                </div>


                <div>

                  <span>
                    WEIGHT
                  </span>


                  <strong>
                    {
                      searchedProduct.weight ||
                      "—"
                    }
                  </strong>

                </div>


                <div>

                  <span>
                    FLAVOUR
                  </span>


                  <strong>
                    {
                      searchedProduct.flavour ||
                      "—"
                    }
                  </strong>

                </div>

              </div>

            </section>

          )}


        {/* =================================================
            PRICE EVENT
        ================================================= */}

        {!loading &&
          priceEvent && (

            <section className="product-summary">

              <div className="summary-heading">

                <span className="section-kicker">
                  PRICE EVENT
                </span>


                <h2>
                  {
                    priceEvent.event ||
                    "NO CHANGE"
                  }
                </h2>


                <span>
                  Current price{" "}
                  {
                    formatPrice(
                      priceEvent.currentPrice
                    )
                  }
                </span>

              </div>

            </section>

          )}


        {/* =================================================
            BEST DEAL
        ================================================= */}

        {!loading &&
          recommendations?.bestDeal && (

            <section className="product-summary">

              <div className="summary-heading">

                <span className="section-kicker">
                  STOCKSENSE RECOMMENDATION
                </span>


                <h2>
                  Best deal found
                </h2>


                <span>
                  {
                    recommendations
                      .bestDeal
                      .platform ||
                    "Marketplace"
                  }
                </span>

              </div>


              <div className="current-listing">

                <div>

                  <span>
                    BEST VERIFIED PRICE
                  </span>


                  <strong>
                    {
                      recommendations
                        .bestDeal
                        .platform ||
                      "Marketplace"
                    }
                  </strong>

                </div>


                <b>
                  {
                    formatPrice(
                      recommendations
                        .bestDeal
                        .price
                    )
                  }
                </b>


                {
                  recommendations
                    .bestDeal
                    .url && (

                    <a
                      href={
                        recommendations
                          .bestDeal
                          .url
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Get deal ↗
                    </a>

                  )
                }

              </div>

            </section>

          )}


        {/* =================================================
            MARKETPLACE RESULTS
        ================================================= */}

        {results.length >
          0 && (

            <section className="results">

              <div className="results-header">

                <span>
                  {
                    currentInputIsUrl
                      ? "VERIFIED DISCOVERY"
                      : "MARKETPLACE RESULTS"
                  }
                </span>


                <strong>
                  {
                    results.length
                  }{" "}
                  products
                </strong>

              </div>


              {/* SORT MESSAGE */}

              {!currentInputIsUrl &&
                results.length >
                1 && (

                  <div
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                      marginBottom:
                        "14px",
                      padding:
                        "0 4px",
                      fontSize:
                        "12px",
                      color:
                        "rgba(255,255,255,0.42)",
                    }}
                  >

                    <span>
                      Sorted by price
                    </span>


                    <span>
                      Lowest → Highest
                    </span>

                  </div>

                )}


              <div className="results-grid">

                {sortedResults.map(
                  (
                    product,
                    index
                  ) => {

                    const isLowest =
                      !currentInputIsUrl &&
                      lowestResult &&
                      (
                        product.url ===
                        lowestResult.url
                      );


                    return (

                      <article
                        className="product-card"
                        key={
                          `${product.platform}-${product.url || product.title}-${index}`
                        }
                        style={{
                          position:
                            "relative",
                        }}
                      >


                        {/* =================================================
                          LOWEST PRICE
                      ================================================= */}

                        {isLowest && (

                          <div
                            style={{
                              position:
                                "absolute",
                              top:
                                "12px",
                              left:
                                "12px",
                              zIndex:
                                3,
                              padding:
                                "6px 9px",
                              borderRadius:
                                "999px",
                              background:
                                "rgba(255,255,255,0.94)",
                              color:
                                "#111",
                              fontSize:
                                "10px",
                              fontWeight:
                                800,
                              letterSpacing:
                                "0.06em",
                            }}
                          >
                            LOWEST PRICE
                          </div>

                        )}


                        {/* =================================================
                          IMAGE
                      ================================================= */}

                        <div className="product-image-wrapper">

                          {product.image ? (

                            <img
                              src={
                                product.image
                              }
                              alt={
                                product.title ||
                                "Product"
                              }
                            />

                          ) : (

                            <div className="product-image-placeholder">
                              No image
                            </div>

                          )}

                        </div>


                        {/* =================================================
                          PRODUCT INFO
                      ================================================= */}

                        <div className="product-info">

                          <span className="platform">
                            {
                              product.platform ||
                              "Marketplace"
                            }
                          </span>


                          <h2>
                            {
                              product.title ||
                              "Product"
                            }
                          </h2>


                          <div className="product-bottom">

                            <strong>
                              {
                                formatPrice(
                                  product.price
                                )
                              }
                            </strong>


                            <div className="product-card-actions">

                              <button
                                type="button"
                                className={`watchlist-card-action ${
                                  isInWatchlist(product)
                                    ? "is-added"
                                    : ""
                                }`}
                                onClick={() =>
                                  addToWatchlist(
                                    product,
                                    product.title || query
                                  )
                                }
                              >
                                {isInWatchlist(product)
                                  ? "✓ Saved"
                                  : "♡ Watch"}
                              </button>

                              {product.url ? (

                                <a
                                  href={
                                    product.url
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  View deal ↗
                                </a>

                              ) : (

                                <span>
                                  Deal unavailable
                                </span>

                              )}

                            </div>

                          </div>

                        </div>

                      </article>

                    );

                  }
                )}

              </div>


              {/* =================================================
                COMPARISON DISCLAIMER
            ================================================= */}

              {!currentInputIsUrl &&
                results.length >
                1 && (

                  <p
                    style={{
                      margin:
                        "18px 4px 0",
                      textAlign:
                        "center",
                      color:
                        "rgba(255,255,255,0.35)",
                      fontSize:
                        "11px",
                      lineHeight:
                        1.6,
                    }}
                  >
                    Price comparison is based
                    on the currently verified
                    marketplace results. Product
                    variants and specifications
                    can differ between listings.
                  </p>

                )}

            </section>

          )}

      </section>


      {/* =================================================
          AUTH MODAL
      ================================================= */}

      {authOpen &&
        !authenticated && (

          <div
            role="dialog"
            aria-modal="true"
            aria-label={
              authMode ===
                "login"
                ? "Login"
                : "Create account"
            }
            onClick={() =>
              setAuthOpen(
                false
              )
            }
            style={{
              position:
                "fixed",
              inset:
                0,
              zIndex:
                9999,
              display:
                "flex",
              alignItems:
                "center",
              justifyContent:
                "center",
              padding:
                "24px",
              background:
                "rgba(0,0,0,0.72)",
              backdropFilter:
                "blur(14px)",
            }}
          >

            <div
              onClick={event =>
                event.stopPropagation()
              }
              style={{
                width:
                  "100%",
                maxWidth:
                  "430px",
                border:
                  "1px solid rgba(255,255,255,0.12)",
                background:
                  "rgba(18,18,24,0.97)",
                borderRadius:
                  "20px",
                padding:
                  "30px",
                boxShadow:
                  "0 30px 100px rgba(0,0,0,0.55)",
              }}
            >

              {/* HEADER */}

              <span
                style={{
                  display:
                    "block",
                  fontSize:
                    "11px",
                  letterSpacing:
                    "0.16em",
                  fontWeight:
                    700,
                  color:
                    "rgba(255,255,255,0.45)",
                  marginBottom:
                    "8px",
                }}
              >
                STOCKSENSE
              </span>


              <h2
                style={{
                  margin:
                    0,
                  color:
                    "#fff",
                  fontSize:
                    "28px",
                  lineHeight:
                    1.2,
                }}
              >
                {
                  authMode ===
                    "login"
                    ? "Welcome back"
                    : "Create your account"
                }
              </h2>


              <p
                style={{
                  color:
                    "rgba(255,255,255,0.55)",
                  fontSize:
                    "14px",
                  lineHeight:
                    1.5,
                  margin:
                    "10px 0 22px",
                }}
              >
                {
                  authMode ===
                    "login"
                    ? "Login to search products and compare prices with StockSense."
                    : "Create an account to use StockSense product search and price intelligence."
                }
              </p>


              {/* ERROR */}

              {authError && (

                <div
                  style={{
                    marginBottom:
                      "18px",
                    padding:
                      "11px 13px",
                    border:
                      "1px solid rgba(255,90,90,0.22)",
                    background:
                      "rgba(255,70,70,0.08)",
                    borderRadius:
                      "10px",
                    color:
                      "#ff9a9a",
                    fontSize:
                      "13px",
                    lineHeight:
                      1.4,
                  }}
                >
                  {
                    authError
                  }
                </div>

              )}


              {/* FORM */}

              <form
                onSubmit={
                  handleAuthSubmit
                }
              >

                {authMode ===
                  "signup" && (

                    <input
                      type="text"
                      value={
                        authName
                      }
                      onChange={event =>
                        setAuthName(
                          event.target.value
                        )
                      }
                      placeholder="Name"
                      autoComplete="name"
                      disabled={
                        authLoading
                      }
                      style={{
                        width:
                          "100%",
                        boxSizing:
                          "border-box",
                        marginBottom:
                          "12px",
                        padding:
                          "12px 13px",
                        borderRadius:
                          "10px",
                        border:
                          "1px solid rgba(255,255,255,0.1)",
                        background:
                          "rgba(255,255,255,0.05)",
                        color:
                          "#fff",
                        outline:
                          "none",
                      }}
                    />

                  )}


                <input
                  type="email"
                  value={
                    authEmail
                  }
                  onChange={event =>
                    setAuthEmail(
                      event.target.value
                    )
                  }
                  placeholder="Email"
                  autoComplete="email"
                  disabled={
                    authLoading
                  }
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    marginBottom:
                      "12px",
                    padding:
                      "12px 13px",
                    borderRadius:
                      "10px",
                    border:
                      "1px solid rgba(255,255,255,0.1)",
                    background:
                      "rgba(255,255,255,0.05)",
                    color:
                      "#fff",
                    outline:
                      "none",
                  }}
                />


                <input
                  type="password"
                  value={
                    authPassword
                  }
                  onChange={event =>
                    setAuthPassword(
                      event.target.value
                    )
                  }
                  placeholder="Password"
                  autoComplete={
                    authMode ===
                      "login"
                      ? "current-password"
                      : "new-password"
                  }
                  disabled={
                    authLoading
                  }
                  style={{
                    width:
                      "100%",
                    boxSizing:
                      "border-box",
                    marginBottom:
                      "18px",
                    padding:
                      "12px 13px",
                    borderRadius:
                      "10px",
                    border:
                      "1px solid rgba(255,255,255,0.1)",
                    background:
                      "rgba(255,255,255,0.05)",
                    color:
                      "#fff",
                    outline:
                      "none",
                  }}
                />


                <button
                  type="submit"
                  disabled={
                    authLoading
                  }
                  style={{
                    width:
                      "100%",
                    border:
                      "none",
                    background:
                      "linear-gradient(135deg,#ffffff,#cfcfcf)",
                    color:
                      "#111",
                    padding:
                      "13px",
                    borderRadius:
                      "10px",
                    fontWeight:
                      800,
                    cursor:
                      authLoading
                        ? "wait"
                        : "pointer",
                    opacity:
                      authLoading
                        ? 0.7
                        : 1,
                  }}
                >
                  {
                    authLoading

                      ? "Please wait..."

                      : authMode ===
                        "login"

                        ? "Login"

                        : "Create account"
                  }
                </button>

              </form>


              {/* SWITCH */}

              <div
                style={{
                  marginTop:
                    "18px",
                  textAlign:
                    "center",
                  color:
                    "rgba(255,255,255,0.48)",
                  fontSize:
                    "13px",
                }}
              >

                {
                  authMode ===
                    "login"
                    ? "Don't have an account?"
                    : "Already have an account?"
                }


                <button
                  type="button"
                  disabled={
                    authLoading
                  }
                  onClick={() => {

                    setAuthMode(
                      authMode ===
                        "login"
                        ? "signup"
                        : "login"
                    );


                    setAuthError(
                      ""
                    );


                    setAuthPassword(
                      ""
                    );

                  }}
                  style={{
                    border:
                      "none",
                    background:
                      "transparent",
                    color:
                      "#fff",
                    cursor:
                      "pointer",
                    fontWeight:
                      700,
                    marginLeft:
                      "5px",
                    padding:
                      0,
                  }}
                >
                  {
                    authMode ===
                      "login"
                      ? "Sign up"
                      : "Login"
                  }
                </button>

              </div>


              {/* CLOSE */}

              <button
                type="button"
                onClick={() =>
                  setAuthOpen(
                    false
                  )
                }
                disabled={
                  authLoading
                }
                style={{
                  width:
                    "100%",
                  marginTop:
                    "14px",
                  border:
                    "1px solid rgba(255,255,255,0.1)",
                  background:
                    "transparent",
                  color:
                    "rgba(255,255,255,0.55)",
                  padding:
                    "10px",
                  borderRadius:
                    "10px",
                  cursor:
                    "pointer",
                  fontSize:
                    "13px",
                }}
              >
                Close
              </button>

            </div>

          </div>

        )}


      {/* =================================================
          FOOTER
      ================================================= */}

      <footer className="site-footer">

        <div className="site-footer-brand">

          <div
            className="ss-brand-mark ss-brand-mark-compact"
            aria-hidden="true"
          >
            <span className="ss-brand-v">V</span>
            <span className="ss-brand-s">S</span>
            <span className="ss-brand-arrow">↗</span>
          </div>

          <span>StockSense</span>

        </div>

        <span className="site-footer-copy">
          • Smart price intelligence
        </span>

      </footer>

    </main>
    </>

  );

}


export default App;