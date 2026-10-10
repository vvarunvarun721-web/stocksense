// ============================================================
// STOCKSENSE — SHARED MARKETPLACE DIRECT SCRAPER
// ============================================================
// Used by:
//   AJIO
//   Meesho
//   Myntra
//   Nykaa
//   Reliance Digital
//   TataCliq
//
// Responsibilities:
//   1. Open direct product URL
//   2. Extract title
//   3. Extract price
//   4. Extract image
//   5. Extract rating
//   6. Extract review count
//   7. Detect availability
//   8. Read JSON-LD product data
//   9. Fall back to marketplace search adapter
// ============================================================

const { getPage, closePage } = require("../utils/browserPool");

// ============================================================
// TEXT HELPERS
// ============================================================

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = cleanText(value);

    if (text) {
      return text;
    }
  }

  return null;
}

// ============================================================
// PRICE PARSER
// ============================================================

function parsePrice(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  const text = String(value).replace(/\u00a0/g, " ");

  const matches = text.match(/(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d+)?)/gi);

  if (!matches) {
    return null;
  }

  for (const match of matches) {
    const number = Number(match.replace(/[^\d.]/g, ""));

    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }

  return null;
}

// ============================================================
// RATING PARSER
// ============================================================

function parseRating(value) {
  if (value == null) {
    return null;
  }

  const match = String(value).match(
    /(?:^|\s)([0-5](?:\.\d+)?)(?:\s*(?:\/\s*5|out of 5))?/i,
  );

  if (!match) {
    return null;
  }

  const number = Number(match[1]);

  return Number.isFinite(number) && number >= 0 && number <= 5 ? number : null;
}

// ============================================================
// REVIEW COUNT PARSER
// ============================================================

function parseReviewCount(value) {
  if (value == null) {
    return null;
  }

  const text = String(value).replace(/,/g, "");

  const match = text.match(/(\d+(?:\.\d+)?)\s*(k|m)?/i);

  if (!match) {
    return null;
  }

  let number = Number(match[1]);

  if (!Number.isFinite(number)) {
    return null;
  }

  const suffix = String(match[2] || "").toLowerCase();

  if (suffix === "k") {
    number *= 1000;
  }

  if (suffix === "m") {
    number *= 1000000;
  }

  return Math.round(number);
}

// ============================================================
// URL NORMALIZATION
// ============================================================

function normalizeUrl(value, host) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    const parsed = new URL(value.trim(), host);

    parsed.hash = "";

    return parsed.toString();
  } catch {
    return null;
  }
}

function isUsableTataCliqImage(value) {
  if (!value || typeof value !== "string") {
    return false;
  }

  const image = value.trim().toLowerCase();

  if (!image) {
    return false;
  }

  const invalidPatterns = [
    "icon-512x512",
    "icon_512x512",
    "favicon",

    "logo",

    "placeholder",
    "place-holder",

    "default-image",
    "default_image",
    "defaultimage",

    "no-image",
    "no_image",
    "noimage",

    "transparent.gif",
    "transparent.png",

    "1x1",

    "loader.gif",
    "loading.gif",
    "spinner",

    "fallback-image",
    "fallback_image",
  ];

  if (invalidPatterns.some((pattern) => image.includes(pattern))) {
    return false;
  }

  if (image.startsWith("data:") || image.startsWith("blob:")) {
    return false;
  }

  return true;
}

// ============================================================
// IMAGE NORMALIZATION
// ============================================================

function normalizeImage(value, host) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const clean = value.trim();

  if (!clean) {
    return null;
  }

  try {
    return new URL(clean, host).toString();
  } catch {
    return clean;
  }
}

// ============================================================
// JSON-LD PARSER
// ============================================================

function parseJsonLd(rawScripts) {
  const products = [];

  for (const raw of rawScripts || []) {
    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);

      const walk = (node) => {
        if (!node) {
          return;
        }

        if (Array.isArray(node)) {
          node.forEach(walk);

          return;
        }

        if (typeof node !== "object") {
          return;
        }

        const type = node["@type"];

        const isProduct =
          type === "Product" ||
          (Array.isArray(type) && type.includes("Product"));

        if (isProduct) {
          products.push(node);
        }

        if (node["@graph"]) {
          walk(node["@graph"]);
        }
      };

      walk(parsed);
    } catch {
      // Some marketplaces return malformed JSON-LD.
      // Ignore those blocks safely.
    }
  }

  return products;
}

// ============================================================
// BEST JSON-LD PRODUCT
// ============================================================

function jsonLdBest(products) {
  if (!products.length) {
    return {};
  }

  const product = products[0] || {};

  const offers = Array.isArray(product.offers)
    ? product.offers[0]
    : product.offers;

  const image = Array.isArray(product.image) ? product.image[0] : product.image;

  const aggregate = product.aggregateRating || {};

  return {
    title: product.name,

    price:
      offers?.price ?? offers?.lowPrice ?? offers?.priceSpecification?.price,

    image,

    rating: aggregate.ratingValue,

    reviews: aggregate.reviewCount ?? aggregate.ratingCount,

    availability: offers?.availability,
  };
}

// ============================================================
// BUILD SEARCH QUERY FROM PRODUCT URL
// ============================================================

function buildSlugQuery(url, config) {
  try {
    const parsed = new URL(url);

    let value = decodeURIComponent(parsed.pathname);

    if (config.stripPathRegex) {
      value = value.replace(config.stripPathRegex, "");
    }

    value = value
      .replace(/\.(html?|aspx)$/i, "")
      .replace(/\/(?:buy|p|product)\/?$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/[\/]+/g, " ")
      .replace(/\b(?:share|click|redirect|original|copy)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (config.cleanQuery) {
      value = config.cleanQuery(value);
    }

    return value.slice(0, 180);
  } catch {
    return "";
  }
}

// ============================================================
// PRODUCT TITLE VALIDATION
// ============================================================

function validateTitle(title, url) {
  const text = cleanText(title);

  if (!text || text.length < 3) {
    return false;
  }

  const badTitle =
    /page not found|access denied|forbidden|robot check|captcha|something went wrong|error occurred/i;

  if (badTitle.test(text)) {
    return false;
  }

  return true;
}

// ============================================================
// PAGE EXTRACTION
// ============================================================

async function extractPage(page, config) {
  return page.evaluate(
    ({ selectors }) => {
      const clean = (value) =>
        String(value ?? "")
          .replace(/\s+/g, " ")
          .trim();

      const firstText = (list) => {
        for (const selector of list || []) {
          try {
            const element = document.querySelector(selector);

            const text = clean(
              element?.textContent || element?.getAttribute?.("content") || "",
            );

            if (text) {
              return text;
            }
          } catch {
            // Ignore selector errors.
          }
        }

        return null;
      };

      const firstAttr = (list, attribute) => {
        for (const selector of list || []) {
          try {
            const element = document.querySelector(selector);

            const value = clean(element?.getAttribute?.(attribute) || "");

            if (value) {
              return value;
            }
          } catch {
            // Ignore selector errors.
          }
        }

        return null;
      };

      const scripts = [
        ...document.querySelectorAll('script[type="application/ld+json"]'),
      ]
        .map((script) => script.textContent || "")
        .filter(Boolean);

      const meta = (name) => {
        const element =
          document.querySelector(`meta[property="${name}"]`) ||
          document.querySelector(`meta[name="${name}"]`);

        return clean(element?.getAttribute("content") || "") || null;
      };

      const bodyText = clean(document.body?.innerText || "");

      const title =
        firstText(selectors.title) || meta("og:title") || clean(document.title);

      const price =
        firstText(selectors.price) ||
        firstAttr(selectors.priceAttr, "content") ||
        meta("product:price:amount") ||
        meta("og:price:amount");

      const image =
        firstAttr(selectors.imageAttr, "content") ||
        meta("og:image") ||
        meta("twitter:image") ||
        firstAttr(selectors.image, "src") ||
        firstAttr(selectors.image, "data-src") ||
        firstAttr(selectors.image, "srcset");

      const rating = firstText(selectors.rating) || meta("ratingValue");

      const reviews = firstText(selectors.reviews) || meta("reviewCount");

      const availability =
        firstText(selectors.availability) ||
        meta("availability") ||
        (/(?:out of stock|sold out|currently unavailable)/i.test(bodyText)
          ? "Out of stock"
          : null);

      return {
        title,

        price,

        image,

        rating,

        reviews,

        availability,

        canonical:
          document.querySelector('link[rel="canonical"]')?.href ||
          location.href,

        jsonLd: scripts,
      };
    },
    {
      selectors: config.selectors,
    },
  );
}
// ============================================================
// TATACLIQ DYNAMIC PRODUCT DATA EXTRACTION
// ============================================================
//
// TataCliq is heavily client-rendered.
//
// Extraction priority:
//
//   1. TataCliq application JSON
//   2. Product-specific JSON objects
//   3. DOM product title
//   4. OpenGraph / Twitter product title
//   5. Product metadata
//
// IMPORTANT:
// Price/image and title do NOT necessarily exist inside the
// same application-state object.
//
// Therefore title recovery is performed independently.
// ============================================================

async function extractTataCliqData(page, pageUrl) {
  try {
    return await page.evaluate(
      ({ pageUrl }) => {
        const clean = (value) =>
          String(value ?? "")
            .replace(/\s+/g, " ")
            .trim();

        // ========================================================
        // PRODUCT ID
        // ========================================================

        const getProductIdFromUrl = (url) => {
          try {
            const match = String(url || "").match(/\/p-(mp[^/?#]+)/i);

            return match ? match[1].toLowerCase() : "";
          } catch {
            return "";
          }
        };

        const expectedId = getProductIdFromUrl(pageUrl);

        const targetProductId = getProductIdFromUrl(pageUrl);

        const normalizeTataCliqProductId = (value) => {
          if (typeof value !== "string" || !value.trim()) {
            return null;
          }

          const match = String(value).match(/mp\d{8,}/i);

          return match ? match[0].toLowerCase() : null;
        };

        // ========================================================
        // INVALID / GENERIC TITLES
        // ========================================================

        const isUsableTitle = (value) => {
          const title = clean(value);

          if (!title || title.length < 8) {
            return false;
          }

          const lower = title.toLowerCase();

          const invalidTitles = [
            "online fashion & lifestyle shopping for women, men & kids in india",
            "online fashion lifestyle shopping",
            "tata cliq",
            "tata cliq - online shopping",
            "online shopping",
            "shopping online",
          ];

          if (
            invalidTitles.some(
              (invalid) => lower === invalid || lower.includes(invalid),
            )
          ) {
            return false;
          }

          if (lower.includes("online fashion") && lower.includes("shopping")) {
            return false;
          }

          if (
            lower.includes("something went wrong") ||
            lower.includes("page not found") ||
            lower.includes("access denied") ||
            lower.includes("captcha")
          ) {
            return false;
          }

          return true;
        };

        // ========================================================
        // PRICE PARSER
        // ========================================================

        const toNumber = (value) => {
          if (value == null) {
            return null;
          }

          if (typeof value === "number") {
            return Number.isFinite(value) && value > 0 ? value : null;
          }

          const text = String(value).replace(/\u00a0/g, " ");

          const match = text.match(/(?:₹|Rs\.?|INR)?\s*([\d,]+(?:\.\d+)?)/i);

          if (!match) {
            return null;
          }

          const number = Number(match[1].replace(/,/g, ""));

          return Number.isFinite(number) && number > 0 ? number : null;
        };

        // ========================================================
        // PRICE KEYS
        // ========================================================

        const preferredPriceKeys = [
          "sellingPrice",
          "selling_price",
          "sellingPriceValue",

          "salePrice",
          "sale_price",
          "salePriceValue",

          "currentPrice",
          "current_price",
          "currentPriceValue",

          "finalPrice",
          "final_price",
          "finalPriceValue",

          "discountedPrice",
          "discounted_price",
          "discountedPriceValue",

          "productPrice",
          "product_price",
          "productPriceValue",

          "price",
          "priceValue",

          "amount",
        ];

        // ========================================================
        // PRODUCT CONTEXT
        // ========================================================

        const isProductContext = (object) => {
          if (!object || typeof object !== "object") {
            return false;
          }

          const keys = Object.keys(object).map((key) =>
            String(key).toLowerCase(),
          );

          return keys.some(
            (key) =>
              key.includes("product") ||
              key.includes("catalog") ||
              key === "name" ||
              key === "title" ||
              key === "brand" ||
              key.includes("sku") ||
              key.includes("variant") ||
              key.includes("mpid"),
          );
        };

        // ========================================================
        // PRODUCT ID MATCH
        // ========================================================

        const objectContainsProductId = (object) => {
          if (!targetProductId || !object || typeof object !== "object") {
            return false;
          }

          const possibleKeys = [
            "productId",
            "product_id",
            "productID",

            "catalogId",
            "catalog_id",
            "catalogID",

            "mpid",
            "mpId",

            "sku",
            "productCode",
            "product_code",

            "id",
          ];

          for (const key of possibleKeys) {
            if (object[key] == null) {
              continue;
            }

            const value = String(object[key]).trim().toLowerCase();

            if (value === targetProductId || value.includes(targetProductId)) {
              return true;
            }
          }

          return false;
        };

        // ========================================================
        // VALUE BY KEY
        // ========================================================

        const getValueByKey = (object, preferredKeys) => {
          if (!object || typeof object !== "object") {
            return null;
          }

          for (const key of preferredKeys) {
            if (Object.prototype.hasOwnProperty.call(object, key)) {
              const value = toNumber(object[key]);

              if (value != null) {
                return value;
              }
            }
          }

          return null;
        };

        // ========================================================
        // PRODUCT TITLE FROM OBJECT
        // ========================================================

        const getProductTitle = (object) => {
          if (!object || typeof object !== "object") {
            return null;
          }

          const candidates = [
            object.title,
            object.productTitle,
            object.productName,
            object.name,
            object.product_name,
            object.product_title,
            object.displayName,
            object.display_name,
          ];

          for (const candidate of candidates) {
            const title = clean(candidate);

            if (isUsableTitle(title)) {
              return title;
            }
          }

          return null;
        };

        // ========================================================
        // PRODUCT IMAGE
        // ========================================================

        const getProductImage = (object) => {
          if (!object || typeof object !== "object") {
            return null;
          }

          const isValidProductImage = (value) => {
            if (!value || typeof value !== "string") {
              return false;
            }

            const image = value.trim();

            if (!image) {
              return false;
            }

            const lower = image.toLowerCase();

            const invalidPatterns = [
              "icon-512x512",
              "icon_512x512",
              "favicon",
              "logo",
              "placeholder",
              "place-holder",
              "default-image",
              "default_image",
              "defaultimage",
              "no-image",
              "no_image",
              "noimage",
              "transparent.gif",
              "transparent.png",
              "1x1",
              "loader.gif",
              "loading.gif",
              "spinner",
              "fallback-image",
              "fallback_image",
            ];

            if (invalidPatterns.some((pattern) => lower.includes(pattern))) {
              return false;
            }

            if (lower.startsWith("data:") || lower.startsWith("blob:")) {
              return false;
            }

            return true;
          };

          const candidates = [
            object.image,
            object.imageUrl,
            object.imageURL,
            object.image_url,

            object.productImage,
            object.product_image,

            object.productImageUrl,
            object.product_image_url,

            object.thumbnail,
            object.thumbnailUrl,
            object.thumbnailURL,

            object.primaryImage,
            object.primary_image,

            object.mainImage,
            object.main_image,
          ];

          const arrayCandidates = [
            object.images,
            object.imageList,
            object.image_list,

            object.productImages,
            object.product_images,

            object.gallery,
            object.galleryImages,
            object.gallery_images,
          ];

          for (const value of arrayCandidates) {
            if (!Array.isArray(value)) {
              continue;
            }

            for (const item of value) {
              if (typeof item === "string") {
                candidates.push(item);
              } else if (item && typeof item === "object") {
                candidates.push(item.url);
                candidates.push(item.image);
                candidates.push(item.imageUrl);
                candidates.push(item.imageURL);
                candidates.push(item.src);
              }
            }
          }

          for (const candidate of candidates) {
            if (isValidProductImage(candidate)) {
              return clean(candidate);
            }
          }

          return null;
        };

        // ========================================================
        // RATING
        // ========================================================

        const getRating = (object) => {
          if (!object || typeof object !== "object") {
            return null;
          }

          return (
            object.rating ??
            object.ratingValue ??
            object.averageRating ??
            object.avgRating ??
            null
          );
        };

        // ========================================================
        // REVIEWS
        // ========================================================

        const getReviews = (object) => {
          if (!object || typeof object !== "object") {
            return null;
          }

          return (
            object.reviewCount ??
            object.review_count ??
            object.ratingCount ??
            object.rating_count ??
            object.reviews ??
            null
          );
        };

        // ========================================================
        // BEST PRICE PRODUCT OBJECT
        // ========================================================

        let best = null;

        // ========================================================
        // BEST TITLE FOUND ANYWHERE
        // ========================================================

        let bestTitle = null;

        let bestTitleScore = -1;

        const considerTitle = (object, depth) => {
          if (!object || typeof object !== "object" || depth > 12) {
            return;
          }

          const title = getProductTitle(object);

          if (title) {
            let score = 0;

            if (isProductContext(object)) {
              score += 3;
            }

            if (objectContainsProductId(object)) {
              score += 10;
            }

            if (
              object.productId ||
              object.product_id ||
              object.catalogId ||
              object.catalog_id ||
              object.sku
            ) {
              score += 3;
            }

            if (object.brand) {
              score += 1;
            }

            if (
              object.image ||
              object.imageUrl ||
              object.imageURL ||
              object.productImage
            ) {
              score += 1;
            }

            if (score > bestTitleScore) {
              bestTitleScore = score;
              bestTitle = title;
            }
          }

          for (const key of Object.keys(object)) {
            if (
              key === "__proto__" ||
              key === "prototype" ||
              key === "constructor"
            ) {
              continue;
            }

            const value = object[key];

            if (value && typeof value === "object") {
              if (Array.isArray(value)) {
                for (const item of value) {
                  considerTitle(item, depth + 1);
                }
              } else {
                considerTitle(value, depth + 1);
              }
            }
          }
        };

        // ========================================================
        // PRICE OBJECT SCANNER
        // ========================================================

        const consider = (object, depth) => {
          if (!object || typeof object !== "object" || depth > 12) {
            return;
          }

          const title = getProductTitle(object);

          const productContext = isProductContext(object);

          const price = getValueByKey(object, preferredPriceKeys);

          const candidateProductId = normalizeTataCliqProductId(
            object.productId ||
              object.product_id ||
              object.catalogId ||
              object.catalog_id ||
              object.sku ||
              object.productCode ||
              object.product_code,
          );

          if (
            targetProductId &&
            candidateProductId &&
            candidateProductId !== targetProductdId
          ) {
            console.log("🚫 TataCliq rejected mismatched product:", {
              expectedId,
              candidateProductId,
              title,
            });

            return;
          }

          if (price != null) {
            let score = 0;

            if (title) {
              score += 5;
            }

            if (productContext) {
              score += 3;
            }

            if (objectContainsProductId(object)) {
              score += 10;
            }

            if (
              object.productId ||
              object.product_id ||
              object.catalogId ||
              object.catalog_id ||
              object.sku
            ) {
              score += 3;
            }

            if (object.image || object.imageUrl || object.imageURL) {
              score += 1;
            }

            const keys = Object.keys(object).map((key) =>
              String(key).toLowerCase(),
            );

            if (
              keys.some(
                (key) =>
                  key.includes("sellingprice") ||
                  key.includes("saleprice") ||
                  key.includes("currentprice") ||
                  key.includes("finalprice"),
              )
            ) {
              score += 4;
            }

            if (!best || score > best.score) {
              best = {
                score,

                price,

                title,

                image: getProductImage(object),

                rating: getRating(object),

                reviews: getReviews(object),

                availability:
                  object.availability ??
                  object.inStock ??
                  object.in_stock ??
                  null,
              };
            }
          }

          for (const key of Object.keys(object)) {
            if (
              key === "__proto__" ||
              key === "prototype" ||
              key === "constructor"
            ) {
              continue;
            }

            const value = object[key];

            if (value && typeof value === "object") {
              if (Array.isArray(value)) {
                for (const item of value) {
                  consider(item, depth + 1);
                }
              } else {
                consider(value, depth + 1);
              }
            }
          }
        };

        // ========================================================
        // SCRIPT PARSER
        // ========================================================

        const parseScript = (scriptText) => {
          if (!scriptText || typeof scriptText !== "string") {
            return;
          }

          const text = scriptText.trim();

          if (!text) {
            return;
          }

          try {
            const parsed = JSON.parse(text);

            if (parsed && typeof parsed === "object") {
              considerTitle(parsed, 0);

              consider(parsed, 0);
            }
          } catch {
            // Ignore non-JSON scripts.
          }
        };

        // ========================================================
        // NEXT DATA
        // ========================================================

        const nextData = document.querySelector("#__NEXT_DATA__");

        if (nextData) {
          parseScript(nextData.textContent);
        }

        // ========================================================
        // APPLICATION JSON
        // ========================================================

        document
          .querySelectorAll('script[type="application/json"]')
          .forEach((script) => {
            parseScript(script.textContent);
          });

        // ========================================================
        // NORMAL SCRIPT BLOCKS
        // ========================================================

        document.querySelectorAll("script").forEach((script) => {
          const text = script.textContent || "";

          if (!text) {
            return;
          }

          if (
            !/(sellingPrice|salePrice|currentPrice|finalPrice|productPrice|price|productName|productTitle)/i.test(
              text,
            )
          ) {
            return;
          }

          parseScript(text);
        });

        // ========================================================
        // DOM TITLE RECOVERY
        // ========================================================
        //
        // This is the important new part.
        //
        // TataCliq may expose price/image through application
        // state while rendering the product title separately.
        //
        // ========================================================

        const titleCandidates = [];

        const addTitleCandidate = (value, source, element = null) => {
          const title = clean(value);

          if (!isUsableTitle(title)) {
            return;
          }

          let score = 0;

          // Strongest DOM source
          if (source === "h1") {
            score += 10;
          }

          if (source === "product-title") {
            score += 9;
          }

          if (source === "meta") {
            score += 7;
          }

          if (source === "heading") {
            score += 6;
          }

          // Product-related class/id
          const descriptor = String(
            element?.className || element?.id || "",
          ).toLowerCase();

          if (descriptor.includes("product")) {
            score += 4;
          }

          if (descriptor.includes("title")) {
            score += 4;
          }

          // Avoid tiny generic UI text
          if (title.length >= 15) {
            score += 2;
          }

          if (title.length >= 30) {
            score += 1;
          }

          titleCandidates.push({
            title,
            score,
            source,
          });
        };

        // H1
        document.querySelectorAll("h1").forEach((element) => {
          addTitleCandidate(element.textContent, "h1", element);
        });

        // Product title selectors
        const productTitleSelectors = [
          "[data-testid='product-title']",
          "[data-testid*='product-title']",
          "[data-testid*='ProductTitle']",
          "[class*='ProductTitle']",
          "[class*='product-title']",
          "[class*='productTitle']",
          "[class*='pdp-title']",
          "[class*='pdpTitle']",
          "[id*='product-title']",
          "[id*='productTitle']",
        ];

        document
          .querySelectorAll(productTitleSelectors.join(","))
          .forEach((element) => {
            addTitleCandidate(element.textContent, "product-title", element);
          });

        // Meta titles
        const metaTitleSelectors = [
          'meta[property="og:title"]',
          'meta[name="twitter:title"]',
          'meta[name="title"]',
        ];

        document
          .querySelectorAll(metaTitleSelectors.join(","))
          .forEach((element) => {
            addTitleCandidate(element.getAttribute("content"), "meta", element);
          });

        // Common product heading elements
        document
          .querySelectorAll("h2,h3,[role='heading']")
          .forEach((element) => {
            const text = clean(element.textContent);

            if (text.length >= 12 && text.length <= 250) {
              addTitleCandidate(text, "heading", element);
            }
          });

        titleCandidates.sort((a, b) => b.score - a.score);

        const domTitle = titleCandidates[0]?.title || null;

        // ========================================================
        // DOM PRICE FALLBACK
        // ========================================================

        if (!best) {
          const priceElements = [
            ...document.querySelectorAll(
              "[class*='price'], [class*='Price'], [data-testid*='price'], [data-testid*='Price']",
            ),
          ];

          for (const element of priceElements) {
            const text = clean(element.textContent);

            const price = toNumber(text);

            if (price == null) {
              continue;
            }

            if (/emi|per month|delivery|shipping|save|off/i.test(text)) {
              continue;
            }

            best = {
              score: 1,

              price,

              title: null,

              image: null,

              rating: null,

              reviews: null,

              availability: null,
            };

            break;
          }
        }

        // ========================================================
        // DOM PRODUCT IMAGE FALLBACK
        // ========================================================

        const getDomProductImage = () => {
          const invalidPatterns = [
            "icon-512x512",
            "icon_512x512",
            "favicon",
            "logo",
            "placeholder",
            "place-holder",
            "default-image",
            "default_image",
            "defaultimage",
            "no-image",
            "no_image",
            "noimage",
            "transparent.gif",
            "transparent.png",
            "1x1",
            "loader.gif",
            "loading.gif",
            "spinner",
            "fallback-image",
            "fallback_image",
            "wishlist",
            "heart",
            "search",
            "sprite",
          ];

          const cleanCandidate = (value) => {
            if (!value || typeof value !== "string") {
              return null;
            }

            let image = value.trim();

            if (!image) {
              return null;
            }

            if (image.includes(",") || /\s+\d+w\b/i.test(image)) {
              const parts = image
                .split(",")
                .map((item) => item.trim().split(/\s+/)[0])
                .filter(Boolean);

              image = parts[parts.length - 1] || parts[0] || image;
            }

            const lower = image.toLowerCase();

            if (lower.startsWith("data:") || lower.startsWith("blob:")) {
              return null;
            }

            if (invalidPatterns.some((pattern) => lower.includes(pattern))) {
              return null;
            }

            try {
              image = new URL(image, location.origin).href;
            } catch {
              return null;
            }

            if (!/^https?:\/\//i.test(image)) {
              return null;
            }

            return image;
          };

          const candidates = [];

          const addCandidate = (value, element) => {
            const image = cleanCandidate(value);

            if (!image) {
              return;
            }

            const width = Number(
              element?.naturalWidth ||
                element?.width ||
                element?.getBoundingClientRect?.()?.width ||
                0,
            );

            const height = Number(
              element?.naturalHeight ||
                element?.height ||
                element?.getBoundingClientRect?.()?.height ||
                0,
            );

            const area = width * height;

            const rect = element?.getBoundingClientRect?.();

            const visible = Boolean(
              rect && rect.width > 40 && rect.height > 40,
            );

            let score = 0;

            if (image.toLowerCase().includes("img.tatacliq.com")) {
              score += 50;
            }

            if (area > 100000) {
              score += 40;
            } else if (area > 50000) {
              score += 30;
            } else if (area > 20000) {
              score += 20;
            }

            if (visible) {
              score += 20;
            }

            if (width >= 150 && height >= 150) {
              score += 20;
            }

            // Strong identity check:
            // product image URL contains the same MP ID
            if (
              targetProductId &&
              image.toLowerCase().includes(targetProductId)
            ) {
              score += 30;
            }

            candidates.push({
              image,
              width,
              height,
              area,
              score,
            });
          };

          const images = [...document.querySelectorAll("img")];

          for (const img of images) {
            addCandidate(img.getAttribute("data-src"), img);

            addCandidate(img.getAttribute("data-lazy-src"), img);

            addCandidate(img.getAttribute("data-original"), img);

            addCandidate(img.getAttribute("data-image"), img);

            addCandidate(img.getAttribute("data-image-url"), img);

            addCandidate(img.getAttribute("srcset"), img);

            addCandidate(img.currentSrc, img);

            addCandidate(img.getAttribute("src"), img);
          }

          const sources = [...document.querySelectorAll("picture source")];

          for (const source of sources) {
            addCandidate(source.getAttribute("srcset"), source);

            addCandidate(source.getAttribute("data-srcset"), source);
          }

          if (candidates.length === 0) {
            return null;
          }

          const unique = Array.from(
            new Map(candidates.map((item) => [item.image, item])).values(),
          );

          unique.sort((a, b) => {
            if (b.score !== a.score) {
              return b.score - a.score;
            }

            return b.area - a.area;
          });

          return unique[0]?.image || null;
        };

        const domProductImage = getDomProductImage();

        // ========================================================
        // MERGE TITLE
        // ========================================================

        if (best && !best.title) {
          best.title = bestTitle || domTitle || null;
        }

        // If JSON found a title but it is weak,
        // prefer a strong DOM product title.
        if (best && domTitle) {
          const jsonTitle = best.title;

          if (!jsonTitle || !isUsableTitle(jsonTitle)) {
            best.title = domTitle;
          }
        }

        // ========================================================
        // MERGE IMAGE
        // ========================================================

        if (domProductImage) {
          console.log("🖼️ TataCliq DOM PRODUCT IMAGE:", domProductImage);
        }

        if (best && !best.image && domProductImage) {
          best.image = domProductImage;
        }

        // ========================================================
        // META TITLE FINAL FALLBACK
        // ========================================================

        if (best && !best.title) {
          const ogTitle = clean(
            document
              .querySelector('meta[property="og:title"]')
              ?.getAttribute("content"),
          );

          if (isUsableTitle(ogTitle)) {
            best.title = ogTitle;
          }
        }

        // ========================================================
        // DEBUG
        // ========================================================

        if (best) {
          console.log("🏷️ TataCliq title candidates:", {
            jsonTitle: bestTitle || null,

            domTitle: domTitle || null,

            finalTitle: best.title || null,

            productId: targetProductId || null,
          });
        }

        return best || null;
      },
      {
        pageUrl,
      },
    );
  } catch (error) {
    console.log(
      "⚠️ TataCliq dynamic extraction failed:",
      error?.message || error,
    );

    return null;
  }
}

// ============================================================
// TATACLIQ PAGE SETUP
// ============================================================
//
// TataCliq can occasionally return a homepage/application shell
// instead of the hydrated product page.
//
// This helper configures a newly acquired page consistently.
//
// ============================================================

async function prepareTataCliqPage(page) {
  await page
    .route("**/*", (route) => {
      const type = route.request().resourceType();

      if (type === "font" || type === "media") {
        return route.abort();
      }

      return route.continue();
    })
    .catch(() => {});
}

// ============================================================
// OPEN FRESH TATACLIQ PRODUCT PAGE
// ============================================================

async function openFreshTataCliqPage(currentPage, url, config) {
  console.log("🆕 TataCliq: creating a fresh browser page...");

  /*
    ------------------------------------------------------------
    RELEASE OLD PAGE
    ------------------------------------------------------------
    */

  if (currentPage) {
    await closePage(currentPage).catch(() => {});
  }

  /*
    ------------------------------------------------------------
    GET COMPLETELY FRESH PAGE
    ------------------------------------------------------------
    */

  const freshPage = await getPage(url);

  /*
    ------------------------------------------------------------
    APPLY RESOURCE RULES
    ------------------------------------------------------------
    */

  await prepareTataCliqPage(freshPage);

  /*
    ------------------------------------------------------------
    OPEN PRODUCT URL AGAIN
    ------------------------------------------------------------
    */

  await freshPage
    .goto(url, {
      waitUntil: "domcontentloaded",

      timeout: config.timeout || 18000,
    })
    .catch(() => null);

  /*
    ------------------------------------------------------------
    SHORT PRODUCT HYDRATION WAIT
    ------------------------------------------------------------
    */

  await freshPage.waitForTimeout(1000);

  return freshPage;
}

// ============================================================
// DIRECT PAGE SCRAPER
// ============================================================

async function directScrape(url, config) {
  let page = await getPage(url);

  try {
    /*
        --------------------------------------------------------
        BLOCK HEAVY RESOURCES
        --------------------------------------------------------
        */
    if (config.platform === "tatacliq") {
      await prepareTataCliqPage(page);
    } else {
      await page
        .route("**/*", (route) => {
          const type = route.request().resourceType();

          if (type === "font" || type === "media") {
            return route.abort();
          }

          return route.continue();
        })
        .catch(() => {});
    }

    /*
        --------------------------------------------------------
        OPEN PRODUCT PAGE
        --------------------------------------------------------
        */

    await page
      .goto(url, {
        waitUntil: "domcontentloaded",

        timeout: config.timeout || 18000,
      })
      .catch(() => null);

    /*
--------------------------------------------------------
FAST INITIAL SETTLE
--------------------------------------------------------

TataCliq often exposes complete product information
through JSON-LD immediately after DOMContentLoaded.

Do NOT blindly wait 5 seconds.

We first give the page a very small settle window,
extract the cheap/static sources, and only fall back
to the expensive dynamic extraction when necessary.
--------------------------------------------------------
*/

    const initialWaitMs =
      config.platform === "tatacliq" ? 250 : config.settleMs || 900;

    await page.waitForTimeout(initialWaitMs);

    /*
--------------------------------------------------------
EXTRACT DOM DATA
--------------------------------------------------------
*/

    let raw = await extractPage(page, config);

    /*
--------------------------------------------------------
EXTRACT JSON-LD DATA
--------------------------------------------------------
*/

    let jsonLd = jsonLdBest(parseJsonLd(raw.jsonLd));

    /*
--------------------------------------------------------
TATACLIQ DYNAMIC DATA
--------------------------------------------------------

Only perform the expensive dynamic extraction when
the cheap sources do NOT already provide the minimum
information required for a valid product result.

Minimum fast-path requirements:

    title
    price
    image

If all three exist, there is no reason to wait another
5 seconds for TataCliq application state.
--------------------------------------------------------
*/

    let tataCliqData = null;

    if (config.platform === "tatacliq") {
      const fastTitle = firstNonEmpty(jsonLd.title, raw.title);

      const fastPrice = parsePrice(jsonLd.price) ?? parsePrice(raw.price);

      const fastImage = firstNonEmpty(jsonLd.image, raw.image);

      /*
--------------------------------------------------------
VALIDATE TATACLIQ FAST DATA
--------------------------------------------------------
*/

      const validFastTitle = isValidTataCliqProductTitle(fastTitle, url);

      const validFastImage = isValidTataCliqProductImage(fastImage);

      const validFastPrice =
        fastPrice != null && Number.isFinite(Number(fastPrice));

      const hasFastProductData = Boolean(
        validFastTitle && validFastPrice && validFastImage,
      );

      console.log("🔎 TataCliq FAST PATH VALIDATION:", {
        title: fastTitle,

        validTitle: validFastTitle,

        price: fastPrice,

        validPrice: validFastPrice,

        image: fastImage,

        validImage: validFastImage,
      });

      if (hasFastProductData) {
        console.log("⚡ TataCliq FAST PATH ACCEPTED:", {
          title: fastTitle,

          price: fastPrice,

          image: fastImage,
        });

        console.log("⚡ TataCliq dynamic wait skipped");
      } else {
        console.log("⏳ TataCliq FAST PATH REJECTED:", {
          title: fastTitle,

          validTitle: validFastTitle,

          price: fastPrice,

          validPrice: validFastPrice,

          image: fastImage,

          validImage: validFastImage,
        });

        const dynamicFallbackWaitMs = 1200;

        await page.waitForTimeout(dynamicFallbackWaitMs);

        tataCliqData = await extractTataCliqData(page, url);

        console.log("🧾 TataCliq Dynamic Data:", tataCliqData || null);
        /*
----------------------------------------------------
ATTEMPT 2
----------------------------------------------------
*/

        const attempt1Valid =
          tataCliqData && parsePrice(tataCliqData.price) != null;

        if (!attempt1Valid) {
          console.log(
            "🔁 TataCliq Dynamic Attempt #1 incomplete; waiting for product state...",
          );

          await page.waitForTimeout(1000);

          tataCliqData = await extractTataCliqData(page, url);

          console.log("🧾 TataCliq Dynamic Attempt #2:", tataCliqData || null);
        }

        /*
----------------------------------------------------
ATTEMPT 3
----------------------------------------------------
*/

        const attempt2Valid =
          tataCliqData && parsePrice(tataCliqData.price) != null;

        if (!attempt2Valid) {
          console.log(
            "🔁 TataCliq Dynamic Attempt #2 incomplete; waiting again...",
          );

          await page.waitForTimeout(1500);

          tataCliqData = await extractTataCliqData(page, url);

          console.log("🧾 TataCliq Dynamic Attempt #3:", tataCliqData || null);
        }

        /*
----------------------------------------------------
CHECK AFTER ORIGINAL 3 ATTEMPTS
----------------------------------------------------
*/

        let finalDynamicPrice = parsePrice(tataCliqData?.price);

        /*
----------------------------------------------------
FRESH PAGE RECOVERY
----------------------------------------------------

IMPORTANT:

If TataCliq returned the homepage shell, repeatedly
extracting the same page may never recover the product.

So we completely release the old page and open the
same product URL in a fresh page.

----------------------------------------------------
*/

        if (finalDynamicPrice == null) {
          console.log("🆕 TataCliq Dynamic extraction still failed.");

          console.log("🔄 TataCliq: retrying with a completely fresh page...");

          try {
            page = await openFreshTataCliqPage(page, url, config);

            /*
        ----------------------------------------------------
        RE-EXTRACT STATIC DATA FROM FRESH PAGE
        ----------------------------------------------------
        */

            raw = await extractPage(page, config);

            jsonLd = jsonLdBest(parseJsonLd(raw.jsonLd));

            /*
        ----------------------------------------------------
        FRESH PAGE DYNAMIC EXTRACTION
        ----------------------------------------------------
        */

            tataCliqData = await extractTataCliqData(page, url);

            console.log(
              "🧾 TataCliq Fresh Page Dynamic Data:",
              tataCliqData || null,
            );

            finalDynamicPrice = parsePrice(tataCliqData?.price);

            /*
        ----------------------------------------------------
        FRESH PAGE RESULT
        ----------------------------------------------------
        */

            if (finalDynamicPrice != null) {
              console.log("✅ TataCliq fresh-page recovery succeeded:", {
                price: finalDynamicPrice,

                title: tataCliqData?.title || null,

                image: tataCliqData?.image || null,
              });
            } else {
              console.log("❌ TataCliq fresh-page recovery also failed");
            }
          } catch (freshPageError) {
            console.log(
              "⚠️ TataCliq fresh-page recovery error:",
              freshPageError?.message || freshPageError,
            );
          }
        }

        /*
----------------------------------------------------
FINAL RESULT
----------------------------------------------------
*/

        if (finalDynamicPrice != null) {
          console.log("✅ TataCliq dynamic extraction recovered product:", {
            price: finalDynamicPrice,

            image: tataCliqData?.image || null,

            title: tataCliqData?.title || null,
          });
        } else {
          console.log(
            "❌ TataCliq dynamic extraction failed after all attempts",
          );
        }
      }
    }
    /*
--------------------------------------------------------
TATACLIQ DEBUG
--------------------------------------------------------
*/

    if (config.platform === "tatacliq") {
      console.log("🧾 TataCliq Dynamic Data:", tataCliqData || null);

      console.log("🧾 TataCliq JSON-LD:", jsonLd || null);

      console.log("🧾 TataCliq DOM Data:", {
        title: raw.title || null,

        price: raw.price || null,

        image: raw.image || null,

        rating: raw.rating || null,

        reviews: raw.reviews || null,

        availability: raw.availability || null,
      });
    }

    /*
--------------------------------------------------------
MERGE DATA SOURCES
--------------------------------------------------------

Priority:

TataCliq dynamic application state
        ↓
JSON-LD
        ↓
DOM

For other marketplaces the existing behaviour remains:

JSON-LD
        ↓
DOM
--------------------------------------------------------
*/

    const title =
      config.platform === "tatacliq"
        ? getValidTataCliqTitle(
            url,
            tataCliqData?.title,
            jsonLd.title,
            raw.title,
          )
        : firstNonEmpty(raw.title, jsonLd.title);

    const price =
      config.platform === "tatacliq"
        ? (parsePrice(tataCliqData?.price) ??
          parsePrice(jsonLd.price) ??
          parsePrice(raw.price))
        : (parsePrice(raw.price) ?? parsePrice(jsonLd.price));

    const imageSource =
      config.platform === "tatacliq"
        ? getValidTataCliqImage(tataCliqData?.image, jsonLd.image, raw.image)
        : firstNonEmpty(raw.image, jsonLd.image);

    const image = normalizeImage(imageSource, config.host);

    const rating =
      config.platform === "tatacliq"
        ? (parseRating(tataCliqData?.rating) ??
          parseRating(jsonLd.rating) ??
          parseRating(raw.rating))
        : (parseRating(raw.rating) ?? parseRating(jsonLd.rating));

    const reviewCount =
      config.platform === "tatacliq"
        ? (parseReviewCount(tataCliqData?.reviews) ??
          parseReviewCount(jsonLd.reviews) ??
          parseReviewCount(raw.reviews))
        : (parseReviewCount(raw.reviews) ?? parseReviewCount(jsonLd.reviews));

    const availabilityRaw =
      config.platform === "tatacliq"
        ? firstNonEmpty(
            tataCliqData?.availability,
            jsonLd.availability,
            raw.availability,
          )
        : firstNonEmpty(raw.availability, jsonLd.availability);

    const availability = /outofstock|out-of-stock|soldout|unavailable/i.test(
      String(availabilityRaw || ""),
    )
      ? false
      : availabilityRaw != null
        ? true
        : true;

    /*
        --------------------------------------------------------
        VALIDATE PRODUCT
        --------------------------------------------------------
        */

    if (!validateTitle(title, url)) {
      throw new Error("Product title unavailable or invalid");
    }

    if (price == null) {
      throw new Error("Product price unavailable");
    }

    /*
        --------------------------------------------------------
        CANONICAL URL
        --------------------------------------------------------
        */

    const canonical = normalizeUrl(raw.canonical, config.host) || url;

    /*
        --------------------------------------------------------
        RETURN STANDARD STOCKSENSE RESULT
        --------------------------------------------------------
        */

    return {
      platform: config.platform,

      url: canonical,

      title,

      currentPrice: price,

      image,

      rating,

      reviewCount,

      availability,

      inputType: "url",
    };
  } finally {
    await closePage(page).catch(() => {});
  }
}

// ============================================================
// SEARCH FALLBACK
// ============================================================

async function searchFallback(url, config) {
  if (!config.adapter) {
    throw new Error(
      `${config.platform}: direct page extraction failed and no search adapter is configured`,
    );
  }

  let query = buildSlugQuery(url, config);

  // TataCliq URLs can be ID-only:
  // /p-mp000000014038970
  //
  // Searching "p mp000000014038970" is useless.
  // Do not send an ID-only query to TataCliq search.

  if (config.platform === "tatacliq") {
    query = query
      .replace(/\bmp\d{8,}\b/gi, " ")
      .replace(/\bp\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!query) {
      throw new Error(
        "tatacliq: URL contains only a TataCliq product ID; search fallback skipped",
      );
    }
  }

  if (!query) {
    throw new Error(`${config.platform}: could not build fallback query`);
  }

  console.log(
    `🔄 ${config.platform}: direct scrape failed — trying search fallback`,
  );

  console.log(`🔎 ${config.platform} fallback query:`, query);

  let results = [];

  /*
    ------------------------------------------------------------
    TRY FAST SEARCH FIRST
    ------------------------------------------------------------
    */

  try {
    if (typeof config.adapter.searchFast === "function") {
      results = await config.adapter.searchFast(query, {});
    }
  } catch {
    // Continue to regular search.
  }

  /*
    ------------------------------------------------------------
    REGULAR SEARCH
    ------------------------------------------------------------
    */

  if (!Array.isArray(results) || results.length === 0) {
    if (typeof config.adapter.search === "function") {
      results = await config.adapter.search(query, {});
    }
  }

  if (!Array.isArray(results) || results.length === 0) {
    throw new Error(
      `${config.platform}: fallback search returned no candidates`,
    );
  }

  /*
    ------------------------------------------------------------
    BUILD QUERY TOKENS
    ------------------------------------------------------------
    */

  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);

  /*
    ------------------------------------------------------------
    SCORE SEARCH RESULTS
    ------------------------------------------------------------
    */

  const score = (product) => {
    const title = cleanText(
      product?.title || product?.productName || product?.name,
    ).toLowerCase();

    if (!title) {
      return 0;
    }

    const words = new Set(title.split(/[^a-z0-9]+/).filter(Boolean));

    const numeric = tokens.filter((token) => /\d/.test(token));

    if (numeric.some((token) => !words.has(token))) {
      return 0;
    }

    const matched = tokens.filter((token) => words.has(token)).length;

    const phraseBonus = title.includes(query.toLowerCase()) ? 0.25 : 0;

    return tokens.length ? matched / tokens.length + phraseBonus : 0;
  };

  /*
    ------------------------------------------------------------
    RANK RESULTS
    ------------------------------------------------------------
    */

  const ranked = results
    .map((product) => ({
      product,

      score: score(product),
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];

  if (!best || best.score < (config.fallbackThreshold ?? 0.45)) {
    throw new Error(
      `${config.platform}: fallback candidate confidence too low`,
    );
  }

  const product = best.product;

  const title = firstNonEmpty(
    product?.title,
    product?.productName,
    product?.name,
  );

  const currentPrice =
    parsePrice(product?.currentPrice) ??
    parsePrice(product?.price) ??
    parsePrice(product?.salePrice);

  if (!title || currentPrice == null) {
    throw new Error(
      `${config.platform}: fallback candidate missing title/price`,
    );
  }

  return {
    platform: config.platform,

    url:
      normalizeUrl(
        product?.url || product?.productUrl || product?.webURL,
        config.host,
      ) || url,

    title,

    currentPrice,

    image: normalizeImage(
      product?.image || product?.imageUrl || product?.thumbnail,
      config.host,
    ),

    rating: parseRating(product?.rating),

    reviewCount: parseReviewCount(product?.reviewCount ?? product?.reviews),

    availability: product?.availability ?? true,

    inputType: "url",
  };
}
// ============================================================
// GENERIC SEARCH FALLBACK FOR MARKETPLACE URL
// ============================================================
//
// Used when a marketplace has a search adapter but does not
// have a dedicated direct-product scraper.
//
// Strategy:
//
//   1. Extract useful product words from URL
//   2. Remove marketplace URL noise
//   3. Remove product IDs / path fragments
//   4. Search marketplace
//   5. Compare returned titles against useful query tokens
//   6. Select the strongest verified candidate
//
// ============================================================

async function searchMarketplaceProductFallback(
  originalUrl,
  platform,
  adapter,
) {
  if (!adapter) {
    throw new Error(`${platform} scraper/search adapter is unavailable`);
  }

  if (typeof originalUrl !== "string" || !originalUrl.trim()) {
    throw new Error(`${platform} fallback received an invalid URL`);
  }

  // --------------------------------------------------------
  // SAFE HELPERS
  // --------------------------------------------------------

  const safe = (value) => (value == null ? "" : String(value).trim());

  const normalize = (value) =>
    safe(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // --------------------------------------------------------
  // WORDS WHICH ARE NOT USEFUL FOR PRODUCT IDENTITY
  // --------------------------------------------------------

  const stopWords = new Set([
    "and",
    "the",
    "for",
    "with",
    "from",
    "this",
    "that",
    "these",
    "those",

    "new",
    "latest",
    "best",
    "original",
    "copy",
    "share",
    "click",
    "redirect",

    "product",
    "products",
    "item",
    "items",

    "buy",
    "online",
    "official",

    "offer",
    "offers",
    "sale",
    "deal",
    "deals",

    "piece",
    "pieces",
    "pack",
    "set",

    "p",
    "a",
    "id",
  ]);

  // --------------------------------------------------------
  // TOKENIZER
  // --------------------------------------------------------

  const tokens = (value) => [
    ...new Set(
      normalize(value)
        .split(/\s+/)
        .filter(Boolean)
        .filter((token) => token.length >= 2)
        .filter((token) => !stopWords.has(token))
        .filter((token) => !/^\d+$/.test(token)),
    ),
  ];

  // --------------------------------------------------------
  // EXTRACT TITLE FROM DIFFERENT API SHAPES
  // --------------------------------------------------------

  const getTitle = (product) =>
    safe(
      product?.title ||
        product?.productName ||
        product?.name ||
        product?.hero_product_name ||
        product?.product_name ||
        product?.description,
    );

  // --------------------------------------------------------
  // EXTRACT PRODUCT URL
  // --------------------------------------------------------

  const getUrl = (product) =>
    safe(
      product?.url ||
        product?.productUrl ||
        product?.product_url ||
        product?.landingPageUrl ||
        product?.webURL ||
        product?.link,
    );

  // --------------------------------------------------------
  // EXTRACT PRODUCT ID
  // --------------------------------------------------------

  const getId = (product) =>
    safe(
      product?.product_id ||
        product?.productId ||
        product?.catalogId ||
        product?.catalog_id ||
        product?.id,
    );

  // --------------------------------------------------------
  // EXTRACT PRICE
  // --------------------------------------------------------

  const getPrice = (product) =>
    product?.price ??
    product?.currentPrice ??
    product?.salePrice ??
    product?.sellingPrice ??
    product?.selling_price ??
    product?.min_product_price ??
    product?.min_catalog_price ??
    product?.original_price ??
    null;

  // --------------------------------------------------------
  // EXTRACT IMAGE
  // --------------------------------------------------------

  const getImage = (product) =>
    safe(
      product?.image ||
        product?.imageUrl ||
        product?.image_url ||
        product?.thumbnail ||
        product?.thumbnailUrl ||
        product?.imageUrlHttps ||
        product?.product_image,
    );

  // --------------------------------------------------------
  // EXTRACT RATING
  // --------------------------------------------------------

  const getRating = (product) =>
    product?.rating ??
    product?.ratingValue ??
    product?.avg_rating ??
    product?.average_rating ??
    product?.product_rating ??
    null;

  // --------------------------------------------------------
  // EXTRACT REVIEW COUNT
  // --------------------------------------------------------

  const getReviews = (product) =>
    product?.reviewCount ??
    product?.reviews ??
    product?.review_count ??
    product?.ratingCount ??
    product?.rating_count ??
    null;

  // --------------------------------------------------------
  // EXTRACT ORIGINAL PRODUCT ID FROM URL
  // --------------------------------------------------------

  let originalProductId = "";

  try {
    const parsed = new URL(originalUrl);

    const pathname = parsed.pathname;

    const patterns = [
      // Myntra:
      // /puma-hustle-v2-men's-shoes/15503210/buy
      /\/(\d{5,})\/(?:buy|product|pdp)\/?$/i,

      // TataCliq:
      // /p-mp000000014038970
      /\/p-(mp[^/?#]+)/i,

      // Meesho:
      // /p/a0optd
      /\/p\/([^/?#]+)/i,

      // Amazon:
      // /dp/B0XXXXXXX
      /\/dp\/([^/?#]+)/i,

      // Generic product:
      /\/product\/([^/?#]+)/i,

      /\/products\/([^/?#]+)/i,

      /\/item\/([^/?#]+)/i,
    ];

    for (const pattern of patterns) {
      const match = pathname.match(pattern);

      if (match?.[1]) {
        originalProductId = safe(match[1]);

        break;
      }
    }
  } catch {
    // Invalid URL will be handled by the query builder.
  }

  // --------------------------------------------------------
  // EXTRACT PRODUCT SLUG
  // --------------------------------------------------------

  let slug = "";

  try {
    const parsed = new URL(originalUrl);

    slug = decodeURIComponent(parsed.pathname);

    // Remove product IDs from the end of known
    // marketplace URL structures.

    slug = slug.replace(/\/p\/[^/?#]+/gi, "");

    slug = slug.replace(/\/dp\/[^/?#]+/gi, "");

    slug = slug.replace(/\/product\/[^/?#]+/gi, "");

    slug = slug.replace(/\/products\/[^/?#]+/gi, "");

    slug = slug.replace(/\/item\/[^/?#]+/gi, "");

    slug = slug.replace(/\.(html?|aspx)$/i, "");

    slug = slug.replace(/[-_]+/g, " ");

    slug = slug.replace(/[\/]+/g, " ");

    slug = normalize(slug);
  } catch {
    slug = normalize(originalUrl);
  }

  // --------------------------------------------------------
  // REMOVE MARKETPLACE PRODUCT IDS FROM SEARCH TEXT
  // --------------------------------------------------------
  //
  // TataCliq product URLs contain IDs such as:
  // /p-mp000000013280170
  //
  // The ID is already preserved separately in
  // originalProductId for exact candidate matching.
  // It should not pollute the textual search query.
  //

  slug = slug.replace(/\bmp\d{8,}\b/gi, " ");

  slug = slug.replace(/\s+/g, " ").trim();

  const queryTokens = tokens(slug);

  const query = queryTokens.join(" ").slice(0, 180);

  if (!query) {
    throw new Error(`${platform}: fallback query could not be extracted`);
  }

  console.log(`🔎 ${platform} fallback query:`, query);

  if (originalProductId) {
    console.log(`🆔 ${platform} original product ID:`, originalProductId);
  }

  // --------------------------------------------------------
  // SEARCH ADAPTER
  // --------------------------------------------------------

  let rawResults = [];

  try {
    if (typeof adapter.searchFast === "function") {
      rawResults = await adapter.searchFast(query);
    }
  } catch (error) {
    console.log(`⚠️ ${platform} searchFast failed:`, error?.message || error);
  }

  // --------------------------------------------------------
  // REGULAR SEARCH FALLBACK
  // --------------------------------------------------------

  if (!Array.isArray(rawResults) || rawResults.length === 0) {
    try {
      if (typeof adapter.search === "function") {
        rawResults = await adapter.search(query);
      }
    } catch (error) {
      console.log(`⚠️ ${platform} search failed:`, error?.message || error);
    }
  }

  // --------------------------------------------------------
  // HANDLE DIFFERENT RESULT CONTAINERS
  // --------------------------------------------------------

  if (!Array.isArray(rawResults)) {
    if (Array.isArray(rawResults?.products)) {
      rawResults = rawResults.products;
    } else if (Array.isArray(rawResults?.results)) {
      rawResults = rawResults.results;
    } else if (Array.isArray(rawResults?.items)) {
      rawResults = rawResults.items;
    } else {
      rawResults = [];
    }
  }

  if (rawResults.length === 0) {
    throw new Error(`${platform}: fallback search returned no products`);
  }

  console.log(
    `🔎 ${platform}: received ${rawResults.length} fallback candidates`,
  );

  // --------------------------------------------------------
  // NORMALIZE CANDIDATES
  // --------------------------------------------------------

  const candidates = rawResults
    .map((product, index) => {
      const title = getTitle(product);

      const candidateUrl = getUrl(product);

      const id = getId(product);

      const price = parsePrice(getPrice(product));

      const image = getImage(product);

      const rating = parseRating(getRating(product));

      const reviews = parseReviewCount(getReviews(product));

      return {
        product,

        index,

        title,

        normalizedTitle: normalize(title),

        candidateUrl,

        normalizedUrl: normalize(candidateUrl),

        id,

        normalizedId: normalize(id),

        price,

        image,

        rating,

        reviews,
      };
    })
    .filter((candidate) => candidate.title && candidate.candidateUrl);

  if (candidates.length === 0) {
    throw new Error(
      `${platform}: fallback search candidates could not be normalized`,
    );
  }

  // --------------------------------------------------------
  // QUERY SET
  // --------------------------------------------------------

  const originalTokens = queryTokens;

  const originalTokenSet = new Set(originalTokens);

  // --------------------------------------------------------
  // URL PRODUCT ID MATCH
  // --------------------------------------------------------

  const extractIdFromCandidateUrl = (candidateUrl) => {
    if (!candidateUrl) {
      return "";
    }

    try {
      const parsed = new URL(candidateUrl);

      const pathname = parsed.pathname;

      const patterns = [
        // Myntra:
        /\/(\d{5,})\/(?:buy|product|pdp)\/?$/i,

        // TataCliq:
        /\/p-(mp[^/?#]+)/i,

        /\/p\/([^/?#]+)/i,

        /\/dp\/([^/?#]+)/i,

        /\/product\/([^/?#]+)/i,

        /\/products\/([^/?#]+)/i,

        /\/item\/([^/?#]+)/i,
      ];
      for (const pattern of patterns) {
        const match = pathname.match(pattern);

        if (match?.[1]) {
          return safe(match[1]);
        }
      }
    } catch {
      // Ignore malformed candidate URLs.
    }

    return "";
  };

  // --------------------------------------------------------
  // SCORE ONE CANDIDATE
  // --------------------------------------------------------

  const scoreCandidate = (candidate) => {
    const titleTokens = tokens(candidate.title);

    const titleSet = new Set(titleTokens);

    let exactTokenScore = 0;

    let weightedScore = 0;

    let partialScore = 0;

    let matchedTokenCount = 0;

    let longTokenMatches = 0;

    for (const token of originalTokens) {
      if (titleSet.has(token)) {
        matchedTokenCount += 1;

        exactTokenScore += 1;

        if (token.length >= 7) {
          longTokenMatches += 1;
        }

        const weight = token.length >= 10 ? 3 : token.length >= 7 ? 2 : 1;

        weightedScore += weight;

        continue;
      }

      const partial = titleTokens.some(
        (titleToken) =>
          titleToken.startsWith(token) || token.startsWith(titleToken),
      );

      if (partial) {
        partialScore += token.length >= 7 ? 0.75 : 0.45;
      }
    }

    const totalWeight = originalTokens.reduce(
      (total, token) =>
        total + (token.length >= 10 ? 3 : token.length >= 7 ? 2 : 1),
      0,
    );

    const normalizedWeightedScore =
      totalWeight > 0 ? weightedScore / totalWeight : 0;

    const normalizedTokenScore =
      originalTokens.length > 0 ? exactTokenScore / originalTokens.length : 0;

    const normalizedPartialScore =
      originalTokens.length > 0
        ? Math.min(1, partialScore / originalTokens.length)
        : 0;

    // ------------------------------------------------
    // PHRASE MATCH
    // ------------------------------------------------

    const normalizedQuery = normalize(query);

    let phraseScore = 0;

    if (
      normalizedQuery &&
      candidate.normalizedTitle.includes(normalizedQuery)
    ) {
      phraseScore = 1;
    } else {
      const compactQuery = normalizedQuery.replace(/\s+/g, "");

      const compactTitle = candidate.normalizedTitle.replace(/\s+/g, "");

      if (compactQuery.length >= 8 && compactTitle.includes(compactQuery)) {
        phraseScore = 0.8;
      }
    }

    // ------------------------------------------------
    // SLUG SCORE
    // ------------------------------------------------

    let slugScore = 0;

    const slugTokens = tokens(slug);

    if (slugTokens.length) {
      const slugMatched = slugTokens.filter((token) =>
        titleSet.has(token),
      ).length;

      slugScore = slugMatched / slugTokens.length;
    }

    // ------------------------------------------------
    // URL SCORE
    // ------------------------------------------------

    let urlScore = 0;

    const normalizedCandidateUrl = normalize(candidate.candidateUrl);

    for (const token of originalTokens) {
      if (normalizedCandidateUrl.includes(token)) {
        urlScore += token.length >= 7 ? 0.15 : 0.05;
      }
    }

    urlScore = Math.min(1, urlScore);

    // ------------------------------------------------
    // EXACT PRODUCT ID MATCH
    // ------------------------------------------------

    let exactProductIdMatch = false;

    let urlProductIdMatch = false;

    if (originalProductId && candidate.id) {
      exactProductIdMatch =
        normalize(candidate.id) === normalize(originalProductId);
    }

    const candidateUrlProductId = extractIdFromCandidateUrl(
      candidate.candidateUrl,
    );

    if (originalProductId && candidateUrlProductId) {
      urlProductIdMatch =
        normalize(candidateUrlProductId) === normalize(originalProductId);
    }

    // ------------------------------------------------
    // DATA QUALITY
    // ------------------------------------------------

    let qualityScore = 0;

    if (candidate.title) {
      qualityScore += 0.25;
    }

    if (candidate.price != null) {
      qualityScore += 0.25;
    }

    if (candidate.candidateUrl) {
      qualityScore += 0.25;
    }

    if (candidate.image) {
      qualityScore += 0.1;
    }

    if (candidate.rating != null) {
      qualityScore += 0.05;
    }

    if (candidate.reviews != null) {
      qualityScore += 0.1;
    }

    // ------------------------------------------------
    // FINAL SCORE
    // ------------------------------------------------

    let score =
      normalizedWeightedScore * 0.6 +
      normalizedTokenScore * 0.25 +
      normalizedPartialScore * 0.15 +
      phraseScore * 0.2 +
      slugScore * 0.1 +
      urlScore * 0.1 +
      qualityScore * 0.05;

    // Exact catalog/product ID is the strongest possible
    // evidence because the URL itself identifies the item.

    if (exactProductIdMatch) {
      score = 2.0;
    } else if (urlProductIdMatch) {
      score = 1.5;
    }

    return {
      ...candidate,

      score,

      exactProductIdMatch,

      urlProductIdMatch,

      matchedTokenCount,

      longTokenMatches,

      normalizedWeightedScore,

      normalizedTokenScore,

      normalizedPartialScore,

      phraseScore,

      slugScore,

      urlScore,

      qualityScore,
    };
  };

  // --------------------------------------------------------
  // RANK INITIAL CANDIDATES
  // --------------------------------------------------------

  let ranked = candidates.map(scoreCandidate).sort((a, b) => b.score - a.score);

  // --------------------------------------------------------
  // DEBUG TOP CANDIDATES
  // --------------------------------------------------------

  console.log(`📊 ${platform}: top fallback candidates`);

  ranked.slice(0, 5).forEach((candidate, index) => {
    console.log(`${index + 1}.`, {
      title: candidate.title,
      score: Number(candidate.score.toFixed(4)),
      exactProductIdMatch: candidate.exactProductIdMatch,
      urlProductIdMatch: candidate.urlProductIdMatch,
      matchedTokens: candidate.matchedTokenCount,
      price: candidate.price,
      url: candidate.candidateUrl,
    });
  });

  // --------------------------------------------------------
  // BEST CANDIDATE
  // --------------------------------------------------------

  let best = ranked[0];

  if (!best) {
    throw new Error(`${platform}: no fallback candidate available`);
  }

  // --------------------------------------------------------
  // SMART CONFIDENCE VALIDATION
  // --------------------------------------------------------
  //
  // Exact ID matches are trusted.
  //
  // Strong title matches are trusted.
  //
  // Otherwise require a smaller but meaningful threshold.
  //
  // This avoids the old problem where valid Meesho products
  // were rejected simply because the URL slug contained
  // repeated marketplace words.
  //
  // --------------------------------------------------------

  const strongTitleMatch =
    best.normalizedWeightedScore >= 0.65 && best.normalizedTokenScore >= 0.5;

  const acceptableTitleMatch =
    best.normalizedWeightedScore >= 0.45 && best.normalizedTokenScore >= 0.35;

  const minimumSafeScore = 0.18;

  const accepted =
    best.exactProductIdMatch ||
    best.urlProductIdMatch ||
    strongTitleMatch ||
    acceptableTitleMatch ||
    best.score >= minimumSafeScore;

  if (!accepted) {
    throw new Error(
      `${platform}: fallback candidate confidence too low (best score: ${best.score.toFixed(3)})`,
    );
  }

  // --------------------------------------------------------
  // COMPACT QUERY RETRY
  // --------------------------------------------------------
  //
  // If the first query produced a weak match, try a compact
  // query using the most informative tokens.
  //
  // This is particularly useful for Meesho URLs such as:
  //
  // alkro-slippers-slippers-seruppu-mens-slippers-flip-flops
  //
  // where repeated generic words can dilute matching.
  //
  // --------------------------------------------------------

  if (
    !best.exactProductIdMatch &&
    !best.urlProductIdMatch &&
    best.score < 0.4 &&
    originalTokens.length > 5
  ) {
    const compactTokens = [...originalTokens]
      .sort((a, b) => b.length - a.length)
      .slice(0, 8);

    const compactQuery = compactTokens.join(" ");

    if (compactQuery && compactQuery !== query) {
      console.log(
        `🔁 ${platform}: weak match — retrying compact query:`,
        compactQuery,
      );

      let compactResults = [];

      try {
        if (typeof adapter.searchFast === "function") {
          compactResults = await adapter.searchFast(compactQuery);
        }
      } catch {
        // Continue with regular search.
      }

      if (!Array.isArray(compactResults) || compactResults.length === 0) {
        try {
          if (typeof adapter.search === "function") {
            compactResults = await adapter.search(compactQuery);
          }
        } catch {
          // Ignore retry failure.
        }
      }

      if (!Array.isArray(compactResults)) {
        if (Array.isArray(compactResults?.products)) {
          compactResults = compactResults.products;
        } else if (Array.isArray(compactResults?.results)) {
          compactResults = compactResults.results;
        } else if (Array.isArray(compactResults?.items)) {
          compactResults = compactResults.items;
        } else {
          compactResults = [];
        }
      }

      if (compactResults.length) {
        const compactCandidates = compactResults
          .map((product, index) => {
            const title = getTitle(product);

            const candidateUrl = getUrl(product);

            const id = getId(product);

            return {
              product,

              index,

              title,

              normalizedTitle: normalize(title),

              candidateUrl,

              normalizedUrl: normalize(candidateUrl),

              id,

              normalizedId: normalize(id),

              price: parsePrice(getPrice(product)),

              image: getImage(product),

              rating: parseRating(getRating(product)),

              reviews: parseReviewCount(getReviews(product)),
            };
          })
          .filter((candidate) => candidate.title && candidate.candidateUrl);

        if (compactCandidates.length) {
          const compactRanked = compactCandidates
            .map(scoreCandidate)
            .sort((a, b) => b.score - a.score);

          const compactBest = compactRanked[0];

          if (compactBest && compactBest.score > best.score) {
            console.log(
              `✅ ${platform}: compact query produced a stronger candidate`,
            );

            best = compactBest;
          }
        }
      }
    }
  }
  // --------------------------------------------------------
  // FINAL PRODUCT DATA
  // --------------------------------------------------------

  const finalProduct = best.product;

  const finalTitle = firstNonEmpty(getTitle(finalProduct), best.title);

  const finalPrice = parsePrice(getPrice(finalProduct)) ?? best.price;

  const finalUrl =
    normalizeUrl(
      getUrl(finalProduct),
      platform === "meesho" ? "https://www.meesho.com" : undefined,
    ) ||
    best.candidateUrl ||
    originalUrl;

  const finalImage =
    normalizeImage(
      getImage(finalProduct),
      platform === "meesho" ? "https://www.meesho.com" : undefined,
    ) ||
    best.image ||
    null;

  const finalRating =
    parseRating(getRating(finalProduct)) ?? best.rating ?? null;

  const finalReviews =
    parseReviewCount(getReviews(finalProduct)) ?? best.reviews ?? null;

  // --------------------------------------------------------
  // PRICE VALIDATION
  // --------------------------------------------------------

  if (!finalTitle) {
    throw new Error(`${platform}: fallback candidate has no usable title`);
  }

  if (finalPrice == null || !Number.isFinite(finalPrice) || finalPrice <= 0) {
    throw new Error(`${platform}: fallback candidate has no valid price`);
  }

  // --------------------------------------------------------
  // MATCH DIAGNOSTICS
  // --------------------------------------------------------

  console.log(`✅ ${platform}: fallback candidate selected`);

  console.log(`   Title      : ${finalTitle}`);

  console.log(`   Price      : ₹${finalPrice}`);

  console.log(`   Score      : ${best.score.toFixed(3)}`);

  console.log(`   ID Match   : ${best.exactProductIdMatch}`);

  console.log(`   URL ID     : ${best.urlProductIdMatch}`);

  console.log(
    `   Token Match: ${best.matchedTokenCount}/${originalTokens.length}`,
  );

  console.log(`   URL        : ${finalUrl}`);

  // --------------------------------------------------------
  // RETURN STANDARD STOCKSENSE RESULT
  // --------------------------------------------------------

  return {
    platform,

    url: finalUrl,

    title: finalTitle,

    currentPrice: finalPrice,

    image: finalImage,

    rating: finalRating,

    reviewCount: finalReviews,

    availability: finalProduct?.availability ?? finalProduct?.inStock ?? true,

    inputType: "url",

    // ----------------------------------------------------
    // DIAGNOSTIC INFORMATION
    // ----------------------------------------------------

    matchConfidence: Number(best.score.toFixed(4)),

    exactProductIdMatch: Boolean(best.exactProductIdMatch),

    matchedProductId:
      best.id || extractIdFromCandidateUrl(best.candidateUrl) || null,
  };
}

function isValidTataCliqProductTitle(title, url = "") {
  if (!title) return false;

  const value = String(title).trim().toLowerCase();

  if (value.length < 8) return false;

  // Known TataCliq homepage / generic titles
  const invalidTitles = [
    "online fashion & lifestyle shopping for women, men & kids in india",
    "tata cliq",
    "tata cliq - online shopping",
  ];

  if (
    invalidTitles.some(
      (invalid) => value === invalid || value.includes(invalid),
    )
  ) {
    return false;
  }

  // Reject obvious generic site titles
  if (value.includes("online fashion") && value.includes("shopping")) {
    return false;
  }

  /*
    ----------------------------------------------------
    URL RELEVANCE
    ----------------------------------------------------
    For a TataCliq product URL, compare important
    URL tokens against the extracted title.
    ----------------------------------------------------
    */

  try {
    const pathname = new URL(url).pathname.toLowerCase();

    const urlTokens = pathname
      .replace(/^\/|\/$/g, "")
      .split("/")
      .filter(Boolean)
      .join(" ")
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(
        (token) =>
          token.length >= 3 && token !== "p" && !token.startsWith("mp"),
      );

    const titleTokens = value
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3);

    if (urlTokens.length === 0) {
      return true;
    }

    let matches = 0;

    for (const token of urlTokens) {
      if (titleTokens.includes(token)) {
        matches++;
      }
    }

    /*
        Require at least some meaningful
        relationship between URL and title.

        This prevents TataCliq's homepage
        title from passing.
        */

    return matches >= 2;
  } catch {
    return true;
  }
}

function isValidTataCliqProductImage(image) {
  if (!image) return false;

  const value = String(image).trim().toLowerCase();

  if (!value) return false;

  // TataCliq generic/site icons
  const invalidImagePatterns = [
    "icon-512x512",
    "favicon",
    "logo",
    "placeholder",
    "default-image",
    "no-image",
  ];

  if (invalidImagePatterns.some((pattern) => value.includes(pattern))) {
    return false;
  }

  /*
    TataCliq product images normally come
    from img.tatacliq.com.
    */

  if (value.includes("img.tatacliq.com")) {
    return true;
  }

  return false;
}

// ============================================================
// TATACLIQ URL TITLE FALLBACK
// ============================================================

function extractTataCliqTitleFromUrl(url) {
  try {
    const parsed = new URL(url);

    let parts = parsed.pathname.split("/").filter(Boolean);

    if (!parts.length) {
      return null;
    }

    /*
        --------------------------------------------------------
        REMOVE TATACLIQ PRODUCT-ID PATH
        --------------------------------------------------------
        Example:

        /titan-90155ap03-unisex-smart-watch/p-mp000000013280170

        becomes:

        titan-90155ap03-unisex-smart-watch
        --------------------------------------------------------
        */

    parts = parts.filter((part) => !/^p-mp/i.test(part));

    if (!parts.length) {
      return null;
    }

    let slug = parts.join(" ");

    slug = decodeURIComponent(slug)
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!slug || slug.length < 5) {
      return null;
    }

    /*
        --------------------------------------------------------
        REMOVE GENERIC PATH WORDS
        --------------------------------------------------------
        */

    slug = slug
      .replace(/\b(?:buy|online|shop|shopping|product)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    /*
        --------------------------------------------------------
        FORMAT TITLE
        --------------------------------------------------------
        */

    const words = slug.split(/\s+/);

    const formatted = words
      .map((word) => {
        /*
                    Model-like token:

                    90155ap03
                    iPhone15
                    abc123
                    */

        if (/\d/.test(word) && /[a-z]/i.test(word)) {
          return word.toUpperCase();
        }

        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");

    return formatted || null;
  } catch {
    return null;
  }
}

// ============================================================
// TATACLIQ SAFE TITLE SOURCE
// ============================================================

function getValidTataCliqTitle(url, ...sources) {
  for (const source of sources) {
    const title = firstNonEmpty(source);

    if (isValidTataCliqProductTitle(title, url)) {
      return title;
    }
  }

  /*
    --------------------------------------------------------
    URL TITLE FALLBACK
    --------------------------------------------------------
    */

  const urlTitle = extractTataCliqTitleFromUrl(url);

  if (isValidTataCliqProductTitle(urlTitle, url)) {
    console.log("🛟 TataCliq URL TITLE FALLBACK:", urlTitle);

    return urlTitle;
  }

  return null;
}

// ============================================================
// TATACLIQ SAFE IMAGE SOURCE
// ============================================================

function getValidTataCliqImage(...sources) {
  for (const source of sources) {
    const image = firstNonEmpty(source);

    if (isValidTataCliqProductImage(image)) {
      return image;
    }
  }

  /*
    IMPORTANT:
    Never return TataCliq homepage icon,
    favicon, logo or placeholder.
    */

  return null;
}

// ============================================================
// MARKETPLACE CONFIGURATION
// ============================================================
//
// Each marketplace can provide its own selectors and adapter.
// The generic scraper handles the common extraction logic.
//
// ============================================================

const MARKETPLACE_CONFIGS = {
  ajio: {
    platform: "ajio",

    host: "https://www.ajio.com",

    timeout: 18000,

    settleMs: 1200,

    selectors: {
      title: [
        "h1",

        "[data-testid='product-title']",

        ".prod-name",

        ".pdp-product-name",

        ".product-title",
      ],

      price: [
        "[data-testid='price']",
        "[data-testid='product-price']",

        ".ProductPrice",
        ".product-price",
        ".pdp-price",
        ".pdp-product-price",

        "[class*='ProductPrice']",
        "[class*='productPrice']",
        "[class*='product-price']",
        "[class*='Product-Price']",
        "[class*='selling-price']",
        "[class*='sellingPrice']",

        "[class*='price']",

        "[itemprop='price']",
      ],

      priceAttr: [
        "[itemprop='price']",
        "[itemprop='lowPrice']",

        "meta[property='product:price:amount']",
        "meta[itemprop='price']",
        "meta[property='og:price:amount']",
      ],

      image: [
        ".rilrtl-lazy-img",

        ".img-container img",

        ".rilrtl-lazy-img img",

        "img[itemprop='image']",
      ],

      imageAttr: ["meta[property='og:image']", "meta[name='twitter:image']"],

      rating: [".rating", ".avg-rating", "[data-testid='rating']"],

      reviews: [".review-count", ".reviews", "[data-testid='review-count']"],

      availability: [".out-of-stock", ".availability", ".stock-status"],
    },
  },

  meesho: {
    platform: "meesho",

    host: "https://www.meesho.com",

    timeout: 18000,

    settleMs: 1000,

    selectors: {
      title: [
        "h1",

        "[data-testid='product-title']",

        "[class*='ProductTitle']",

        "[class*='ProductDetail'] h1",
      ],

      price: [
        "[data-testid='product-price']",

        "[class*='ProductPrice']",

        "[class*='Price']",

        "h4",

        "h5",
      ],

      priceAttr: [
        "meta[property='product:price:amount']",

        "meta[itemprop='price']",
      ],

      image: ["img[alt*='product']", "img"],

      imageAttr: ["meta[property='og:image']", "meta[name='twitter:image']"],

      rating: [
        "[class*='Rating']",

        "[class*='rating']",

        "[data-testid='rating']",
      ],

      reviews: [
        "[class*='Review']",

        "[class*='review']",

        "[data-testid='review-count']",
      ],

      availability: [
        "[class*='OutOfStock']",

        "[class*='out-of-stock']",

        "[class*='Unavailable']",
      ],
    },
  },

  myntra: {
    platform: "myntra",

    host: "https://www.myntra.com",

    timeout: 18000,

    settleMs: 1000,

    selectors: {
      title: ["h1.pdp-name", ".pdp-title", "h1"],

      price: [".pdp-price strong", ".pdp-price", ".pdp-discount-container"],

      priceAttr: [
        "meta[property='product:price:amount']",

        "meta[itemprop='price']",
      ],

      image: [".image-grid-image", ".image-grid-image img", "img"],

      imageAttr: ["meta[property='og:image']", "meta[name='twitter:image']"],

      rating: [".index-overallRating", ".pdp-rating", "[class*='rating']"],

      reviews: [".index-ratingsCount", ".pdp-reviews", "[class*='review']"],

      availability: [
        ".size-buttons-select-size",

        ".pdp-soldOut",

        ".out-of-stock",
      ],
    },
  },

  nykaa: {
    platform: "nykaa",

    host: "https://www.nykaa.com",

    timeout: 18000,

    settleMs: 1200,

    selectors: {
      title: ["h1", "[data-testid='product-title']", ".css-1gc4x7i"],

      price: ["[data-at='product-price']", ".css-1jczs19", "[class*='price']"],

      priceAttr: [
        "meta[property='product:price:amount']",

        "meta[itemprop='price']",
      ],

      image: ["[data-at='product-image'] img", "img"],

      imageAttr: ["meta[property='og:image']", "meta[name='twitter:image']"],

      rating: ["[data-at='product-rating']", "[class*='rating']"],

      reviews: ["[data-at='product-reviews']", "[class*='review']"],

      availability: ["[class*='out-of-stock']", "[class*='unavailable']"],
    },
  },

  reliance: {
    platform: "reliance",

    host: "https://www.reliancedigital.in",

    timeout: 18000,

    settleMs: 1000,

    selectors: {
      title: [
        "h1",

        "[data-testid='product-title']",

        ".pdp-product-name",

        ".product-name",
      ],

      price: [
        ".pdp-price",

        ".price",

        "[data-testid='product-price']",

        "[class*='price']",
      ],

      priceAttr: [
        "meta[property='product:price:amount']",

        "meta[itemprop='price']",
      ],

      image: [".pdp-image img", ".product-image img", "img"],

      imageAttr: ["meta[property='og:image']", "meta[name='twitter:image']"],

      rating: [".rating", ".average-rating", "[class*='rating']"],

      reviews: [".review-count", "[class*='review']"],

      availability: [".out-of-stock", ".availability", "[class*='stock']"],
    },
  },

  tatacliq: {
    platform: "tatacliq",

    host: "https://www.tatacliq.com",

    timeout: 18000,

    settleMs: 1200,

    selectors: {
      title: [
        "h1",

        "[data-testid='product-title']",

        ".ProductTitle",

        "[class*='product-title']",
      ],

      price: [
        "[data-testid='price']",

        ".ProductPrice",

        "[class*='price']",

        ".pdp-price",
      ],

      priceAttr: [
        "meta[property='product:price:amount']",

        "meta[itemprop='price']",
      ],

      image: ["img"],

      imageAttr: ["meta[property='og:image']", "meta[name='twitter:image']"],

      rating: ["[class*='rating']", "[class*='Rating']"],

      reviews: ["[class*='review']", "[class*='Review']"],

      availability: [
        "[class*='out-of-stock']",

        "[class*='OutOfStock']",

        "[class*='unavailable']",
      ],
    },
  },
};

// ============================================================
// PLATFORM ALIASES
// ============================================================

const PLATFORM_ALIASES = {
  ajio: "ajio",

  ajiо: "ajio",

  meesho: "meesho",

  myntra: "myntra",

  nykaa: "nykaa",

  reliance: "reliance",

  "reliance-digital": "reliance",

  reliancedigital: "reliance",

  tatacliq: "tatacliq",

  "tata-cliq": "tatacliq",

  "tata cliq": "tatacliq",
};

// ============================================================
// PLATFORM DETECTOR
// ============================================================

function detectPlatform(url) {
  if (!url) {
    return null;
  }

  let hostname = "";

  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    hostname = String(url).toLowerCase();
  }

  if (hostname.includes("ajio")) {
    return "ajio";
  }

  if (hostname.includes("meesho")) {
    return "meesho";
  }

  if (hostname.includes("myntra")) {
    return "myntra";
  }

  if (hostname.includes("nykaa")) {
    return "nykaa";
  }

  if (hostname.includes("reliancedigital") || hostname.includes("reliance")) {
    return "reliance";
  }

  if (hostname.includes("tatacliq")) {
    return "tatacliq";
  }

  return null;
}

// ============================================================
// GET PLATFORM CONFIG
// ============================================================

function getMarketplaceConfig(platform) {
  const normalized =
    PLATFORM_ALIASES[
      String(platform || "")
        .toLowerCase()
        .trim()
    ] ||
    String(platform || "")
      .toLowerCase()
      .trim();

  return MARKETPLACE_CONFIGS[normalized] || null;
}

// ============================================================
// CREATE SCRAPER
// ============================================================
//
// IMPORTANT:
// Existing marketplace files call:
//
//     createScraper(config)
//
// Therefore this function MUST accept the configuration object
// as the first argument.
//
// ============================================================

function createScraper(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Marketplace scraper configuration is required");
  }

  const platform = String(config.platform || "")
    .toLowerCase()
    .trim();

  if (!platform) {
    throw new Error("Marketplace scraper configuration is missing platform");
  }

  /*
    ------------------------------------------------------------
    NORMALIZE CONFIGURATION
    ------------------------------------------------------------
    */

  const normalizedPlatform = PLATFORM_ALIASES[platform] || platform;

  const baseConfig = getMarketplaceConfig(normalizedPlatform);

  /*
    ------------------------------------------------------------
    MERGE EXISTING CONFIG
    ------------------------------------------------------------
    
    The marketplace-specific scraper files may already provide
    their own selectors / normalizeUrl / timeout / host etc.

    Do NOT overwrite those with generic defaults.
    ------------------------------------------------------------
    */

  const mergedConfig = {
    ...(baseConfig || {}),

    ...config,

    platform: normalizedPlatform,

    adapter: config.adapter || null,
  };

  /*
    ------------------------------------------------------------
    NORMALIZE URL HELPER
    ------------------------------------------------------------
    */

  if (typeof mergedConfig.normalizeUrl !== "function") {
    mergedConfig.normalizeUrl = function (url) {
      return normalizeUrl(url, mergedConfig.host);
    };
  }

  /*
    ------------------------------------------------------------
    SCRAPER OBJECT
    ------------------------------------------------------------
    */

  return {
    platform: normalizedPlatform,

    /*
        --------------------------------------------------------
        DIRECT SCRAPE
        --------------------------------------------------------
        */

    async directScrape(url) {
      return await directScrape(url, mergedConfig);
    },

    /*
        --------------------------------------------------------
        SEARCH FALLBACK
        --------------------------------------------------------
        */

    async searchFallback(url) {
      return await searchFallback(url, mergedConfig);
    },

    /*
        --------------------------------------------------------
        UNIVERSAL MARKETPLACE FALLBACK
        --------------------------------------------------------
        */

    async searchMarketplaceProductFallback(url) {
      if (!mergedConfig.adapter) {
        throw new Error(`${normalizedPlatform}: search adapter unavailable`);
      }

      return await searchMarketplaceProductFallback(
        url,
        normalizedPlatform,
        mergedConfig.adapter,
      );
    },

    /*
        --------------------------------------------------------
        MAIN SCRAPE
        --------------------------------------------------------
        */

    async scrape(url) {
      const normalizedUrl =
        typeof mergedConfig.normalizeUrl === "function"
          ? mergedConfig.normalizeUrl(url)
          : url;

      if (!normalizedUrl) {
        throw new Error(`Invalid ${normalizedPlatform} product URL`);
      }

      /*
            ----------------------------------------------------
            DIRECT SCRAPE
            ----------------------------------------------------
            */

      try {
        return await directScrape(normalizedUrl, mergedConfig);
      } catch (directError) {
        console.log(
          `⚠️ ${normalizedPlatform}: direct scrape failed — ${directError?.message || directError}`,
        );

        /*
                ------------------------------------------------
                UNIVERSAL SEARCH FALLBACK
                ------------------------------------------------
                */

        if (mergedConfig.adapter) {
          try {
            return await searchMarketplaceProductFallback(
              normalizedUrl,
              normalizedPlatform,
              mergedConfig.adapter,
            );
          } catch (universalFallbackError) {
            console.log(
              `⚠️ ${normalizedPlatform}: universal fallback failed — ${universalFallbackError?.message || universalFallbackError}`,
            );
          }
        }

        /*
                ------------------------------------------------
                LEGACY SEARCH FALLBACK
                ------------------------------------------------
                */

        return await searchFallback(normalizedUrl, mergedConfig);
      }
    },
  };
}
// ============================================================
// MODULE EXPORTS
// ============================================================
//
// Public API:
//
//   createScraper()
//   directScrape()
//   searchFallback()
//   searchMarketplaceProductFallback()
//   detectPlatform()
//   getMarketplaceConfig()
//
// ============================================================

module.exports = {
  createScraper,

  directScrape,

  searchFallback,

  searchMarketplaceProductFallback,

  detectPlatform,

  getMarketplaceConfig,

  MARKETPLACE_CONFIGS,

  PLATFORM_ALIASES,
};

// ============================================================
// END OF STOCKSENSE MARKETPLACE DIRECT SCRAPER
// ============================================================
