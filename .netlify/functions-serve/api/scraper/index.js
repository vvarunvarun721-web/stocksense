// ============================================================
// STOCKSENSE - UNIVERSAL SCRAPER DISPATCHER
// ============================================================
// Purpose:
//   Route product URLs to the correct marketplace scraper.
//
// Supported marketplaces:
//   1. Amazon
//   2. Flipkart
//   3. AJIO
//   4. Meesho
//   5. Myntra
//   6. Nykaa
//   7. Reliance Digital
//   8. TataCliq
//
// Architecture:
//   Input URL
//      |
//      v
//   detectPlatform()
//      |
//      +---- Amazon --------> amazonScraper
//      |
//      +---- Flipkart ------> flipkartScraper
//      |
//      +---- AJIO ----------> ajioScraper
//      |
//      +---- Meesho --------> meeshoScraper
//      |
//      +---- Myntra --------> myntraScraper
//      |
//      +---- Nykaa ---------> nykaaScraper
//      |
//      +---- Reliance ------> relianceScraper
//      |
//      +---- TataCliq ------> tatacliqScraper
// ============================================================

const { detectPlatform } = require("../utils/platform");

// ============================================================
// OPTIONAL / INTERNAL DEPENDENCIES
// ============================================================

let searchAmazonProduct = null;

try {
  const amazonSearchModule = require("../services/search/platforms/amazon");

  if (typeof amazonSearchModule === "function") {
    searchAmazonProduct = amazonSearchModule;
  } else if (
    amazonSearchModule &&
    typeof amazonSearchModule.searchAmazonProduct === "function"
  ) {
    searchAmazonProduct =
      amazonSearchModule.searchAmazonProduct.bind(amazonSearchModule);
  } else if (
    amazonSearchModule &&
    typeof amazonSearchModule.search === "function"
  ) {
    searchAmazonProduct = amazonSearchModule.search.bind(amazonSearchModule);
  }

  console.log(
    "[StockSense] Amazon search adapter loaded:",
    typeof searchAmazonProduct,
  );
} catch (error) {
  console.warn(
    "[StockSense] Amazon search adapter could not be loaded:",
    error.message,
  );
}

function normalizeScraperModule(module, platform) {
  if (typeof module === "function") {
    return module;
  }

  if (module && typeof module.scrape === "function") {
    return module.scrape.bind(module);
  }

  if (module && typeof module.default === "function") {
    return module.default;
  }

  console.warn(
    `[StockSense] ${platform} scraper module loaded but no callable scraper was found`,
  );

  return null;
}

const amazonScraper = normalizeScraperModule(require("./amazon"), "Amazon");

const flipkartScraper = normalizeScraperModule(
  require("./flipkart"),
  "Flipkart",
);

const ajioScraper = normalizeScraperModule(require("./ajio"), "AJIO");

const meeshoScraper = normalizeScraperModule(require("./meesho"), "Meesho");

const myntraScraper = normalizeScraperModule(require("./myntra"), "Myntra");

const nykaaScraper = normalizeScraperModule(require("./nykaa"), "Nykaa");

const relianceScraper = normalizeScraperModule(
  require("./reliance"),
  "Reliance",
);

const tatacliqScraper = normalizeScraperModule(
  require("./tatacliq"),
  "TataCliq",
);

// ============================================================
// GENERIC HELPERS
// ============================================================

function isObject(value) {
  return value !== null && typeof value === "object";
}

function safeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value).trim();
}

function normalizePrice(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const cleaned = String(value)
    .replace(/₹/g, "")
    .replace(/Rs\.?/gi, "")
    .replace(/INR/gi, "")
    .replace(/,/g, "")
    .replace(/[^\d.]/g, "")
    .trim();

  if (!cleaned) {
    return null;
  }

  const number = Number(cleaned);

  return Number.isFinite(number) ? number : null;
}

function normalizeRating(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(
    String(value)
      .replace(/[^0-9.]/g, "")
      .trim(),
  );

  if (!Number.isFinite(number)) {
    return null;
  }

  return number;
}

function normalizeReviews(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const raw = String(value).trim().toLowerCase();

  if (!raw) {
    return null;
  }

  const cleaned = raw
    .replace(/,/g, "")
    .replace(/\+/g, "")
    .replace(/reviews?/g, "")
    .trim();

  const match = cleaned.match(/([\d.]+)\s*(k|m|l|cr)?/);

  if (!match) {
    const number = Number(cleaned);

    return Number.isFinite(number) ? number : null;
  }

  const base = Number(match[1]);

  if (!Number.isFinite(base)) {
    return null;
  }

  const suffix = match[2];

  if (suffix === "k") {
    return Math.round(base * 1000);
  }

  if (suffix === "m") {
    return Math.round(base * 1000000);
  }

  if (suffix === "l") {
    return Math.round(base * 100000);
  }

  if (suffix === "cr") {
    return Math.round(base * 10000000);
  }

  return Math.round(base);
}

function normalizeAvailability(value) {
  // ---------------------------------------------
  // BOOLEAN VALUES
  // ---------------------------------------------

  if (value === false) {
    return false;
  }

  if (value === true) {
    return true;
  }

  if (value === null || value === undefined) {
    return null;
  }

  // ---------------------------------------------
  // STRING VALUES
  // ---------------------------------------------

  const text = String(value ?? "")
    .toLowerCase()
    .trim();

  if (!text) {
    return null;
  }

  // ---------------------------------------------
  // OUT OF STOCK
  // ---------------------------------------------

  if (
    /out[\s-]*of[\s-]*stock/.test(text) ||
    /outofstock/.test(text) ||
    /sold[\s-]*out/.test(text) ||
    /currently[\s-]*unavailable/.test(text) ||
    /unavailable/.test(text) ||
    /schema\.org\/outofstock/.test(text)
  ) {
    return false;
  }

  // ---------------------------------------------
  // IN STOCK
  // ---------------------------------------------

  if (
    /in[\s-]*stock/.test(text) ||
    /instock/.test(text) ||
    /schema\.org\/instock/.test(text) ||
    /available/.test(text)
  ) {
    return true;
  }

  return null;
}

function normalizeUrl(value) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return String(value).trim() || null;
  }
}

function getFirstDefined(object, keys) {
  if (!isObject(object)) {
    return undefined;
  }

  for (const key of keys) {
    if (
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }

  return undefined;
}

// ============================================================
// PLATFORM NORMALIZATION
// ============================================================

function normalizePlatform(platform) {
  const value = safeString(platform).toLowerCase();

  if (!value) {
    return "unknown";
  }

  if (value === "amazon" || value.includes("amazon")) {
    return "amazon";
  }

  if (value === "flipkart" || value.includes("flipkart")) {
    return "flipkart";
  }

  if (value === "ajio" || value.includes("ajio")) {
    return "ajio";
  }

  if (value === "meesho" || value.includes("meesho")) {
    return "meesho";
  }

  if (value === "myntra" || value.includes("myntra")) {
    return "myntra";
  }

  if (value === "nykaa" || value.includes("nykaa")) {
    return "nykaa";
  }

  if (value === "reliance" || value.includes("reliance")) {
    return "reliance";
  }

  if (
    value === "tatacliq" ||
    value === "tata cliq" ||
    value.includes("tatacliq") ||
    value.includes("tata cliq")
  ) {
    return "tatacliq";
  }

  return value;
}

// ============================================================
// RESULT NORMALIZATION
// ============================================================

function normalizeScraperResult(result, platform, inputUrl) {
  if (!result) {
    return null;
  }

  let data = result;

  // Some scrapers may return:
  // { success: true, product: {...} }
  if (isObject(result) && result.product && isObject(result.product)) {
    data = result.product;
  }

  // Some scrapers may return:
  // { data: {...} }
  if (
    isObject(data) &&
    data.data &&
    isObject(data.data) &&
    !data.title &&
    !data.name &&
    !data.productName
  ) {
    data = data.data;
  }

  const title = safeString(
    getFirstDefined(data, [
      "title",
      "name",
      "productName",
      "product_title",
      "productTitle",
      "displayName",
    ]),
  );

  const price = normalizePrice(
    getFirstDefined(data, [
      "price",
      "sellingPrice",
      "salePrice",
      "currentPrice",
      "finalPrice",
      "amount",
      "offerPrice",
    ]),
  );

  const originalPrice = normalizePrice(
    getFirstDefined(data, [
      "originalPrice",
      "mrp",
      "listPrice",
      "regularPrice",
      "oldPrice",
    ]),
  );

  const image = normalizeUrl(
    getFirstDefined(data, [
      "image",
      "imageUrl",
      "imageURL",
      "productImage",
      "thumbnail",
      "thumbnailUrl",
      "mainImage",
    ]),
  );

  const productUrl = normalizeUrl(
    getFirstDefined(data, [
      "url",
      "productUrl",
      "productURL",
      "link",
      "href",
    ]) || inputUrl,
  );

  const rating = normalizeRating(
    getFirstDefined(data, ["rating", "averageRating", "avgRating", "stars"]),
  );

  const reviews = normalizeReviews(
    getFirstDefined(data, [
      "reviews",
      "reviewCount",
      "reviewsCount",
      "ratingsCount",
      "ratingCount",
    ]),
  );

  const availability = normalizeAvailability(
    getFirstDefined(data, [
      "availability",
      "available",
      "inStock",
      "stock",
      "status",
    ]),
  );

  console.log("🧪 NORMALIZED AVAILABILITY:", availability);

  return {
    ...data,

    platform: normalizePlatform(
      getFirstDefined(data, ["platform"]) || platform,
    ),

    title: title || null,
    price,
    originalPrice,
    image,
    url: productUrl,
    rating,
    reviews,
    availability,

    scrapedAt: data.scrapedAt || new Date().toISOString(),
  };
}

// ============================================================
// URL HELPERS
// ============================================================

function safeParseUrl(input) {
  try {
    return new URL(input);
  } catch {
    return null;
  }
}

function hostnameMatches(hostname, domains) {
  const host = safeString(hostname).toLowerCase();

  if (!host) {
    return false;
  }

  return domains.some((domain) => {
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");

    return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
  });
}

// ============================================================
// EXPLICIT MARKETPLACE DETECTION
// ============================================================

function detectMarketplaceFromUrl(inputUrl) {
  const parsed = safeParseUrl(inputUrl);

  if (!parsed) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostnameMatches(hostname, [
      "amazon.in",
      "amazon.com",
      "amazon.co.uk",
      "amazon.de",
      "amazon.ae",
      "amazon.sa",
      "amazon.com.au",
      "amazon.ca",
    ])
  ) {
    return "amazon";
  }

  if (hostnameMatches(hostname, ["flipkart.com"])) {
    return "flipkart";
  }

  if (hostnameMatches(hostname, ["ajio.com"])) {
    return "ajio";
  }

  if (hostnameMatches(hostname, ["meesho.com"])) {
    return "meesho";
  }

  if (hostnameMatches(hostname, ["myntra.com"])) {
    return "myntra";
  }

  if (hostnameMatches(hostname, ["nykaa.com", "nykaafashion.com"])) {
    return "nykaa";
  }

  if (
    hostnameMatches(hostname, ["reliancedigital.in", "reliancedigital.co.in"])
  ) {
    return "reliance";
  }

  if (hostnameMatches(hostname, ["tatacliq.com", "tatacliq.net"])) {
    return "tatacliq";
  }

  return null;
}

// ============================================================
// PLATFORM DETECTOR
// ============================================================

function resolvePlatform(inputUrl) {
  // ----------------------------------------------------------
  // First preference:
  // Explicit hostname detection.
  //
  // This avoids depending entirely on the shared platform
  // detector and guarantees that all supported marketplaces
  // reach their own direct scraper.
  // ----------------------------------------------------------

  const explicitPlatform = detectMarketplaceFromUrl(inputUrl);

  if (explicitPlatform) {
    return explicitPlatform;
  }

  // ----------------------------------------------------------
  // Second preference:
  // Existing StockSense platform detector.
  // ----------------------------------------------------------

  try {
    const detected = detectPlatform(inputUrl);

    if (detected) {
      const normalized = normalizePlatform(detected);

      if (normalized !== "unknown") {
        return normalized;
      }
    }
  } catch (error) {
    console.warn(
      "[StockSense] Shared platform detector failed:",
      error.message,
    );
  }

  // ----------------------------------------------------------
  // Additional explicit hostname checks.
  // These are intentionally kept as a defensive fallback.
  // ----------------------------------------------------------

  try {
    const url = new URL(inputUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname.includes("amazon.")) {
      return "amazon";
    }

    if (hostname.includes("flipkart.")) {
      return "flipkart";
    }

    if (hostname.includes("ajio.")) {
      return "ajio";
    }

    if (hostname.includes("meesho.")) {
      return "meesho";
    }

    if (hostname.includes("myntra.")) {
      return "myntra";
    }

    if (hostname.includes("nykaa.")) {
      return "nykaa";
    }

    if (hostname.includes("reliancedigital.")) {
      return "reliance";
    }

    if (hostname.includes("tatacliq.")) {
      return "tatacliq";
    }
  } catch {
    // Ignore malformed URL here.
  }

  return null;
}

// ============================================================
// SCRAPER EXECUTION HELPER
// ============================================================

async function executeScraper(scraper, inputUrl, platform, options = {}) {
  if (typeof scraper !== "function") {
    throw new Error(`${platform} scraper is not available`);
  }

  const timeout = Number(options.timeout) > 0 ? Number(options.timeout) : 45000;

  const scraperPromise = Promise.resolve().then(() =>
    scraper(inputUrl, options),
  );

  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${platform} scraper timed out after ${timeout}ms`));
    }, timeout);
  });

  try {
    return await Promise.race([scraperPromise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ============================================================
// AMAZON SEARCH RESULT NORMALIZATION
// ============================================================

function normalizeAmazonSearchResult(result) {
  if (!result) {
    return null;
  }

  const data =
    result.product && isObject(result.product) ? result.product : result;

  const title = safeString(
    getFirstDefined(data, ["title", "name", "productName"]),
  );

  const price = normalizePrice(
    getFirstDefined(data, [
      "price",
      "sellingPrice",
      "currentPrice",
      "salePrice",
    ]),
  );

  const url = normalizeUrl(
    getFirstDefined(data, ["url", "productUrl", "link", "href"]),
  );

  const image = normalizeUrl(
    getFirstDefined(data, ["image", "imageUrl", "thumbnail", "thumbnailUrl"]),
  );

  if (!title && !url) {
    return null;
  }

  return {
    ...data,
    platform: "amazon",
    title: title || null,
    price,
    url,
    image,
    rating: normalizeRating(getFirstDefined(data, ["rating", "averageRating"])),
    reviews: normalizeReviews(
      getFirstDefined(data, ["reviews", "reviewCount", "ratingsCount"]),
    ),
  };
}

// ============================================================
// AMAZON SEARCH FALLBACK
// ============================================================

async function runAmazonSearchFallback(query, options = {}) {
  if (!query || typeof searchAmazonProduct !== "function") {
    return null;
  }

  try {
    const result = await searchAmazonProduct(query, options);

    if (Array.isArray(result)) {
      for (const item of result) {
        const normalized = normalizeAmazonSearchResult(item);

        if (normalized) {
          return normalized;
        }
      }

      return null;
    }

    return normalizeAmazonSearchResult(result);
  } catch (error) {
    console.warn("[StockSense] Amazon search fallback failed:", error.message);

    return null;
  }
}

// ============================================================
// AMAZON RECOVERY HELPERS
// ============================================================

function extractAmazonAsin(inputUrl) {
  if (!inputUrl) {
    return null;
  }

  const text = String(inputUrl);

  const patterns = [
    /\/dp\/([A-Z0-9]{10})/i,
    /\/gp\/product\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /\/dp\/product\/([A-Z0-9]{10})/i,
    /[?&]asin=([A-Z0-9]{10})/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

function cleanAmazonUrl(inputUrl) {
  if (!inputUrl) {
    return inputUrl;
  }

  try {
    const url = new URL(inputUrl);

    // Remove tracking/query parameters where possible.
    const keepParameters = new Set(["psc", "th", "smid", "tag"]);

    const params = new URLSearchParams(url.search);

    for (const key of [...params.keys()]) {
      if (!keepParameters.has(key)) {
        params.delete(key);
      }
    }

    url.search = params.toString();

    return url.toString();
  } catch {
    return inputUrl;
  }
}

// ============================================================
// AMAZON RECOVERY QUERY
// ============================================================

function buildAmazonRecoveryQueries(inputUrl, scrapedResult) {
  const queries = [];

  const asin = extractAmazonAsin(inputUrl);

  if (asin) {
    queries.push(asin);
  }

  if (scrapedResult) {
    const title = safeString(
      scrapedResult.title || scrapedResult.name || scrapedResult.productName,
    );

    if (title) {
      queries.push(title);
    }
  }

  return [...new Set(queries.map((value) => value.trim()).filter(Boolean))];
}

// ============================================================
// AMAZON RECOVERY EXECUTION
// ============================================================

async function recoverAmazonProduct(inputUrl, initialResult, options = {}) {
  const queries = buildAmazonRecoveryQueries(inputUrl, initialResult);

  if (!queries.length) {
    return null;
  }

  for (const query of queries) {
    const result = await runAmazonSearchFallback(query, options);

    if (result) {
      return result;
    }
  }

  return null;
}

// ============================================================
// GENERIC MARKETPLACE FALLBACK
// ============================================================

async function searchMarketplaceProductFallback(
  platform,
  inputUrl,
  options = {},
) {
  const normalizedPlatform = normalizePlatform(platform);

  // ----------------------------------------------------------
  // IMPORTANT:
  // Direct scrapers are preferred for all supported platforms.
  // This helper remains available as a defensive fallback.
  // ----------------------------------------------------------

  let scraper = null;

  switch (normalizedPlatform) {
    case "amazon":
      scraper = amazonScraper;
      break;

    case "flipkart":
      scraper = flipkartScraper;
      break;

    case "ajio":
      scraper = ajioScraper;
      break;

    case "meesho":
      scraper = meeshoScraper;
      break;

    case "myntra":
      scraper = myntraScraper;
      break;

    case "nykaa":
      scraper = nykaaScraper;
      break;

    case "reliance":
      scraper = relianceScraper;
      break;

    case "tatacliq":
      scraper = tatacliqScraper;
      break;

    default:
      return null;
  }

  try {
    const result = await executeScraper(
      scraper,
      inputUrl,
      normalizedPlatform,
      options,
    );

    return normalizeScraperResult(result, normalizedPlatform, inputUrl);
  } catch (error) {
    console.warn(
      `[StockSense] ${normalizedPlatform} fallback failed:`,
      error.message,
    );

    return null;
  }
}

// ============================================================
// TATA CLIQ SEARCH URL HANDLING
// ============================================================

function isTatacliqSearchUrl(url) {
  try {
    const parsed = new URL(url);

    const pathname = parsed.pathname.toLowerCase();

    return pathname === "/search" || pathname.startsWith("/search/");
  } catch (_) {
    return false;
  }
}

// ============================================================
// EXTRACT TATA CLIQ SEARCH QUERY
// ============================================================

function extractTatacliqSearchQuery(url) {
  try {
    const parsed = new URL(url);

    let query = parsed.searchParams.get("text");

    if (!query) {
      query = parsed.searchParams.get("q");
    }

    if (!query) {
      return "";
    }

    /*
        Example:

        GNC:relevance:list:listId_b2a0c7...

        We only want:

        GNC
        */

    query = query
      .split(":")[0]
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return query;
  } catch (_) {
    return "";
  }
}

// ============================================================
// HANDLE TATA CLIQ SEARCH URL
// ============================================================

async function scrapeTatacliqSearchUrl(url) {
  const query = extractTatacliqSearchQuery(url);

  if (!query) {
    throw new Error(
      "TataCliq search URL does not contain a valid search query",
    );
  }

  console.log("🔎 TataCliq search URL detected");

  console.log("🔎 TataCliq search query:", query);

  let products = [];

  // --------------------------------------------------------
  // SEARCH
  // --------------------------------------------------------

  try {
    if (typeof tatacliqSearchAdapter.searchFast === "function") {
      console.log("⚡ TataCliq: Using searchFast");

      products = await tatacliqSearchAdapter.searchFast(query, {});
    } else if (typeof tatacliqSearchAdapter.search === "function") {
      console.log("🔎 TataCliq: Using standard search");

      products = await tatacliqSearchAdapter.search(query, {});
    }
  } catch (error) {
    console.log("⚠️ TataCliq searchFast failed:", error.message);

    if (typeof tatacliqSearchAdapter.search === "function") {
      products = await tatacliqSearchAdapter.search(query, {});
    }
  }

  // --------------------------------------------------------
  // VALIDATE
  // --------------------------------------------------------

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error(`TataCliq search returned no products for "${query}"`);
  }

  console.log(`🔎 TataCliq search returned ${products.length} products`);

  // --------------------------------------------------------
  // FIRST VALID NORMALIZED PRODUCT
  // --------------------------------------------------------

  const product = products.find(
    (item) => item && (item.title || item.productName || item.name),
  );

  if (!product) {
    throw new Error(`TataCliq search returned invalid products for "${query}"`);
  }

  const title = product.title || product.productName || product.name || query;

  const productUrl = product.url || product.productUrl || url;

  const price =
    product.price ?? product.currentPrice ?? product.salePrice ?? null;

  console.log("✅ TataCliq search product selected:", {
    title,
    price,
    url: productUrl,
  });

  return {
    platform: "TataCliq",

    url: productUrl,

    title,

    currentPrice: price,

    image: product.image || product.imageUrl || product.thumbnail || null,

    rating: product.rating ?? null,

    reviewCount: product.reviewCount ?? product.reviews ?? null,

    availability: product.availability ?? "Unknown",

    inputType: "url",
  };
}

// ============================================================
// MAIN SCRAPE FUNCTION
// ============================================================

async function scrapeProduct(inputUrl, options = {}) {
  if (!inputUrl) {
    throw new Error("Product URL is required");
  }

  const url = safeString(inputUrl);

  if (!url) {
    throw new Error("Product URL cannot be empty");
  }

  const platform = resolvePlatform(url);

  if (!platform) {
    throw new Error(`Unsupported marketplace URL: ${url}`);
  }

  console.log(`[StockSense] Scraping ${platform}: ${url}`);

  // ==========================================================
  // AMAZON
  // ==========================================================

  if (platform === "amazon") {
    const cleanedUrl = cleanAmazonUrl(url);

    let result = null;

    try {
      result = await executeScraper(
        amazonScraper,
        cleanedUrl,
        "amazon",
        options,
      );
    } catch (error) {
      console.warn("[StockSense] Amazon direct scraper failed:", error.message);
    }

    let normalized = normalizeScraperResult(result, "amazon", cleanedUrl);

    // --------------------------------------------------------
    // AMAZON RECOVERY
    // --------------------------------------------------------

    if (!normalized || !normalized.title || !normalized.price) {
      const recovered = await recoverAmazonProduct(
        cleanedUrl,
        normalized || result,
        options,
      );

      if (recovered) {
        normalized = normalizeScraperResult(recovered, "amazon", cleanedUrl);
      }
    }

    if (!normalized) {
      throw new Error("Amazon product could not be extracted");
    }

    return normalized;
  }

  // ==========================================================
  // FLIPKART
  // ==========================================================

  if (platform === "flipkart") {
    try {
      const result = await executeScraper(
        flipkartScraper,
        url,
        "flipkart",
        options,
      );

      const normalized = normalizeScraperResult(result, "flipkart", url);

      if (!normalized) {
        throw new Error("Flipkart product could not be extracted");
      }

      return normalized;
    } catch (error) {
      console.error("[StockSense] Flipkart scraper failed:", error.message);

      throw error;
    }
  }

  // ==========================================================
  // AJIO
  // ==========================================================

  if (platform === "ajio") {
    try {
      const result = await executeScraper(ajioScraper, url, "ajio", options);

      const normalized = normalizeScraperResult(result, "ajio", url);

      if (!normalized) {
        throw new Error("AJIO product could not be extracted");
      }

      return normalized;
    } catch (error) {
      console.error("[StockSense] AJIO scraper failed:", error.message);

      throw error;
    }
  }

  // ==========================================================
  // MEESHO
  // ==========================================================

  if (platform === "meesho") {
    try {
      const result = await executeScraper(
        meeshoScraper,
        url,
        "meesho",
        options,
      );

      const normalized = normalizeScraperResult(result, "meesho", url);

      if (!normalized) {
        throw new Error("Meesho product could not be extracted");
      }

      return normalized;
    } catch (error) {
      console.error("[StockSense] Meesho scraper failed:", error.message);

      throw error;
    }
  }

  // ==========================================================
  // MYNTRA
  // ==========================================================

  if (platform === "myntra") {
    try {
      const result = await executeScraper(
        myntraScraper,
        url,
        "myntra",
        options,
      );

      const normalized = normalizeScraperResult(result, "myntra", url);

      if (!normalized) {
        throw new Error("Myntra product could not be extracted");
      }

      return normalized;
    } catch (error) {
      console.error("[StockSense] Myntra scraper failed:", error.message);

      throw error;
    }
  }

  // ==========================================================
  // NYKAA
  // ==========================================================

  if (platform === "nykaa") {
    try {
      const result = await executeScraper(nykaaScraper, url, "nykaa", options);

      const normalized = normalizeScraperResult(result, "nykaa", url);

      if (!normalized) {
        throw new Error("Nykaa product could not be extracted");
      }

      return normalized;
    } catch (error) {
      console.error("[StockSense] Nykaa scraper failed:", error.message);

      throw error;
    }
  }

  // ==========================================================
  // RELIANCE DIGITAL
  // ==========================================================

  if (platform === "reliance") {
    try {
      const result = await executeScraper(
        relianceScraper,
        url,
        "reliance",
        options,
      );

      const normalized = normalizeScraperResult(result, "reliance", url);

      if (!normalized) {
        throw new Error("Reliance Digital product could not be extracted");
      }

      return normalized;
    } catch (error) {
      console.error(
        "[StockSense] Reliance Digital scraper failed:",
        error.message,
      );

      throw error;
    }
  }

  // ==========================================================
  // TATACLIQ
  // ==========================================================

  if (platform === "tatacliq") {
    try {
      const result = await executeScraper(
        tatacliqScraper,
        url,
        "tatacliq",
        options,
      );

      const normalized = normalizeScraperResult(result, "tatacliq", url);

      if (!normalized) {
        throw new Error("TataCliq product could not be extracted");
      }

      return normalized;
    } catch (error) {
      console.error("[StockSense] TataCliq scraper failed:", error.message);

      throw error;
    }
  }

  // ==========================================================
  // DEFENSIVE FALLBACK
  // ==========================================================

  const fallback = await searchMarketplaceProductFallback(
    platform,
    url,
    options,
  );

  if (fallback) {
    return fallback;
  }

  throw new Error(`No scraper available for platform: ${platform}`);
}

// ============================================================
// BUILD AMAZON SEARCH QUERY FROM PRODUCT URL
// ============================================================

function buildAmazonSearchQuery(originalUrl, scrapedProduct = null) {
  let cleanUrl = normalizeAmazonUrl(originalUrl);

  const asin = extractAmazonAsin(cleanUrl);

  if (scrapedProduct && typeof scrapedProduct === "object") {
    const possibleTitle =
      scrapedProduct.title || scrapedProduct.productName || scrapedProduct.name;

    if (typeof possibleTitle === "string" && possibleTitle.trim()) {
      return possibleTitle.trim();
    }
  }

  if (asin) {
    return asin;
  }

  try {
    const parsed = new URL(cleanUrl);

    const path = decodeURIComponent(parsed.pathname);

    const slug = path
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .replace(/[-_]+/g, " ");

    if (slug && slug.length > 3) {
      return slug;
    }
  } catch {
    // Ignore malformed URL.
  }

  return null;
}

// ============================================================
// AMAZON SEARCH ADAPTER NORMALIZER
// ============================================================

function normalizeAmazonSearchResults(result) {
  if (!result) {
    return [];
  }

  let items = [];

  if (Array.isArray(result)) {
    items = result;
  } else if (Array.isArray(result.products)) {
    items = result.products;
  } else if (Array.isArray(result.results)) {
    items = result.results;
  } else if (Array.isArray(result.items)) {
    items = result.items;
  } else if (result.product) {
    items = [result.product];
  } else {
    items = [result];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const title =
        item.title || item.productName || item.name || item.nameText || null;

      const url = item.url || item.productUrl || item.link || item.href || null;

      const image =
        item.image ||
        item.imageUrl ||
        item.thumbnail ||
        item.thumbnailUrl ||
        null;

      const price = parsePrice(
        item.price || item.currentPrice || item.sellingPrice || item.salePrice,
      );

      const rating = parseRating(item.rating || item.averageRating);

      const reviews = parseReviewCount(
        item.reviews || item.reviewCount || item.ratingCount,
      );

      return {
        ...item,

        title: title ? String(title).trim() : null,

        productName: title ? String(title).trim() : null,

        url: url ? String(url).trim() : null,

        image: image ? String(image).trim() : null,

        price,

        currentPrice: price,

        rating,

        reviews,

        platform: "amazon",
      };
    })
    .filter(Boolean);
}

// ============================================================
// AMAZON SEARCH RESULT SCORING
// ============================================================

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return [];
  }

  return normalized.split(" ").filter((token) => token.length > 1);
}

function calculateTextSimilarity(source, target) {
  const sourceTokens = tokenize(source);

  const targetTokens = tokenize(target);

  if (!sourceTokens.length || !targetTokens.length) {
    return 0;
  }

  const targetSet = new Set(targetTokens);

  let matches = 0;

  for (const token of sourceTokens) {
    if (targetSet.has(token)) {
      matches++;
    }
  }

  return matches / Math.max(sourceTokens.length, targetTokens.length);
}

function scoreAmazonSearchResult(result, query, asin = null) {
  if (!result) {
    return -Infinity;
  }

  let score = 0;

  const resultUrl = String(result.url || "");

  const resultAsin = extractAmazonAsin(resultUrl);

  if (asin && resultAsin && asin === resultAsin) {
    score += 1000;
  }

  const title = result.title || result.productName || result.name || "";

  const similarity = calculateTextSimilarity(query, title);

  score += similarity * 100;

  if (result.price !== null && result.price !== undefined) {
    score += 5;
  }

  if (result.image) {
    score += 2;
  }

  if (result.rating) {
    score += 1;
  }

  if (result.reviews) {
    score += 1;
  }

  return score;
}

// ============================================================
// FIND BEST AMAZON SEARCH RESULT
// ============================================================

function selectBestAmazonSearchResult(results, query, asin = null) {
  if (!Array.isArray(results) || !results.length) {
    return null;
  }

  let best = null;

  let bestScore = -Infinity;

  for (const result of results) {
    const score = scoreAmazonSearchResult(result, query, asin);

    if (score > bestScore) {
      bestScore = score;

      best = result;
    }
  }

  return best;
}

// ============================================================
// AMAZON SEARCH FALLBACK
// ============================================================

async function amazonSearchFallback(
  originalUrl,
  scrapedProduct = null,
  options = {},
) {
  if (!amazonSearchAdapter) {
    return null;
  }

  const query = buildAmazonSearchQuery(originalUrl, scrapedProduct);

  if (!query) {
    return null;
  }

  const asin = extractAmazonAsin(originalUrl);

  console.log(`🔎 Amazon: Search fallback query: ${query}`);

  try {
    let results = null;

    if (typeof amazonSearchAdapter === "function") {
      results = await amazonSearchAdapter(query, options);
    } else if (typeof amazonSearchAdapter.search === "function") {
      results = await amazonSearchAdapter.search(query, options);
    } else if (typeof amazonSearchAdapter.searchAmazonProduct === "function") {
      results = await amazonSearchAdapter.searchAmazonProduct(query, options);
    }

    const normalized = normalizeAmazonSearchResults(results);

    if (!normalized.length) {
      console.log("⚠️ Amazon: Search fallback returned no results");

      return null;
    }

    const best = selectBestAmazonSearchResult(normalized, query, asin);

    if (!best) {
      return null;
    }

    console.log(
      "✅ Amazon: Search fallback found product:",
      best.title || best.productName || "Unknown",
    );

    return best;
  } catch (error) {
    console.warn("⚠️ Amazon: Search fallback failed:", error.message);

    return null;
  }
}

// ============================================================
// AMAZON RESULT MERGER
// ============================================================

function mergeProductResults(primary, fallback) {
  if (!primary && !fallback) {
    return null;
  }

  if (!primary) {
    return fallback;
  }

  if (!fallback) {
    return primary;
  }

  const merged = {
    ...fallback,
    ...primary,
  };

  const fields = [
    "title",
    "productName",
    "name",
    "price",
    "currentPrice",
    "image",
    "url",
    "rating",
    "reviews",
    "availability",
  ];

  for (const field of fields) {
    const primaryValue = primary[field];

    const fallbackValue = fallback[field];

    const primaryMissing =
      primaryValue === undefined ||
      primaryValue === null ||
      primaryValue === "";

    if (
      primaryMissing &&
      fallbackValue !== undefined &&
      fallbackValue !== null &&
      fallbackValue !== ""
    ) {
      merged[field] = fallbackValue;
    }
  }

  return merged;
}

// ============================================================
// GENERIC SCRAPER RESULT CLEANUP
// ============================================================

function cleanupScraperResult(result, platform, originalUrl) {
  if (!result) {
    return null;
  }

  let product = result;

  if (result.product && typeof result.product === "object") {
    product = result.product;
  }

  if (
    result.data &&
    typeof result.data === "object" &&
    !result.title &&
    !result.productName
  ) {
    product = result.data;
  }

  const title =
    product.title ||
    product.productName ||
    product.name ||
    product.product_title ||
    null;

  const price = parsePrice(
    product.price ||
      product.currentPrice ||
      product.sellingPrice ||
      product.salePrice ||
      product.offerPrice,
  );

  const originalPrice = parsePrice(
    product.originalPrice ||
      product.mrp ||
      product.listPrice ||
      product.regularPrice,
  );

  const image =
    product.image ||
    product.imageUrl ||
    product.thumbnail ||
    product.thumbnailUrl ||
    product.productImage ||
    null;

  const url = product.url || product.productUrl || product.link || originalUrl;

  const rating = parseRating(
    product.rating || product.averageRating || product.avgRating,
  );

  const reviews = parseReviewCount(
    product.reviews ||
      product.reviewCount ||
      product.reviewsCount ||
      product.ratingCount,
  );

  let availability = product.availability;

  if (availability === undefined || availability === null) {
    availability = product.inStock;
  }

  if (availability === undefined || availability === null) {
    availability = product.stock;
  }

  return {
    ...product,

    platform,

    title: title ? String(title).trim() : null,

    productName: title ? String(title).trim() : null,

    price,

    currentPrice: price,

    originalPrice,

    image: image ? String(image).trim() : null,

    url: url ? String(url).trim() : originalUrl,

    rating,

    reviews,

    availability,
  };
}

// ============================================================
// AMAZON RECOVERY PIPELINE
// ============================================================

async function runAmazonRecoveryPipeline(
  originalUrl,
  primaryResult,
  options = {},
) {
  let result = cleanupScraperResult(primaryResult, "amazon", originalUrl);

  const hasUsefulTitle = result && result.title;

  const hasUsefulPrice =
    result && result.price !== null && result.price !== undefined;

  const hasUsefulUrl = result && result.url;

  // ----------------------------------------------------------
  // If the direct scraper already returned a healthy product,
  // keep it.
  // ----------------------------------------------------------

  if (hasUsefulTitle && hasUsefulPrice && hasUsefulUrl) {
    return result;
  }

  // ----------------------------------------------------------
  // Search fallback
  // ----------------------------------------------------------

  const fallback = await amazonSearchFallback(originalUrl, result, options);

  if (fallback) {
    result = cleanupScraperResult(
      mergeProductResults(result, fallback),
      "amazon",
      originalUrl,
    );
  }

  // ----------------------------------------------------------
  // ASIN-specific recovery
  // ----------------------------------------------------------

  if (!result || !result.price) {
    const asin = extractAmazonAsin(originalUrl);

    if (asin && amazonSearchAdapter) {
      try {
        console.log(`🔎 Amazon: Last-resort ASIN search: ${asin}`);

        let results = null;

        if (typeof amazonSearchAdapter === "function") {
          results = await amazonSearchAdapter(asin, options);
        } else if (typeof amazonSearchAdapter.search === "function") {
          results = await amazonSearchAdapter.search(asin, options);
        } else if (
          typeof amazonSearchAdapter.searchAmazonProduct === "function"
        ) {
          results = await amazonSearchAdapter.searchAmazonProduct(
            asin,
            options,
          );
        }

        const normalized = normalizeAmazonSearchResults(results);

        const best = selectBestAmazonSearchResult(normalized, asin, asin);

        if (best) {
          result = cleanupScraperResult(
            mergeProductResults(result, best),
            "amazon",
            originalUrl,
          );
        }
      } catch (recoveryError) {
        console.warn("⚠️ Amazon: ASIN recovery failed:", recoveryError.message);
      }
    }
  }

  return result;
}

// ============================================================
// DIRECT MARKETPLACE DETECTION OVERRIDE
// ============================================================
//
// The shared platform detector can return "unknown" for some
// marketplace hostnames.
//
// Keep the existing detector as the primary source, but use
// explicit hostname checks for marketplaces that we know.
//
//

function detectScraperPlatform(url) {
  const cleanUrl = String(url || "").trim();

  try {
    const parsed = new URL(cleanUrl);

    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    /*
        --------------------------------------------------------
        AMAZON
        --------------------------------------------------------
        */

    if (hostname === "amazon.in" || hostname.endsWith(".amazon.in")) {
      return "amazon";
    }

    /*
        --------------------------------------------------------
        FLIPKART
        --------------------------------------------------------
        */

    if (hostname === "flipkart.com" || hostname.endsWith(".flipkart.com")) {
      return "flipkart";
    }

    /*
        --------------------------------------------------------
        MEESHO
        --------------------------------------------------------
        */

    if (hostname === "meesho.com" || hostname.endsWith(".meesho.com")) {
      return "meesho";
    }

    /*
        --------------------------------------------------------
        RELIANCE DIGITAL
        --------------------------------------------------------
        */

    if (
      hostname === "reliancedigital.in" ||
      hostname.endsWith(".reliancedigital.in")
    ) {
      return "reliance";
    }
  } catch (_) {
    /* Ignore malformed URL here. */
  }

  /*
    ------------------------------------------------------------
    FALL BACK TO EXISTING SHARED DETECTOR
    ------------------------------------------------------------
    */

  /*
    ------------------------------------------------------------
    EXPLICIT DETECTION FOR THE SIX DIRECT SCRAPERS
    ------------------------------------------------------------
    */

  try {
    const parsed = new URL(cleanUrl);

    const hostname = parsed.hostname.toLowerCase().replace(/^www\\./, "");

    if (hostname === "ajio.com" || hostname.endsWith(".ajio.com")) {
      return "ajio";
    }

    if (hostname === "meesho.com" || hostname.endsWith(".meesho.com")) {
      return "meesho";
    }

    if (hostname === "myntra.com" || hostname.endsWith(".myntra.com")) {
      return "myntra";
    }

    if (hostname === "nykaa.com" || hostname.endsWith(".nykaa.com")) {
      return "nykaa";
    }

    if (
      hostname === "reliancedigital.in" ||
      hostname.endsWith(".reliancedigital.in")
    ) {
      return "reliance";
    }

    if (hostname === "tatacliq.com" || hostname.endsWith(".tatacliq.com")) {
      return "tatacliq";
    }
  } catch (_) {
    /* Let the shared detector handle malformed inputs. */
  }

  return detectPlatform(cleanUrl);
}

// ============================================================
// GENERIC SEARCH FALLBACK FOR MARKETPLACE URL
// ============================================================
//
// Used when a marketplace has a search adapter but does not
// have a dedicated direct-product scraper.
//
//

async function searchMarketplaceProductFallback(
  originalUrl,
  platform,
  adapter,
) {
  if (!adapter) {
    throw new Error(`${platform} scraper/search adapter is unavailable`);
  }

  /*
    ------------------------------------------------------------
    BUILD SEARCH QUERY FROM URL
    ------------------------------------------------------------
    */

  let query = "";

  try {
    const parsed = new URL(originalUrl);

    query = decodeURIComponent(parsed.pathname)
      .replace(/^\/+/, "")
      .replace(/\/p\/.*$/i, "")
      .replace(/\/product\/.*$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (_) {
    query = "";
  }

  /*
    Remove excessive URL noise.
    */

  query = query
    .replace(/\b(?:original|copy|share|click|redirect)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!query) {
    throw new Error(`${platform} fallback could not build a product query`);
  }

  console.log(`🔄 ${platform}: Starting search fallback`);

  console.log(`🔎 ${platform} fallback query:`, query);

  /*
    ------------------------------------------------------------
    SEARCH
    ------------------------------------------------------------
    */

  let products = [];

  try {
    if (typeof adapter.searchFast === "function") {
      products = await adapter.searchFast(query, {});
    } else if (typeof adapter.search === "function") {
      products = await adapter.search(query, {});
    }
  } catch (error) {
    console.log(`⚠️ ${platform} fallback search failed:`, error.message);

    if (typeof adapter.search === "function") {
      products = await adapter.search(query, {});
    }
  }

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error(`${platform} fallback search returned no products`);
  }

  /*
    ------------------------------------------------------------
    PICK THE BEST TITLE MATCH
    ------------------------------------------------------------
    */

  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 3);

  let best = null;

  let bestScore = 0;

  for (const product of products) {
    const title = String(
      product?.title || product?.productName || product?.name || "",
    )
      .toLowerCase()
      .trim();

    if (!title) {
      continue;
    }

    const titleTokens = new Set(
      title
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean),
    );

    let matches = 0;

    for (const token of queryTokens) {
      if (titleTokens.has(token)) {
        matches++;
      }
    }

    const score = queryTokens.length > 0 ? matches / queryTokens.length : 0;

    if (score > bestScore) {
      bestScore = score;

      best = product;
    }
  }

  if (!best) {
    throw new Error(
      `${platform} fallback could not identify the requested product`,
    );
  }

  console.log(
    `✅ ${platform} fallback candidate found (${bestScore.toFixed(2)})`,
  );

  /*
    ------------------------------------------------------------
    NORMALIZE RETURN SHAPE
    ------------------------------------------------------------
    */

  return {
    platform: platform === "reliance" ? "Reliance" : "Meesho",

    url: best.url || best.productUrl || originalUrl,

    title: best.title || best.productName || best.name || "Product",

    currentPrice: best.price ?? best.currentPrice ?? best.salePrice ?? null,

    image: best.image || best.imageUrl || best.thumbnail || null,

    rating: best.rating ?? null,

    reviewCount: best.reviewCount ?? best.reviews ?? null,

    availability: best.availability ?? "Unknown",

    inputType: "url",
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  scrapeProduct,
  resolvePlatform,
  detectMarketplaceFromUrl,
  normalizeScraperResult,
  normalizePlatform,
};
