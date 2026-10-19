const PriceHistory = require("../../models/PriceHistory");

/*
=====================================================
BUILD PRODUCT RESPONSE
=====================================================
*/

async function buildProductResponse(data) {
  const {
    product,

    scraped,

    matchedProducts,

    priceAnalysis,

    priceEvent,

    recommendations,

    priceIntelligence,

    verification,
  } = data;

  /*
    =================================================
    LOAD LAST 365 DAYS OF HISTORY
    =================================================
    */

  let history = [];

  try {
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const sourceUrl = String(scraped?.url || product?.url || "").trim();

    const historyFilter = {
      productId: product._id,

      checkedAt: {
        $gte: oneYearAgo,
      },
    };

    /*
        -------------------------------------------------
        IMPORTANT

        History is tied to the exact marketplace URL.

        This prevents:

        Amazon URL
        and
        Flipkart URL

        from being mixed together.
        -------------------------------------------------
        */

    if (sourceUrl) {
      historyFilter.sourceUrl = sourceUrl;
    }

    history = await PriceHistory.find(historyFilter)
      .sort({
        checkedAt: 1,
      })
      .lean();

    console.log(`📈 API HISTORY: ${history.length} snapshots returned`);
  } catch (error) {
    console.error("❌ Failed to load price history:", error.message);

    history = [];
  }

  /*
    =================================================
    FINAL API RESPONSE
    =================================================
    */

  return {
    success: true,

    product: {
      id: product?._id,

      title: product?.title,

      brand: product?.brand,

      category: product?.category,

      weight: product?.weight,

      flavour: product?.flavour,
    },

    /*
        =============================================
        CURRENT LISTING
        =============================================
        */

    currentListing: {
      platform: scraped?.platform ?? null,

      price: scraped?.currentPrice ?? null,

      currentPrice: scraped?.currentPrice ?? null,

      rating: scraped?.rating ?? null,

      reviews: scraped?.reviewCount ?? null,

      availability: scraped?.availability ?? null,

      image: scraped?.image ?? null,

      url: scraped?.url ?? null,
    },

    /*
        =============================================
        PRICE INTELLIGENCE
        =============================================
        */

    priceAnalysis: priceAnalysis ?? null,

    priceIntelligence: priceIntelligence ?? null,

    /*
        =============================================
        PRICE EVENT
        =============================================
        */

    priceEvent: priceEvent ?? null,

    /*
        =============================================
        REAL 365-DAY HISTORY
        =============================================
        */

    history,

    priceHistory: history,

    priceSnapshots: history,

    /*
        =============================================
        RECOMMENDATIONS
        =============================================
        */

    recommendations: recommendations ?? null,

    /*
        =============================================
        VERIFIED MATCHES
        =============================================
        */

    matches: matchedProducts ?? [],

    /*
        =============================================
        VERIFICATION
        =============================================
        */

    verification: verification ?? null,
  };
}

/*
=====================================================
EXPORT
=====================================================
*/

module.exports = {
  buildProductResponse,
};
