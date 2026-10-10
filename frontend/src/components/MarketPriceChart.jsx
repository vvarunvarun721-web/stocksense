import "./MarketPriceChart.css";

function formatPrice(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "—";
  }

  return `₹${number.toLocaleString("en-IN")}`;
}

function normalizePlatform(value) {
  return String(value || "Marketplace")
    .trim()
    .replace(/\s+/g, " ");
}

export default function MarketPriceChart({
  products = [],
}) {
  /*
  =====================================================
  FILTER VALID PRICED PRODUCTS
  =====================================================
  */

  const pricedProducts = Array.isArray(products)
    ? products
        .map((product) => ({
          ...product,
          numericPrice: Number(product?.price),
        }))
        .filter(
          (product) =>
            Number.isFinite(product.numericPrice) &&
            product.numericPrice >= 0
        )
    : [];

  if (pricedProducts.length === 0) {
    return null;
  }

  /*
  =====================================================
  LOWEST PRICE BY MARKETPLACE
  =====================================================
  */

  const marketplaceMap = new Map();

  for (const product of pricedProducts) {
    const platform = normalizePlatform(product.platform);

    const existing = marketplaceMap.get(platform);

    if (
      !existing ||
      product.numericPrice < existing.numericPrice
    ) {
      marketplaceMap.set(platform, product);
    }
  }

  const marketplaceProducts = Array.from(
    marketplaceMap.values()
  ).sort(
    (a, b) =>
      a.numericPrice - b.numericPrice
  );

  if (marketplaceProducts.length === 0) {
    return null;
  }

  /*
  =====================================================
  PRICE METRICS
  =====================================================
  */

  const prices = marketplaceProducts.map(
    (product) => product.numericPrice
  );

  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);

  const averagePrice =
    prices.reduce(
      (sum, price) => sum + price,
      0
    ) / prices.length;

  const priceSpread =
    highestPrice - lowestPrice;

  const savingsPercentage =
    highestPrice > 0
      ? (priceSpread / highestPrice) * 100
      : 0;

  /*
  =====================================================
  BAR WIDTH
  =====================================================
  */

  function getBarWidth(price) {
    if (highestPrice <= 0) {
      return 0;
    }

    return Math.max(
      8,
      (price / highestPrice) * 100
    );
  }

  /*
  =====================================================
  RENDER
  =====================================================
  */

  return (
    <section className="market-price-chart">

      <div className="market-price-chart-header">

        <div>
          <span className="section-kicker">
            MARKET PRICE VISUAL
          </span>

          <h2>
            See the price difference at a glance.
          </h2>

          <p>
            Lowest verified price returned by each
            marketplace currently available to StockSense.
          </p>
        </div>

        <div className="market-chart-market-count">
          <strong>
            {marketplaceProducts.length}
          </strong>

          <span>
            marketplaces
          </span>
        </div>

      </div>


      {/* =================================================
          SUMMARY
      ================================================= */}

      <div className="market-chart-summary">

        <div className="market-chart-stat">

          <span>
            LOWEST
          </span>

          <strong>
            {formatPrice(lowestPrice)}
          </strong>

          <small>
            {marketplaceProducts[0]?.platform}
          </small>

        </div>


        <div className="market-chart-stat">

          <span>
            AVERAGE
          </span>

          <strong>
            {formatPrice(averagePrice)}
          </strong>

          <small>
            Across marketplaces
          </small>

        </div>


        <div className="market-chart-stat">

          <span>
            HIGHEST
          </span>

          <strong>
            {formatPrice(highestPrice)}
          </strong>

          <small>
            {marketplaceProducts[
              marketplaceProducts.length - 1
            ]?.platform}
          </small>

        </div>


        <div className="market-chart-stat">

          <span>
            PRICE GAP
          </span>

          <strong>
            {formatPrice(priceSpread)}
          </strong>

          <small>
            {savingsPercentage.toFixed(1)}%
            {" "}spread
          </small>

        </div>

      </div>


      {/* =================================================
          BAR GRAPH
      ================================================= */}

      <div className="market-chart">

        <div className="market-chart-scale">

          <span>
            {formatPrice(highestPrice)}
          </span>

          <span>
            {formatPrice(
              (highestPrice + lowestPrice) / 2
            )}
          </span>

          <span>
            {formatPrice(lowestPrice)}
          </span>

        </div>


        <div className="market-chart-bars">

          {marketplaceProducts.map(
            (product, index) => {

              const isLowest =
                index === 0;

              const barWidth =
                getBarWidth(
                  product.numericPrice
                );

              return (
                <div
                  className="market-chart-row"
                  key={
                    `${product.platform}-${product.url || index}`
                  }
                >

                  <div className="market-chart-label">

                    <span className="market-platform">
                      {product.platform ||
                        "Marketplace"}
                    </span>

                    <span className="market-product-title">
                      {product.title ||
                        "Product"}
                    </span>

                  </div>


                  <div className="market-bar-track">

                    <div
                      className={
                        `market-bar-fill ${
                          isLowest
                            ? "market-bar-lowest"
                            : ""
                        }`
                      }
                      style={{
                        width:
                          `${barWidth}%`,
                      }}
                    />

                  </div>


                  <div className="market-chart-price">

                    <strong>
                      {formatPrice(
                        product.numericPrice
                      )}
                    </strong>

                    {isLowest && (
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


      {/* =================================================
          EXPLANATION
      ================================================= */}

      <div className="market-chart-footer">

        <span className="market-chart-footer-icon">
          ↔
        </span>

        <p>
          A shorter bar represents a lower price.
          The comparison uses the lowest returned
          listing from each marketplace.
        </p>

      </div>

    </section>
  );
}