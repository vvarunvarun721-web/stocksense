import "./MarketPriceVisuals.css";

function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return `₹${number.toLocaleString("en-IN")}`;
}


/*
=====================================================
NORMALIZE HISTORY
=====================================================
*/

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((item) => {
      const price = Number(
        item?.price ??
        item?.currentPrice
      );

      const rawDate =
        item?.checkedAt ??
        item?.timestamp ??
        item?.createdAt ??
        item?.date ??
        null;

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        return null;
      }

      const timestamp = rawDate
        ? new Date(rawDate).getTime()
        : NaN;

      return {
        price,
        date: rawDate,
        timestamp: Number.isFinite(timestamp)
          ? timestamp
          : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (
        a.timestamp !== null &&
        b.timestamp !== null
      ) {
        return a.timestamp - b.timestamp;
      }

      return 0;
    });
}


/*
=====================================================
DOWNSAMPLE HISTORY FOR DISPLAY
=====================================================
*/

function prepareChartPoints(history) {
  const MAX_POINTS = 60;

  if (
    history.length <= MAX_POINTS
  ) {
    return history;
  }

  const points = [];

  const step =
    (history.length - 1) /
    (MAX_POINTS - 1);

  for (
    let i = 0;
    i < MAX_POINTS;
    i++
  ) {
    points.push(
      history[
        Math.round(i * step)
      ]
    );
  }

  return points;
}


/*
=====================================================
DATE FORMAT
=====================================================
*/

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


/*
=====================================================
MARKETPLACE NORMALIZATION
=====================================================
*/

function getMarketplaceProducts(
  products
) {
  if (
    !Array.isArray(products)
  ) {
    return [];
  }

  const marketplaceMap =
    new Map();

  for (
    const product of products
  ) {
    const price =
      Number(
        product?.price
      );

    if (
      !Number.isFinite(price) ||
      price < 0
    ) {
      continue;
    }

    const platform =
      String(
        product?.platform ||
        "Marketplace"
      )
        .trim();

    const existing =
      marketplaceMap.get(
        platform
      );

    if (
      !existing ||
      price <
        existing.price
    ) {
      marketplaceMap.set(
        platform,
        {
          ...product,
          price,
        }
      );
    }
  }

  return Array.from(
    marketplaceMap.values()
  ).sort(
    (a, b) =>
      a.price - b.price
  );
}


/*
=====================================================
MAIN COMPONENT
=====================================================
*/

export default function MarketPriceVisuals({
  history = [],
  products = [],
  intelligence = null,
}) {
  const normalizedHistory =
    normalizeHistory(
      history
    );

  const chartPoints =
    prepareChartPoints(
      normalizedHistory
    );

  const marketplaceProducts =
    getMarketplaceProducts(
      products
    );


  /*
  ===================================================
  PRICE SUMMARY
  ===================================================
  */

  const historyPrices =
    normalizedHistory.map(
      item => item.price
    );

  const historyLow =
    historyPrices.length > 0
      ? Math.min(
          ...historyPrices
        )
      : Number(
          intelligence?.metrics
            ?.lowestPrice
        );

  const historyHigh =
    historyPrices.length > 0
      ? Math.max(
          ...historyPrices
        )
      : Number(
          intelligence?.metrics
            ?.highestPrice
        );

  const historyAverage =
    historyPrices.length > 0
      ? historyPrices.reduce(
          (sum, price) =>
            sum + price,
          0
        ) /
        historyPrices.length
      : Number(
          intelligence?.metrics
            ?.averagePrice
        );

  const currentPrice =
    Number(
      intelligence?.metrics
        ?.currentPrice
    );


  const hasHistory =
    normalizedHistory.length >= 1;

  const hasMarketplaceData =
    marketplaceProducts.length > 0;


  /*
  ===================================================
  NOTHING TO SHOW
  ===================================================
  */

  if (
    !hasHistory &&
    !hasMarketplaceData
  ) {
    return null;
  }


  /*
  ===================================================
  SVG CHART DIMENSIONS
  ===================================================
  */

  const width = 920;
  const height = 350;

  const paddingLeft = 72;
  const paddingRight = 28;
  const paddingTop = 30;
  const paddingBottom = 54;

  const chartWidth =
    width -
    paddingLeft -
    paddingRight;

  const chartHeight =
    height -
    paddingTop -
    paddingBottom;


  const validPrices =
    chartPoints
      .map(
        point =>
          Number(
            point.price
          )
      )
      .filter(
        Number.isFinite
      );


  let minPrice =
    validPrices.length
      ? Math.min(
          ...validPrices
        )
      : 0;

  let maxPrice =
    validPrices.length
      ? Math.max(
          ...validPrices
        )
      : 0;


  /*
  ---------------------------------------------------
  FLAT PRICE PROTECTION
  ---------------------------------------------------
  */

  if (
    minPrice === maxPrice
  ) {
    const padding =
      minPrice === 0
        ? 100
        : minPrice * 0.08;

    minPrice =
      Math.max(
        0,
        minPrice - padding
      );

    maxPrice =
      maxPrice + padding;
  }
  else {
    const range =
      maxPrice - minPrice;

    minPrice =
      Math.max(
        0,
        minPrice -
          range * 0.12
      );

    maxPrice =
      maxPrice +
      range * 0.12;
  }


  function getX(index) {
    if (
      chartPoints.length <= 1
    ) {
      return (
        paddingLeft +
        chartWidth / 2
      );
    }

    return (
      paddingLeft +
      (
        index /
        (
          chartPoints.length -
          1
        )
      ) *
        chartWidth
    );
  }


  function getY(price) {
    const range =
      maxPrice -
      minPrice;

    if (
      range <= 0
    ) {
      return (
        paddingTop +
        chartHeight / 2
      );
    }

    return (
      paddingTop +
      (
        1 -
        (
          price -
          minPrice
        ) /
        range
      ) *
        chartHeight
    );
  }


  const linePoints =
    chartPoints
      .map(
        (point, index) =>
          `${getX(index)},${getY(
            point.price
          )}`
      )
      .join(" ");


  const areaPoints =
    chartPoints.length > 0
      ? [
          `${getX(0)},${
            paddingTop +
            chartHeight
          }`,

          ...chartPoints.map(
            (point, index) =>
              `${getX(index)},${getY(
                point.price
              )}`
          ),

          `${getX(
            chartPoints.length - 1
          )},${
            paddingTop +
            chartHeight
          }`,
        ].join(" ")
      : "";


  const yTicks =
    5;

  const yAxis =
    Array.from(
      {
        length: yTicks,
      },
      (_, index) => {
        const ratio =
          index /
          (yTicks - 1);

        const value =
          maxPrice -
          (
            maxPrice -
            minPrice
          ) *
            ratio;

        return {
          value,
          y:
            paddingTop +
            chartHeight *
              ratio,
        };
      }
    );


  /*
  ===================================================
  MARKETPLACE GRAPH
  ===================================================
  */

  const marketplaceMax =
    hasMarketplaceData
      ? Math.max(
          ...marketplaceProducts.map(
            item =>
              item.price
          )
        )
      : 0;


  return (
    <section className="market-price-visuals">

      {/* =================================================
          HISTORY HEADER
      ================================================= */}

      {hasHistory && (
        <div className="market-history-card">

          <div className="market-visual-header">

            <div>
              <span className="section-kicker">
                MARKET PRICE HISTORY
              </span>

              <h2>
                Understand the price movement.
              </h2>

              <p>
                Real StockSense price snapshots
                plotted over time.
              </p>
            </div>


            <div className="market-history-count">

              <strong>
                {normalizedHistory.length}
              </strong>

              <span>
                snapshots
              </span>

            </div>

          </div>


          {/* =================================================
              CHART
          ================================================= */}

          <div className="market-history-chart-wrapper">

            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="market-history-chart"
              role="img"
              aria-label="Product price history"
            >

              {/* GRID */}

              {yAxis.map(
                tick => (
                  <g
                    key={
                      tick.y
                    }
                  >

                    <line
                      x1={
                        paddingLeft
                      }
                      x2={
                        width -
                        paddingRight
                      }
                      y1={
                        tick.y
                      }
                      y2={
                        tick.y
                      }
                      stroke="rgba(255,255,255,0.065)"
                      strokeWidth="1"
                    />

                    <text
                      x="8"
                      y={
                        tick.y +
                        4
                      }
                      fill="rgba(255,255,255,0.35)"
                      fontSize="11"
                    >
                      {formatPrice(
                        tick.value
                      )}
                    </text>

                  </g>
                )
              )}


              {/* AREA */}

              {chartPoints.length >= 2 && (
                <polygon
                  points={
                    areaPoints
                  }
                  fill="rgba(167,139,250,0.09)"
                />
              )}


              {/* AVERAGE */}

              {Number.isFinite(
                historyAverage
              ) && (
                <>
                  <line
                    x1={
                      paddingLeft
                    }
                    x2={
                      width -
                      paddingRight
                    }
                    y1={
                      getY(
                        historyAverage
                      )
                    }
                    y2={
                      getY(
                        historyAverage
                      )
                    }
                    stroke="rgba(103,232,249,0.55)"
                    strokeWidth="1.5"
                    strokeDasharray="7 6"
                  />

                  <text
                    x={
                      width -
                      paddingRight
                    }
                    y={
                      getY(
                        historyAverage
                      ) -
                      8
                    }
                    textAnchor="end"
                    fill="rgba(103,232,249,0.75)"
                    fontSize="10"
                  >
                    Average
                  </text>
                </>
              )}


              {/* PRICE LINE */}

              {chartPoints.length >= 2 && (
                <polyline
                  points={
                    linePoints
                  }
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}


              {/* SINGLE POINT */}

              {chartPoints.length === 1 && (
                <line
                  x1={
                    paddingLeft
                  }
                  x2={
                    width -
                    paddingRight
                  }
                  y1={
                    getY(
                      chartPoints[0]
                        .price
                    )
                  }
                  y2={
                    getY(
                      chartPoints[0]
                        .price
                    )
                  }
                  stroke="rgba(167,139,250,0.4)"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                />
              )}


              {/* POINTS */}

              {chartPoints.map(
                (point, index) => (
                  <g
                    key={`${point.timestamp}-${index}`}
                  >

                    <circle
                      cx={
                        getX(index)
                      }
                      cy={
                        getY(
                          point.price
                        )
                      }
                      r="5"
                      fill="#070708"
                      stroke="#67e8f9"
                      strokeWidth="2"
                    />

                    <title>
                      {formatPrice(
                        point.price
                      )}
                      {" • "}
                      {formatDate(
                        point.date
                      )}
                    </title>

                  </g>
                )
              )}


              {/* X AXIS */}

              {chartPoints.map(
                (point, index) => {
                  const show =
                    chartPoints.length <=
                      6 ||
                    index === 0 ||
                    index ===
                      chartPoints.length -
                        1 ||
                    index %
                      Math.max(
                        1,
                        Math.ceil(
                          chartPoints.length /
                            5
                        )
                      ) ===
                      0;

                  if (!show) {
                    return null;
                  }

                  return (
                    <text
                      key={`date-${index}`}
                      x={
                        getX(
                          index
                        )
                      }
                      y={
                        height -
                        18
                      }
                      textAnchor="middle"
                      fill="rgba(255,255,255,0.32)"
                      fontSize="10"
                    >
                      {formatDate(
                        point.date
                      )}
                    </text>
                  );
                }
              )}

            </svg>

          </div>


          {/* =================================================
              HISTORY METRICS
          ================================================= */}

          <div className="market-history-metrics">

            <div>
              <span>
                HISTORICAL LOW
              </span>

              <strong>
                {formatPrice(
                  historyLow
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
                HISTORICAL HIGH
              </span>

              <strong>
                {formatPrice(
                  historyHigh
                )}
              </strong>
            </div>

          </div>


          {normalizedHistory.length <
            3 && (
            <p className="market-history-note">
              StockSense currently has only{" "}
              {normalizedHistory.length}{" "}
              recorded price snapshots, so
              the visible movement is limited.
            </p>
          )}

        </div>
      )}


      {/* =================================================
          MARKETPLACE COMPARISON
      ================================================= */}

      {hasMarketplaceData && (
        <div className="marketplace-visual-card">

          <div className="market-visual-header">

            <div>
              <span className="section-kicker">
                MARKETPLACE PRICE COMPARISON
              </span>

              <h2>
                See where the verified price stands.
              </h2>

              <p>
                Lowest available verified listing
                from each marketplace.
              </p>
            </div>

          </div>


          <div className="marketplace-bars">

            {marketplaceProducts.map(
              (
                product,
                index
              ) => {

                const width =
                  marketplaceMax >
                    0
                    ? (
                        product.price /
                        marketplaceMax
                      ) *
                      100
                    : 0;

                return (
                  <div
                    className="marketplace-row"
                    key={
                      `${product.platform}-${product.url || index}`
                    }
                  >

                    <div className="marketplace-label">

                      <strong>
                        {
                          product.platform ||
                          "Marketplace"
                        }
                      </strong>

                      <span>
                        {
                          product.title ||
                          "Verified product"
                        }
                      </span>

                    </div>


                    <div className="marketplace-track">

                      <div
                        className={
                          `marketplace-fill ${
                            index === 0
                              ? "marketplace-lowest"
                              : ""
                          }`
                        }
                        style={{
                          width:
                            `${Math.max(
                              width,
                              4
                            )}%`,
                        }}
                      />

                    </div>


                    <div className="marketplace-price">

                      <strong>
                        {formatPrice(
                          product.price
                        )}
                      </strong>

                      {index === 0 && (
                        <span>
                          LOWEST
                        </span>
                      )}

                    </div>

                  </div>
                );
              }
            )}

          </div>

        </div>
      )}

    </section>
  );
}