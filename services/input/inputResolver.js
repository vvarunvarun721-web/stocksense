// ============================================================
// STOCKSENSE - UNIVERSAL PRODUCT INPUT RESOLVER
// ============================================================

const { scrapeProduct } = require("../../scraper");
const { resolveImageProduct } = require("./imageProductResolver");

const ajioSearchAdapter = require("../search/platforms/ajio");

// ------------------------------------------------------------
// URL CHECK
// ------------------------------------------------------------

function isHttpUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value.trim());

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// IMAGE URL CHECK
// ------------------------------------------------------------

function looksLikeImageUrl(value) {
  if (!isHttpUrl(value)) {
    return false;
  }

  let url;

  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }

  const pathname = url.pathname.toLowerCase();

  const hostname = url.hostname.toLowerCase();

  const search = url.search.toLowerCase();

  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".avif",
  ];

  if (imageExtensions.some((extension) => pathname.endsWith(extension))) {
    return true;
  }

  // Amazon image URLs

  if (hostname.includes("media-amazon.com") && pathname.includes("/images/")) {
    return true;
  }

  // AJIO CDN image URLs

  if (hostname.includes("jiocdn.com") || hostname.includes("ajio.com")) {
    const looksLikeAjioImage =
      pathname.includes("/medias/") ||
      pathname.includes("/images/") ||
      pathname.includes("/image/") ||
      pathname.includes("/img/");

    if (looksLikeAjioImage) {
      return true;
    }
  }

  // Common image paths

  if (
    pathname.includes("/image/") ||
    pathname.includes("/images/") ||
    pathname.includes("/img/")
  ) {
    return true;
  }

  // Image query parameters

  const imageQueryParameters = ["format=", "image=", "img=", "type=image"];

  if (imageQueryParameters.some((parameter) => search.includes(parameter))) {
    return true;
  }

  // Known image/CDN hosts

  const imageHosts = [
    "images.unsplash.com",
    "images.pexels.com",
    "i.imgur.com",
    "cloudinary.com",
    "imagekit.io",
  ];

  if (
    imageHosts.some(
      (host) => hostname === host || hostname.endsWith(`.${host}`),
    )
  ) {
    return true;
  }

  return false;
}

// ------------------------------------------------------------
// MARKETPLACE PRODUCT URL CHECK
// ------------------------------------------------------------

function looksLikeMarketplaceProductUrl(value) {
  if (!isHttpUrl(value)) {
    return false;
  }

  let url;

  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  const pathname = url.pathname.toLowerCase();

  // AMAZON

  if (hostname === "amazon.in" || hostname === "amazon.com") {
    return pathname.includes("/dp/") || pathname.includes("/gp/product/");
  }

  // FLIPKART

  if (hostname === "flipkart.com") {
    return pathname.includes("/p/");
  }

  // MYNTRA

  if (hostname === "myntra.com") {
    return pathname.length > 1;
  }

  // AJIO

  if (hostname === "ajio.com") {
    return pathname.includes("/p/");
  }

  // MEESHO

  if (hostname === "meesho.com") {
    return pathname.includes("/product/");
  }

  // RELIANCE DIGITAL

  if (hostname === "reliancedigital.in") {
    return pathname.length > 1;
  }

  // TATA CLIQ

  if (hostname === "tatacliq.com") {
    return pathname.includes("/p-") || pathname.includes("/product/");
  }

  // JIOMART

  if (hostname === "jiomart.com") {
    return pathname.includes("/p/") || pathname.includes("/products/");
  }

  return false;
}

// ------------------------------------------------------------
// GENERIC URL HELPERS
// ------------------------------------------------------------

function getHostname(value) {
  try {
    return new URL(value.trim()).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getPathname(value) {
  try {
    return new URL(value.trim()).pathname.toLowerCase();
  } catch {
    return "";
  }
}

// ------------------------------------------------------------
// AJIO ONE-LINK CHECK
// ------------------------------------------------------------

function isAjioOneLink(value) {
  const hostname = getHostname(value);

  return (
    hostname === "ajioapps.onelink.me" ||
    (hostname.endsWith(".onelink.me") && hostname.includes("ajio"))
  );
}

// ------------------------------------------------------------
// AJIO CAMPAIGN / COLLECTION URL CHECK
// ------------------------------------------------------------

function isAjioCampaignUrl(value) {
  const hostname = getHostname(value);

  const pathname = getPathname(value);

  if (hostname !== "ajio.com") {
    return false;
  }

  return pathname.startsWith("/s/");
}

// ------------------------------------------------------------
// AJIO PRODUCT URL CHECK
// ------------------------------------------------------------

function isAjioProductUrl(value) {
  const hostname = getHostname(value);

  const pathname = getPathname(value);

  return hostname === "ajio.com" && pathname.includes("/p/");
}

// ============================================================
// AJIO PRODUCT ID EXTRACTION
// ============================================================

function extractAjioProductId(url) {
  if (typeof url !== "string" || !url.trim()) {
    return null;
  }

  try {
    const match = String(url).match(/\/p\/([^/?#]+)/i);

    if (!match) {
      return null;
    }

    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// ============================================================
// AJIO EXACT PRODUCT-ID RESOLVER
//
// IMPORTANT:
//
// AJIO normal search() applies relevance filtering.
//
// For an exact AJIO product URL we already know the
// product ID, so we must search the raw API response
// and match the exact ID BEFORE relevance filtering.
// ============================================================

async function resolveAjioProductById(
  productUrl,
  productId,
  originalInput = productUrl,
) {
  if (!productId) {
    return null;
  }

  console.log("🎯 AJIO exact product ID lookup:", productId);

  try {
    if (typeof ajioSearchAdapter.fetchSearchApi !== "function") {
      console.log("⚠️ AJIO adapter has no fetchSearchApi()");

      return null;
    }

    if (typeof ajioSearchAdapter.extractApiProducts !== "function") {
      console.log("⚠️ AJIO adapter has no extractApiProducts()");

      return null;
    }

    // ----------------------------------------------------
    // BUILD SEARCH QUERY FROM PRODUCT URL
    // ----------------------------------------------------

    let query = "";

    try {
      const parsed = new URL(productUrl);

      query = decodeURIComponent(parsed.pathname)
        .split("/")
        .filter(Boolean)
        .filter((part) => part.toLowerCase() !== "p")
        .join(" ");
    } catch {
      query = "";
    }

    query = query
      .replace(/[-_]+/g, " ")
      .replace(/\b\d{6,}\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    console.log("🔎 AJIO exact-ID search query:", query);

    if (!query) {
      return null;
    }

    // ----------------------------------------------------
    // FETCH RAW AJIO API
    // ----------------------------------------------------

    const response = await ajioSearchAdapter.fetchSearchApi(query);

    if (!response) {
      console.log("⚠️ AJIO exact-ID API returned no response");

      return null;
    }

    const products = ajioSearchAdapter.extractApiProducts(response);

    console.log(
      `🔎 AJIO exact-ID lookup returned ${products.length} raw products`,
    );

    if (!products.length) {
      return null;
    }

    // ----------------------------------------------------
    // EXACT PRODUCT-ID MATCH
    // ----------------------------------------------------

    const normalizedId = String(productId).trim().toLowerCase();

    const exact = products.find((product) => {
      const candidateId = String(
        product?._ajioProductId || product?.productId || "",
      )
        .trim()
        .toLowerCase();

      if (candidateId && candidateId === normalizedId) {
        return true;
      }

      // Some AJIO responses expose ID in URL.

      const candidateUrl = String(product?.url || "").toLowerCase();

      return candidateUrl.includes(`/p/${normalizedId}`);
    });

    if (!exact) {
      console.log("⚠️ AJIO exact product ID not found in API results");

      return null;
    }

    console.log("✅ AJIO EXACT PRODUCT-ID MATCH FOUND");

    console.log("   Title:", exact.title);

    console.log(
      "   Product ID:",
      exact._ajioProductId || exact.productId || productId,
    );

    console.log("   Brand:", exact._ajioBrand || exact.brand || null);

    console.log("   Price:", exact.price);

    // ----------------------------------------------------
    // RETURN COMMON STOCKSENSE PRODUCT OBJECT
    // ----------------------------------------------------

    return {
      platform: "ajio",

      url: exact.url || productUrl,

      title: exact.title,

      currentPrice: Number(exact.price),

      image: exact.image || null,

      rating: exact.rating ?? null,

      reviewCount: exact.reviews ?? exact.reviewCount ?? null,

      availability: exact.availability ?? true,

      brand: exact._ajioBrand || exact.brand || null,

      productId: exact._ajioProductId || exact.productId || productId,

      inputType: "url",

      sourceInput: originalInput,

      sourceType: "ajio_onelink",

      resolvedFrom: productUrl,
    };
  } catch (error) {
    console.log("⚠️ AJIO exact-ID lookup failed:", error.message);

    return null;
  }
}

// ============================================================
// AJIO ONE-LINK RESOLVER
// ============================================================

async function resolveAjioOneLink(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("AJIO OneLink URL is required");
  }

  const originalUrl = value.trim();

  console.log("🔗 AJIO OneLink detected:", originalUrl);

  try {
    // ----------------------------------------------------
    // FOLLOW REDIRECTS
    // ----------------------------------------------------

    const response = await fetch(originalUrl, {
      method: "GET",

      redirect: "follow",

      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 " +
          "(KHTML, like Gecko) " +
          "Chrome/139.0.0.0 Safari/537.36",

        Accept: "text/html,application/xhtml+xml,application/json,*/*",
      },
    });

    const finalUrl = response.url || originalUrl;

    console.log("🔗 AJIO OneLink final URL:", finalUrl);

    // ----------------------------------------------------
    // VALID PRODUCT URL CHECK
    // ----------------------------------------------------

    const isValidAjioProductUrl = (candidate) => {
      if (typeof candidate !== "string") {
        return false;
      }

      try {
        const parsed = new URL(candidate);

        return (
          /(^|\.)ajio\.com$/i.test(parsed.hostname) &&
          /\/p\//i.test(parsed.pathname)
        );
      } catch {
        return false;
      }
    };

    // ----------------------------------------------------
    // REPEATED URL DECODING
    // ----------------------------------------------------

    const decodeRepeated = (valueToDecode) => {
      let current = String(valueToDecode || "");

      for (let i = 0; i < 3; i++) {
        let decoded;

        try {
          decoded = decodeURIComponent(current);
        } catch {
          break;
        }

        if (decoded === current) {
          break;
        }

        current = decoded;
      }

      return current;
    };

    // ----------------------------------------------------
    // COLLECT POSSIBLE URLS
    // ----------------------------------------------------

    const candidates = [];

    const addCandidate = (candidate) => {
      if (typeof candidate !== "string") {
        return;
      }

      const cleaned = candidate.trim();

      if (!cleaned) {
        return;
      }

      const decoded = decodeRepeated(cleaned);

      if (!candidates.includes(cleaned)) {
        candidates.push(cleaned);
      }

      if (decoded && !candidates.includes(decoded)) {
        candidates.push(decoded);
      }
    };

    // Final redirect URL

    addCandidate(finalUrl);

    // ----------------------------------------------------
    // QUERY PARAMETERS
    // ----------------------------------------------------

    const urlsToInspect = [originalUrl, finalUrl];

    for (const urlValue of urlsToInspect) {
      try {
        const parsed = new URL(urlValue);

        const parameterNames = [
          "deep_link_value",
          "deepLinkValue",
          "deep_link",
          "deepLink",
          "redirect",
          "redirect_url",
          "redirectUrl",
          "url",
          "link",
        ];

        for (const name of parameterNames) {
          const parameter = parsed.searchParams.get(name);

          if (parameter) {
            console.log(`🔗 AJIO OneLink ${name} found`);

            addCandidate(parameter);
          }
        }
      } catch {
        // Ignore malformed URL candidates.
      }
    }

    // ----------------------------------------------------
    // FIND ACTUAL AJIO PRODUCT URL
    // ----------------------------------------------------

    let productUrl = null;

    for (const candidate of candidates) {
      const decoded = decodeRepeated(candidate);

      if (isValidAjioProductUrl(decoded)) {
        productUrl = decoded;

        break;
      }
    }

    if (!productUrl) {
      throw new Error(
        "AJIO OneLink did not contain a supported AJIO product URL",
      );
    }

    console.log("✅ AJIO OneLink product URL:", productUrl);

    // ----------------------------------------------------
    // EXACT AJIO PRODUCT ID
    // ----------------------------------------------------

    const productId = extractAjioProductId(productUrl);

    console.log("🆔 AJIO OneLink product ID:", productId || "NOT FOUND");

    // ----------------------------------------------------
    // EXACT RAW-API LOOKUP
    // ----------------------------------------------------

    if (productId) {
      const exactProduct = await resolveAjioProductById(
        productUrl,
        productId,
        originalUrl,
      );

      if (exactProduct) {
        console.log("✅ AJIO OneLink resolved through exact product ID");

        return exactProduct;
      }
    }

    // ----------------------------------------------------
    // DIRECT SCRAPER FALLBACK
    // ----------------------------------------------------

    console.log("🔄 AJIO exact-ID lookup unavailable — using direct scraper");

    try {
      const resolved = await scrapeProduct(productUrl);

      if (resolved) {
        return {
          ...resolved,

          inputType: "url",

          sourceInput: originalUrl,

          sourceType: "ajio_onelink",

          resolvedFrom: productUrl,
        };
      }
    } catch (scrapeError) {
      console.log("⚠️ AJIO direct scraper failed:", scrapeError.message);
    }

    throw new Error("AJIO product could not be resolved");
  } catch (error) {
    console.error("❌ AJIO OneLink resolution failed:", error.message);

    throw new Error("Unable to resolve AJIO link. " + `(${error.message})`);
  }
}

// ------------------------------------------------------------
// MANUAL TEXT PRODUCT BUILDER
// ------------------------------------------------------------

function resolveTextProduct(input) {
  const title = input.trim();

  if (!title) {
    throw new Error("Manual product search cannot be empty");
  }

  console.log("⌨️ MANUAL PRODUCT SEARCH DETECTED");

  console.log("⌨️ Search text:", title);

  return {
    platform: "manual",

    url: null,

    title,

    currentPrice: null,

    image: null,

    rating: null,

    reviewCount: null,

    availability: null,

    inputType: "text",
  };
}

// ============================================================
// INPUT CLASSIFICATION
// ============================================================

function classifyInput(input) {
  if (typeof input !== "string") {
    throw new Error("Product input must be a string");
  }

  const value = input.trim();

  if (!value) {
    throw new Error("Product input cannot be empty");
  }

  // Marketplace product URL

  if (looksLikeMarketplaceProductUrl(value)) {
    return "url";
  }

  // Direct image URL

  if (looksLikeImageUrl(value)) {
    return "image";
  }

  // Other HTTP URL

  if (isHttpUrl(value)) {
    return "url";
  }

  // Manual text

  return "text";
}

// ============================================================
// AJIO COLLECTION / CAMPAIGN RESOLVER
// ============================================================

async function resolveAjioCampaignProduct(value) {
  console.log("🛍️ AJIO COLLECTION URL DETECTED");

  console.log("🛍️ Collection URL:", value);

  // --------------------------------------------------------
  // BUILD SEARCH QUERY FROM CAMPAIGN SLUG
  // --------------------------------------------------------

  let query = "";

  try {
    const parsed = new URL(value);

    const pathname = parsed.pathname;

    query = decodeURIComponent(pathname)
      .replace(/^\/s\//i, "")
      .replace(/-\d+$/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    query = query.replace(/underrs(\d+)/gi, "under rs $1");

    query = query.replace(/under\s*rs\s*(\d+)/gi, "under rs $1");

    query = query.replace(/min(\d+)percentoff/gi, "minimum $1 percent off");

    query = query.replace(/upto(\d+)percentoff/gi, "up to $1 percent off");

    query = query.replace(/([a-z])(\d+)/gi, "$1 $2");

    query = query.replace(/\s+/g, " ").trim();
  } catch (error) {
    throw new Error(
      `Unable to understand AJIO collection URL: ${error.message}`,
    );
  }

  if (!query) {
    throw new Error(
      "AJIO collection URL did not contain a usable search query",
    );
  }

  console.log("🔎 AJIO collection search query:", query);

  // --------------------------------------------------------
  // FETCH RAW AJIO CATALOG
  //
  // DO NOT use adapter.search().
  // Campaign queries are not product-name queries.
  // --------------------------------------------------------

  let products = [];

  try {
    if (typeof ajioSearchAdapter.fetchSearchApi !== "function") {
      throw new Error("AJIO adapter does not expose fetchSearchApi()");
    }

    if (typeof ajioSearchAdapter.extractApiProducts !== "function") {
      throw new Error("AJIO adapter does not expose extractApiProducts()");
    }

    console.log("⚡ AJIO collection: fetching raw catalog results");

    const apiResponse = await ajioSearchAdapter.fetchSearchApi(query);

    if (!apiResponse) {
      throw new Error("AJIO collection API returned no response");
    }

    products = ajioSearchAdapter.extractApiProducts(apiResponse);

    console.log(`🔎 AJIO collection raw products: ${products.length}`);
  } catch (error) {
    console.log("⚠️ AJIO collection API failed:", error.message);

    // Safe fallback to normal adapter search.

    if (typeof ajioSearchAdapter.search === "function") {
      try {
        products = await ajioSearchAdapter.search(query, {});
      } catch (fallbackError) {
        throw new Error(
          `AJIO collection search failed: ${fallbackError.message}`,
        );
      }
    }
  }

  // --------------------------------------------------------
  // VALIDATE RESULTS
  // --------------------------------------------------------

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error(`AJIO collection returned no products for "${query}"`);
  }

  console.log(`🔎 AJIO collection returned ${products.length} products`);

  // --------------------------------------------------------
  // FIND FIRST VALID PRODUCT
  // --------------------------------------------------------

  const validProduct = products.find((product) => {
    return (
      product &&
      product.title &&
      product.url &&
      Number.isFinite(Number(product.price))
    );
  });

  if (!validProduct) {
    throw new Error(
      "AJIO collection returned products, but none had a valid title, price and URL",
    );
  }

  console.log("✅ AJIO collection resolved to product:");

  console.log({
    title: validProduct.title,

    price: validProduct.price,

    brand: validProduct.brand || validProduct._ajioBrand || null,

    url: validProduct.url,
  });

  // --------------------------------------------------------
  // RETURN COMMON STOCKSENSE PRODUCT
  // --------------------------------------------------------

  return {
    platform: "Ajio",

    url: validProduct.url,

    title: validProduct.title,

    currentPrice: Number(validProduct.price),

    image: validProduct.image || null,

    rating: validProduct.rating ?? null,

    reviewCount: validProduct.reviews ?? validProduct.reviewCount ?? null,

    availability: validProduct.availability !== false,

    brand: validProduct.brand || validProduct._ajioBrand || null,

    productId: validProduct.productId || validProduct._ajioProductId || null,

    inputType: "url",

    sourceInput: value,

    sourceType: "ajio_collection",
  };
}

/* ============================================================
   AMAZON SPONSORED / TRACKING REDIRECT UNWRAPPER
   ============================================================

   Example:

   https://sponsored-ads.amazon.in/clk/?...&r=https%3A%2F%2Fwww.amazon.in%2Fgp%2Faw%2Fd%2FB07P2TQH78...

   becomes:

   https://www.amazon.in/gp/aw/d/B07P2TQH78...

   IMPORTANT:
   - Only unwraps Amazon sponsored redirect hosts.
   - Only accepts the decoded destination if it is Amazon.
   - Normal Amazon URLs are returned unchanged.
   ============================================================ */

/* ============================================================
   AMAZON SPONSORED / TRACKING REDIRECT UNWRAPPER
   ============================================================

   Supports:

   1. Amazon sponsored hosts:
      https://sponsored-ads.amazon.in/clk/?...

   2. Amazon SSPA click URLs:
      https://www.amazon.in/sspa/click/?...&url=...

   Example:

   https://www.amazon.in/sspa/click/?...&url=%2FVEGA...%2Fdp%2FB0H6XTK9B6...

   becomes:

   https://www.amazon.in/VEGA.../dp/B0H6XTK9B6...

   IMPORTANT:
   - Normal Amazon product URLs are returned unchanged.
   - Only Amazon destinations are accepted.
   - Relative Amazon destinations are supported.
   ============================================================ */

function unwrapAmazonSponsoredUrl(value) {
  const inputUrl = String(value || "").trim();

  if (!inputUrl) {
    return inputUrl;
  }

  let parsed;

  try {
    parsed = new URL(inputUrl);
  } catch {
    return inputUrl;
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

  const pathname = parsed.pathname.toLowerCase();

  // --------------------------------------------------------
  // AMAZON HOST CHECK
  // --------------------------------------------------------

  const amazonHosts = [
    "amazon.in",
    "amazon.com",
    "amazon.co.uk",
    "amazon.de",
    "amazon.fr",
    "amazon.it",
    "amazon.es",
    "amazon.ca",
    "amazon.com.au",
    "amazon.ae",
    "amazon.sa",
  ];

  const isAmazonHost = amazonHosts.includes(hostname);

  // --------------------------------------------------------
  // SPONSORED AMAZON HOST
  // --------------------------------------------------------

  const isAmazonSponsoredHost =
    hostname === "sponsored-ads.amazon.in" ||
    hostname === "sponsored-ads.amazon.com" ||
    hostname === "sponsored-ads.amazon.co.uk" ||
    hostname === "sponsored-ads.amazon.de" ||
    hostname === "sponsored-ads.amazon.fr" ||
    hostname === "sponsored-ads.amazon.it" ||
    hostname === "sponsored-ads.amazon.es" ||
    hostname === "sponsored-ads.amazon.ca";

  // --------------------------------------------------------
  // AMAZON SSPA CLICK URL
  // --------------------------------------------------------

  const isAmazonSspaClick =
    isAmazonHost &&
    (pathname === "/sspa/click" || pathname.startsWith("/sspa/click/"));

  // --------------------------------------------------------
  // NORMAL AMAZON URL
  //
  // Nothing to unwrap.
  // --------------------------------------------------------

  if (!isAmazonSponsoredHost && !isAmazonSspaClick) {
    return inputUrl;
  }

  // --------------------------------------------------------
  // POSSIBLE REDIRECT PARAMETERS
  // --------------------------------------------------------

  const redirectCandidates = [
    parsed.searchParams.get("url"),

    parsed.searchParams.get("r"),

    parsed.searchParams.get("redirect"),

    parsed.searchParams.get("redirect_url"),

    parsed.searchParams.get("redirectUrl"),

    parsed.searchParams.get("target"),

    parsed.searchParams.get("u"),

    parsed.searchParams.get("link"),
  ];

  // --------------------------------------------------------
  // FIND VALID AMAZON DESTINATION
  // --------------------------------------------------------

  for (const candidate of redirectCandidates) {
    if (!candidate) {
      continue;
    }

    let decodedUrl = candidate;

    // ----------------------------------------------------
    // Decode once or twice when necessary
    // ----------------------------------------------------

    for (let i = 0; i < 2; i++) {
      try {
        const decoded = decodeURIComponent(decodedUrl);

        if (decoded === decodedUrl) {
          break;
        }

        decodedUrl = decoded;
      } catch {
        break;
      }
    }

    // ----------------------------------------------------
    // Convert relative Amazon path to absolute URL
    // ----------------------------------------------------

    let destination;

    try {
      destination = new URL(decodedUrl, `${parsed.protocol}//${parsed.host}`);
    } catch {
      continue;
    }

    const destinationHost = destination.hostname
      .toLowerCase()
      .replace(/^www\./, "");

    const isAmazonDestination = amazonHosts.includes(destinationHost);

    if (isAmazonDestination) {
      console.log("🔓 Amazon tracking redirect unwrapped");

      console.log("🔗 Original:", inputUrl);

      console.log("🔗 Destination:", destination.href);

      return destination.href;
    }
  }

  console.log(
    "⚠️ Amazon tracking URL detected, but no valid Amazon destination was found",
  );

  return inputUrl;
}
// ============================================================
// MAIN INPUT RESOLVER
// ============================================================

async function resolveProductInput(input) {
  const inputType = classifyInput(input);

  console.log("🔎 INPUT RESOLVER TYPE:", inputType);

  // --------------------------------------------------------
  // IMAGE INPUT
  // --------------------------------------------------------

  if (inputType === "image") {
    console.log("🖼️ Image input detected");

    console.log("🖼️ Sending image to product vision resolver...");

    const resolved = await resolveImageProduct(input);

    return {
      ...resolved,

      inputType: "image",
    };
  }

  // --------------------------------------------------------
  // URL INPUT
  // --------------------------------------------------------

  if (inputType === "url") {
    let resolvedUrl = input.trim();

    resolvedUrl = unwrapAmazonSponsoredUrl(resolvedUrl);

    // ----------------------------------------------------
    // AJIO ONELINK
    // ----------------------------------------------------

    if (isAjioOneLink(resolvedUrl)) {
      console.log("🔗 AJIO OneLink detected");

      // IMPORTANT:
      // resolveAjioOneLink() returns the COMPLETE
      // product object, not a URL.

      const resolved = await resolveAjioOneLink(resolvedUrl);

      return resolved;
    }

    // ----------------------------------------------------
    // AJIO CAMPAIGN / COLLECTION
    // ----------------------------------------------------

    if (isAjioCampaignUrl(resolvedUrl)) {
      console.log("🛍️ AJIO campaign/collection URL detected:", resolvedUrl);

      return await resolveAjioCampaignProduct(resolvedUrl);
    }

    function getGenericConceptMatch(queryTokens, candidateTitle) {
      const querySet = new Set(queryTokens);

      const candidateText = String(candidateTitle || "");

      for (const concept of GENERIC_PRODUCT_CONCEPTS) {
        const queryMatchesConcept = [...concept.queryTokens].every((token) =>
          querySet.has(token),
        );

        if (!queryMatchesConcept) {
          continue;
        }

        const candidateMatchesConcept = concept.candidatePatterns.some(
          (pattern) => pattern.test(candidateText),
        );

        if (candidateMatchesConcept) {
          return {
            matched: true,
            concept: concept.name,
            impliedTokens: ["water", "heater"],
          };
        }
      }

      return {
        matched: false,
        concept: null,
        impliedTokens: [],
      };
    }

    // ----------------------------------------------------
    // AJIO GENERIC URL SAFETY CHECK
    // ----------------------------------------------------

    if (
      getHostname(resolvedUrl) === "ajio.com" &&
      !isAjioProductUrl(resolvedUrl)
    ) {
      console.log("⚠️ Unsupported AJIO URL:", resolvedUrl);

      throw new Error(
        "Unsupported AJIO URL. Please provide an individual AJIO product URL containing /p/.",
      );
    }

    // ----------------------------------------------------
    // NORMAL PRODUCT URL
    // ----------------------------------------------------

    console.log("🔗 Product URL detected");

    console.log("🔗 Using existing marketplace scraper...");

    console.log("🔗 Resolved URL:", resolvedUrl);

    const resolved = await scrapeProduct(resolvedUrl);

    if (!resolved) {
      throw new Error("Product could not be scraped");
    }

    return {
      ...resolved,

      inputType: "url",
    };
  }

  // --------------------------------------------------------
  // MANUAL TEXT INPUT
  // --------------------------------------------------------

  if (inputType === "text") {
    return resolveTextProduct(input);
  }

  // --------------------------------------------------------
  // SAFETY FALLBACK
  // --------------------------------------------------------

  throw new Error(`Unsupported product input type: ${inputType}`);
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  isHttpUrl,

  looksLikeImageUrl,

  looksLikeMarketplaceProductUrl,

  classifyInput,

  isAjioOneLink,

  isAjioCampaignUrl,

  isAjioProductUrl,

  resolveAjioOneLink,

  resolveProductInput,
};
