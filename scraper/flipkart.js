// ============================================================
// STOCKSENSE - FLIPKART PRODUCT SCRAPER
// ============================================================
//
// Purpose:
//   Scrape one specific Flipkart product URL.
//
// Extracts:
//   - Product title
//   - Price
//   - Main image
//   - Rating
//   - Review count
//   - Availability
//
// This file is for DIRECT PRODUCT URL scraping.
//
// Search scraping remains inside:
//   services/search/platforms/flipkart.js
//
// ============================================================

const { getPage, closePage } = require("../utils/browserPool");

const flipkartSearchAdapter = require("../services/search/platforms/flipkart");

// ============================================================
// HELPERS
// ============================================================

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrice(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = cleanText(value).replace(/,/g, "");

  const match = text.match(/₹?\s*(\d+(?:\.\d+)?)/);

  if (!match) {
    return null;
  }

  const price = Number(match[1]);

  return Number.isFinite(price) ? price : null;
}

function parseRating(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = cleanText(value);

  const match = text.match(/(?:^|\s)([0-5](?:\.\d+)?)\s*(?:★|out of 5)?/);

  if (!match) {
    return null;
  }

  const rating = Number(match[1]);

  if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
    return null;
  }

  return rating;
}

function parseReviewCount(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = cleanText(value).replace(/,/g, "");

  const match = text.match(/(\d+)\s*(?:ratings?|reviews?)/i);

  if (!match) {
    return null;
  }

  const count = Number(match[1]);

  return Number.isFinite(count) ? count : null;
}

function normalizeImageUrl(value) {
  if (!value) {
    return null;
  }

  const image = String(value).trim();

  if (!image) {
    return null;
  }

  if (image.startsWith("//")) {
    return `https:${image}`;
  }

  return image;
}

// ============================================================
// FLIPKART ERROR PAGE DETECTION
// ============================================================

const INVALID_PAGE_PATTERNS = Object.freeze([
  "500 internal server error",
  "502 bad gateway",
  "503 service unavailable",
  "504 gateway timeout",
  "internal server error",
  "access denied",
  "something went wrong",
  "page not found",
  "error occurred",
]);

function isInvalidPageTitle(title) {
  const normalized = cleanText(title).toLowerCase();

  if (!normalized) {
    return true;
  }

  return INVALID_PAGE_PATTERNS.some((pattern) => normalized.includes(pattern));
}

// ============================================================
// JSON-LD EXTRACTION
// ============================================================

async function extractJsonLdProduct(page) {
  try {
    return await page.evaluate(() => {
      const scripts = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]'),
      );

      for (const script of scripts) {
        const raw = script.textContent?.trim();

        if (!raw) {
          continue;
        }

        let parsed;

        try {
          parsed = JSON.parse(raw);
        } catch {
          continue;
        }

        const objects = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of objects) {
          if (!item || typeof item !== "object") {
            continue;
          }

          if (item["@type"] === "Product") {
            return item;
          }

          if (Array.isArray(item["@graph"])) {
            const product = item["@graph"].find(
              (entry) => entry && entry["@type"] === "Product",
            );

            if (product) {
              return product;
            }
          }
        }
      }

      return null;
    });
  } catch {
    return null;
  }
}

// ============================================================
// DOM EXTRACTION
// ============================================================

async function extractDomData(page) {
  return await page.evaluate(() => {
    function clean(value) {
      return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function firstText(selectors) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);

        if (!element) {
          continue;
        }

        const text = clean(element.textContent);

        if (text) {
          return text;
        }
      }

      return null;
    }

    function firstAttribute(selectors, attribute) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);

        if (!element) {
          continue;
        }

        const value = element.getAttribute(attribute);

        if (value) {
          return value;
        }
      }

      return null;
    }

    // ----------------------------------------------------
    // TITLE
    // ----------------------------------------------------

    const title = firstText([
      "h1",
      "h1 span",
      "[class*='B_NuCI']",
      "[class*='VU-ZEz']",
    ]);

    // ----------------------------------------------------
    // PRICE
    // ----------------------------------------------------

    const price = firstText([
      "[class*='Nx9bqj']",
      "[class*='_30jeq3']",
      "[class*='dyC4hf']",
      "div[class*='price']",
    ]);

    // ----------------------------------------------------
    // IMAGE
    // ----------------------------------------------------

    let image = firstAttribute(
      ["meta[property='og:image']", "meta[name='twitter:image']"],
      "content",
    );

    if (!image) {
      image = firstAttribute(
        ["img[alt*='product' i]", "img[src*='rukminim']", "img"],
        "src",
      );
    }

    // ----------------------------------------------------
    // RATING
    // ----------------------------------------------------

    const rating = firstText([
      "[class*='XQDdHH']",
      "[class*='_3LWZlK']",
      "[class*='rating']",
    ]);

    // ----------------------------------------------------
    // REVIEWS / RATINGS
    // ----------------------------------------------------

    const reviewText = firstText([
      "[class*='Wphh3N']",
      "[class*='_2_R_DZ']",
      "[class*='ratings']",
    ]);

    // ----------------------------------------------------
    // AVAILABILITY
    // ----------------------------------------------------

    const availability = firstText([
      "#availability",
      "[class*='availability']",
      "[class*='stock']",
      "[class*='outOfStock']",
    ]);

    // ----------------------------------------------------
    // META PRICE FALLBACK
    // ----------------------------------------------------

    const metaPrice = firstAttribute(
      ["meta[property='product:price:amount']", "meta[itemprop='price']"],
      "content",
    );

    // ----------------------------------------------------
    // COMPLETE BODY TEXT
    //
    // This is important because Flipkart frequently does
    // not expose stock status through one stable selector.
    // ----------------------------------------------------

    const bodyText = clean(document.body?.innerText || "");

    return {
      title,
      price,
      metaPrice,
      image,
      rating,
      reviewText,
      availability,
      bodyText,
    };
  });
}

function normalizeFlipkartRedirectUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return url;
  }

  let value = url.trim();

  try {
    const parsed = new URL(value);

    // --------------------------------------------------------
    // FLIPKART SMART-LINK / SHARE-LINK REDIRECT
    //
    // Example:
    //
    // https://dl.flipkart.com/dlhttp://m.flipkart.com/...
    //
    // becomes:
    //
    // http://m.flipkart.com/...
    // --------------------------------------------------------

    if (
      parsed.hostname === "dl.flipkart.com" &&
      parsed.pathname.startsWith("/dl")
    ) {
      const embeddedUrl = parsed.pathname.slice(3);

      if (/^https?:\/\//i.test(embeddedUrl)) {
        value = embeddedUrl;
      }
    }

    // --------------------------------------------------------
    // Normalize mobile Flipkart host
    // --------------------------------------------------------

    const normalized = new URL(value);

    normalized.protocol = "https:";

    if (normalized.hostname === "m.flipkart.com") {
      normalized.hostname = "www.flipkart.com";
    }

    return normalized.toString();
  } catch {
    return value;
  }
}

// ============================================================
// FLIPKART URL HELPERS
// ============================================================

function extractFlipkartProductId(url) {
  try {
    const normalizedUrl = normalizeFlipkartRedirectUrl(url);

    const parsed = new URL(normalizedUrl);

    // --------------------------------------------------------
    // FIRST: ?pid=
    // --------------------------------------------------------

    const queryPid = parsed.searchParams.get("pid");

    if (queryPid) {
      return queryPid.trim();
    }

    // --------------------------------------------------------
    // SECOND: /p/PRODUCT_ID
    // --------------------------------------------------------

    const parts = parsed.pathname.split("/").filter(Boolean);

    const pIndex = parts.findIndex((part) => part.toLowerCase() === "p");

    if (pIndex !== -1 && parts[pIndex + 1]) {
      return parts[pIndex + 1].trim();
    }

    return null;
  } catch {
    return null;
  }
}

function buildQueryFromFlipkartUrl(url) {
  try {
    const normalizedUrl = normalizeFlipkartRedirectUrl(url);

    const parsed = new URL(normalizedUrl);

    const segments = parsed.pathname.split("/").filter(Boolean);

    const productPageIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === "p",
    );

    let slug = "";

    // --------------------------------------------------------
    // NORMAL PRODUCT URL
    // --------------------------------------------------------

    if (productPageIndex > 0) {
      slug = segments[productPageIndex - 1];
    }

    // --------------------------------------------------------
    // SAFE FALLBACK
    // --------------------------------------------------------

    if (!slug) {
      slug = segments
        .filter((segment) => segment.toLowerCase() !== "p")
        .join(" ");
    }

    slug = decodeURIComponent(slug)
      .replace(/\.\.\./g, " ")
      .replace(/original-im[a-z0-9]+/gi, " ")
      .replace(/itm[a-z0-9]+/gi, " ")
      .replace(/[-_]+/g, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();

    return slug;
  } catch {
    return "";
  }
}

function normalizeSearchTokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\.\.\./g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function calculateFallbackSimilarity(queryTokens, title) {
  if (!Array.isArray(queryTokens) || queryTokens.length === 0) {
    return 0;
  }

  const titleTokens = normalizeSearchTokens(title);

  const titleSet = new Set(titleTokens);

  let matches = 0;

  for (const token of queryTokens) {
    if (titleSet.has(token)) {
      matches++;
    }
  }

  return matches / queryTokens.length;
}

function extractImportantQueryTokens(query) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "pack",
    "piece",
    "pieces",
    "new",
    "latest",
    "best",
    "original",
  ]);

  return normalizeSearchTokens(query).filter(
    (token) => token.length >= 2 && !stopWords.has(token),
  );
}

// ============================================================
// SEARCH FALLBACK
// ============================================================

async function searchFallback(originalUrl) {
  console.log("🔄 Flipkart: Starting search fallback...");

  const query = buildQueryFromFlipkartUrl(originalUrl);

  if (!query) {
    throw new Error("Unable to build Flipkart fallback search query");
  }

  if (query.includes("...")) {
    throw new Error("Flipkart URL appears truncated; exact fallback is unsafe");
  }

  console.log("🔎 Flipkart fallback query:", query);

  const results = await flipkartSearchAdapter.search(query, {});

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("Flipkart fallback search returned no products");
  }

  // --------------------------------------------------------
  // 1. EXACT PRODUCT ID MATCH
  // --------------------------------------------------------

  const productId = extractFlipkartProductId(originalUrl);

  console.log("🔑 Flipkart fallback product ID:", productId || "NOT FOUND");

  if (productId) {
    const normalizedProductId = productId.toLowerCase().trim();

    const exact = results.find((product) => {
      const productUrl = String(
        product?.url || product?.productUrl || "",
      ).toLowerCase();

      return productUrl.includes(normalizedProductId);
    });

    if (exact) {
      console.log("✅ Flipkart fallback: Exact PID match found");

      return exact;
    }
  }

  // --------------------------------------------------------
  // 2. TITLE SIMILARITY MATCH
  // --------------------------------------------------------

  const queryTokens = extractImportantQueryTokens(query);

  if (queryTokens.length === 0) {
    throw new Error(
      "Flipkart fallback query contains no useful product tokens",
    );
  }

  let bestProduct = null;

  let bestScore = 0;

  for (const product of results) {
    const title = cleanText(product?.title || product?.productName);

    if (!title) {
      continue;
    }

    const score = calculateFallbackSimilarity(queryTokens, title);

    console.log(`🔎 Fallback candidate: ${title} → ${score.toFixed(2)}`);

    if (score > bestScore) {
      bestScore = score;

      bestProduct = product;
    }
  }

  // --------------------------------------------------------
  // 3. STRICT ACCEPTANCE
  // --------------------------------------------------------

  if (!bestProduct || bestScore < 0.45) {
    throw new Error(
      `Flipkart fallback could not verify a matching product (best similarity: ${bestScore.toFixed(
        2,
      )})`,
    );
  }

  console.log(
    `✅ Flipkart fallback selected verified candidate (${bestScore.toFixed(
      2,
    )})`,
  );

  return bestProduct;
}

// ============================================================
// MAIN SCRAPER
// ============================================================

async function scrape(url) {
  const started = Date.now();

  if (typeof url !== "string" || !url.trim()) {
    throw new Error("Flipkart product URL is required");
  }

  const cleanInputUrl = url.trim();

  console.log("Flipkart scraper: Starting", cleanInputUrl);

  const page = await getPage();

  try {
    // ----------------------------------------------------
    // LIGHT RESOURCE OPTIMIZATION
    // ----------------------------------------------------

    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();

      if (resourceType === "font" || resourceType === "media") {
        return route.abort();
      }

      return route.continue();
    });

    // ----------------------------------------------------
    // NAVIGATION
    // ----------------------------------------------------

    await page
      .goto(cleanInputUrl, {
        waitUntil: "domcontentloaded",

        timeout: 20000,
      })
      .catch((error) => {
        console.log("Flipkart navigation warning:", error.message);
      });

    // ----------------------------------------------------
    // LIGHT CONTENT CHECK
    // ----------------------------------------------------
    //
    // Do not wait 8 seconds for h1 on every product page.
    // JSON-LD and DOM extraction can often succeed immediately.
    //

    console.log("Flipkart current URL:", page.url());

    const browserPageTitle = await page.title().catch(() => "");

    // ----------------------------------------------------
    // FIRST EXTRACTION ATTEMPT
    // ----------------------------------------------------

    let jsonLd = await extractJsonLdProduct(page);

    let dom = await extractDomData(page);

    let earlyTitle = cleanText(jsonLd?.name || dom?.title || "");

    // ----------------------------------------------------
    // WAIT ONLY WHEN PRODUCT CONTENT IS NOT READY
    // ----------------------------------------------------

    if (!earlyTitle) {
      await page
        .waitForSelector("h1", {
          state: "attached",
          timeout: 2500,
        })
        .catch(() => {});

      // Very small stabilization delay only for slow pages.
      await page.waitForTimeout(250).catch(() => {});

      jsonLd = await extractJsonLdProduct(page);

      dom = await extractDomData(page);
    }

    // ----------------------------------------------------
    // TITLE
    // ----------------------------------------------------

    const title = cleanText(jsonLd?.name || dom?.title || "");

    // ----------------------------------------------------
    // DETECT INVALID PAGE
    // ----------------------------------------------------

    const invalidDirectPage =
      isInvalidPageTitle(title) || isInvalidPageTitle(browserPageTitle);

    if (invalidDirectPage) {
      console.log("⚠️ Flipkart direct page did not return a valid product.");

      const fallback = await searchFallback(redirectedUrl || cleanInputUrl);

      const fallbackTitle = cleanText(fallback?.title || fallback?.productName);

      if (!fallbackTitle) {
        throw new Error("Flipkart fallback product title unavailable");
      }

      const fallbackPrice = parsePrice(
        fallback?.price ?? fallback?.currentPrice,
      );

      const fallbackImage = normalizeImageUrl(fallback?.image);

      const fallbackRating = parseRating(fallback?.rating);

      const fallbackReviews = parseReviewCount(
        fallback?.reviews ?? fallback?.reviewCount,
      );

      console.log("✅ Flipkart fallback product verified:", {
        title: fallbackTitle,

        price: fallbackPrice,

        image: fallbackImage,

        availability: fallback?.availability ?? null,
      });

      return {
        platform: "Flipkart",

        url: cleanInputUrl,

        title: fallbackTitle,

        currentPrice: fallbackPrice,

        image: fallbackImage,

        rating: fallbackRating,

        reviewCount: fallbackReviews,

        // IMPORTANT:
        // ?? preserves false.
        availability: fallback?.availability ?? null,

        inputType: "url",
      };
    }

    // ----------------------------------------------------
    // PRICE
    // ----------------------------------------------------

    let currentPrice = null;

    const offers = Array.isArray(jsonLd?.offers)
      ? jsonLd.offers[0]
      : jsonLd?.offers;

    if (offers) {
      currentPrice = parsePrice(offers?.price);
    }

    if (currentPrice === null) {
      currentPrice = parsePrice(dom?.price);
    }

    if (currentPrice === null) {
      currentPrice = parsePrice(dom?.metaPrice);
    }

    // ----------------------------------------------------
    // IMAGE
    // ----------------------------------------------------

    let image = null;

    if (typeof jsonLd?.image === "string") {
      image = jsonLd.image;
    } else if (Array.isArray(jsonLd?.image)) {
      image = jsonLd.image[0] || null;
    }

    if (!image) {
      image = dom?.image;
    }

    image = normalizeImageUrl(image);

    // ----------------------------------------------------
    // RATING
    // ----------------------------------------------------

    let rating = null;

    const aggregateRating = jsonLd?.aggregateRating;

    if (aggregateRating) {
      rating = parseRating(aggregateRating.ratingValue);
    }

    if (rating === null) {
      rating = parseRating(dom?.rating);
    }

    // ----------------------------------------------------
    // REVIEW COUNT
    // ----------------------------------------------------

    let reviewCount = null;

    if (aggregateRating) {
      reviewCount = Number(
        String(
          aggregateRating.reviewCount || aggregateRating.ratingCount || "",
        ).replace(/,/g, ""),
      );

      if (!Number.isFinite(reviewCount)) {
        reviewCount = null;
      }
    }

    if (reviewCount === null) {
      reviewCount = parseReviewCount(dom?.reviewText);
    }

    // ====================================================
    // AVAILABILITY
    // ====================================================
    //
    // IMPORTANT:
    //
    // Flipkart pages can contain:
    //   - JSON-LD stock state for the actual product
    //   - product-page action text such as Add to Cart / Buy Now
    //   - generic "Out of stock" text for another size/variant
    //
    // Therefore:
    //   1. Structured product availability has highest priority.
    //   2. Positive product actions can confirm availability.
    //   3. DOM-specific OOS comes next.
    //   4. Body-wide OOS is only used when stronger evidence
    //      is unavailable.
    //
    // NEVER let a generic body-level "Out of stock" message
    // override JSON-LD InStock or an active purchase action.
    // ====================================================

    const jsonLdOffers = Array.isArray(jsonLd?.offers)
      ? jsonLd.offers[0]
      : jsonLd?.offers;

    const jsonLdAvailability = cleanText(
      jsonLdOffers?.availability || jsonLd?.availability || "",
    ).toLowerCase();

    const domAvailability = cleanText(dom?.availability || "").toLowerCase();

    const bodyText = cleanText(dom?.bodyText || "").toLowerCase();

    console.log("📦 FLIPKART AVAILABILITY SIGNALS:", {
      jsonLd: jsonLdAvailability,
      dom: domAvailability,
      bodyTextPreview: bodyText.slice(0, 1200),
    });

    // ----------------------------------------------------
    // STRUCTURED PRODUCT-LEVEL SIGNALS
    // ----------------------------------------------------

    const structuredOutOfStock =
      /schema\.org\/outofstock/i.test(jsonLdAvailability) ||
      /\bout[\s-]*of[\s-]*stock\b/i.test(jsonLdAvailability) ||
      /\bcurrently[\s-]*unavailable\b/i.test(jsonLdAvailability) ||
      /\bsold[\s-]*out\b/i.test(jsonLdAvailability);

    const structuredInStock =
      /schema\.org\/instock/i.test(jsonLdAvailability) ||
      /\binstock\b/i.test(jsonLdAvailability) ||
      /\bin[\s-]*stock\b/i.test(jsonLdAvailability);

    // ----------------------------------------------------
    // POSITIVE PURCHASE / DELIVERY SIGNALS
    //
    // These come from the actual loaded product page body.
    // They are stronger than a generic OOS message because
    // they indicate the page is offering the product.
    // ----------------------------------------------------

    const positiveActionDetected =
      /\badd[\s-]*to[\s-]*cart\b/i.test(bodyText) ||
      /\bbuy[\s-]*now\b/i.test(bodyText) ||
      /\bbuy[\s-]*at\b/i.test(bodyText) ||
      /\bplace[\s-]*order\b/i.test(bodyText) ||
      /\bdelivery\s+in\b/i.test(bodyText) ||
      /\bdelivery\s+by\b/i.test(bodyText) ||
      /\bonly\s+\d+\s+left\b/i.test(bodyText) ||
      /\bonly\s+few\s+left\b/i.test(bodyText);

    // ----------------------------------------------------
    // DOM-SPECIFIC NEGATIVE SIGNAL
    // ----------------------------------------------------

    const domOutOfStock =
      /\bout[\s-]*of[\s-]*stock\b/i.test(domAvailability) ||
      /\bcurrently[\s-]*unavailable\b/i.test(domAvailability) ||
      /\bsold[\s-]*out\b/i.test(domAvailability);

    // ----------------------------------------------------
    // BODY-LEVEL NEGATIVE SIGNAL
    //
    // This is deliberately the weakest signal.
    // It may refer to another size / variant.
    // ----------------------------------------------------

    const bodyOutOfStock =
      /\bout[\s-]*of[\s-]*stock\b/i.test(bodyText) ||
      /\bcurrently[\s-]*unavailable\b/i.test(bodyText) ||
      /\bsold[\s-]*out\b/i.test(bodyText) ||
      /\bnotify[\s-]*me\b/i.test(bodyText);

    // ----------------------------------------------------
    // FINAL STATE
    // ----------------------------------------------------

    let availability = null;

    // 1. Explicit structured product-level OOS.
    if (structuredOutOfStock) {
      availability = false;
    }

    // 2. Explicit structured product-level InStock.
    else if (structuredInStock) {
      availability = true;
    }

    // 3. Active product purchase/delivery signals.
    else if (positiveActionDetected) {
      availability = true;
    }

    // 4. DOM-specific OOS.
    else if (domOutOfStock) {
      availability = false;
    }

    // 5. Only now trust generic body-level OOS.
    else if (bodyOutOfStock) {
      availability = false;
    }

    console.log(
      "📦 FLIPKART FINAL AVAILABILITY:",
      availability === false
        ? "OUT_OF_STOCK"
        : availability === true
          ? "IN_STOCK"
          : "UNKNOWN",
    );

    // ----------------------------------------------------
    // FINAL VALIDATION
    // ----------------------------------------------------

    if (!title) {
      throw new Error("Flipkart product title unavailable");
    }

    if (isInvalidPageTitle(title)) {
      throw new Error("Flipkart product page returned an invalid/error page");
    }

    // ----------------------------------------------------
    // FINAL RESULT
    // ----------------------------------------------------

    const redirectedUrl = page.url() || cleanInputUrl;

    const result = {
      platform: "Flipkart",

      url: normalizeFlipkartRedirectUrl(redirectedUrl || cleanInputUrl),

      title,

      currentPrice,

      image,

      rating,

      reviewCount,

      // IMPORTANT:
      // DO NOT use:
      //
      // availability || "Unknown"
      //
      // because false would become "Unknown".
      //
      availability: availability ?? null,

      inputType: "url",
    };

    console.log("Flipkart scraper: Completed");

    console.log("Flipkart scraper result:", {
      title: result.title,

      price: result.currentPrice,

      rating: result.rating,

      reviewCount: result.reviewCount,

      availability: result.availability,

      image: result.image,
    });

    console.log(`⏱ Flipkart scraper total: ${Date.now() - started} ms`);

    return result;
  } catch (error) {
    console.error("Flipkart scraper failed:", error.message);

    throw error;
  } finally {
    await closePage(page);
  }
}

// ============================================================
// EXPORT
// ============================================================

module.exports = {
  scrape,
};
