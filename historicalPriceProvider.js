const axios = require("axios");

async function getHistoricalPrices({ sourceUrl, platform, days = 365 }) {
  if (!sourceUrl) {
    return [];
  }

  /*
    =================================================
    PROVIDER CONFIGURATION
    =================================================
    */

  const apiUrl = process.env.PRICE_HISTORY_API_URL;

  const apiKey = process.env.PRICE_HISTORY_API_KEY;

  /*
    Provider is not configured.
    StockSense continues using its own history.
    */

  if (!apiUrl || !apiKey) {
    console.log("ℹ️ Historical provider not configured");

    return [];
  }

  try {
    const response = await axios.get(apiUrl, {
      params: {
        url: sourceUrl,
        platform,
        days,
      },

      headers: {
        Authorization: `Bearer ${apiKey}`,

        Accept: "application/json",
      },

      timeout: 5000,
    });

    const records = Array.isArray(response?.data?.history)
      ? response.data.history
      : [];

    return records
      .map((item) => {
        const price = Number(item?.price);

        const checkedAt = new Date(item?.checkedAt || item?.date);

        if (!Number.isFinite(price) || Number.isNaN(checkedAt.getTime())) {
          return null;
        }

        return {
          price,

          checkedAt,

          platform: platform || null,

          source: "historical_provider",
        };
      })

      .filter(Boolean);
  } catch (error) {
    console.error("⚠️ Historical provider failed:", error.message);

    return [];
  }
}

module.exports = {
  getHistoricalPrices,
};
