const { validateVariant } = require("./variantValidator");

const {
  ruleScore,
  calculateBrandScore,
  getBrandMatchStatus,
} = require("./ruleScorer");

const { getCanonicalTokens } = require("../../utils/attributeNormalizer");

const { REQUEST_MODES, getRequestMode } = require("./stocksenseRequestMode");

/*
=====================================================
SAFE STRING
=====================================================
*/

function safeString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

/*
=====================================================
SOURCE PRODUCT IDENTITY
=====================================================
*/

function extractProductIdentifiers(url) {
  const value = safeString(url);

  if (!value) {
    return [];
  }

  const identifiers = [];

  const add = (id) => {
    const clean = safeString(id).toLowerCase();
    if (clean && !identifiers.includes(clean)) {
      identifiers.push(clean);
    }
  };

  const myntra = value.match(/\/(\d{5,})\/buy(?:[/?#]|$)/i);
  if (myntra) {
    add(myntra[1]);
  }

  try {
    const parsed = new URL(value);
    const pid = parsed.searchParams.get("pid");
    if (pid) {
      add(pid);
    }
  } catch (_) {
    // Ignore malformed URLs.
  }

  const numericSegments = value.match(/\/(\d{5,})(?:\/|\?|#|$)/g) || [];
  for (const segment of numericSegments) {
    const match = segment.match(/(\d{5,})/);
    if (match) {
      add(match[1]);
    }
  }

  return identifiers;
}

function isExactSourceProduct(originalProduct, candidate) {
  if (!originalProduct || !candidate) {
    return false;
  }

  const sourceUrl =
    originalProduct.url ||
    originalProduct.productUrl ||
    originalProduct.sourceUrl ||
    originalProduct.inputUrl ||
    originalProduct.originalUrl;

  const candidateUrl =
    candidate.url || candidate.productUrl || candidate.landingPageUrl;

  const sourceIds = extractProductIdentifiers(sourceUrl);
  const candidateIds = extractProductIdentifiers(candidateUrl);

  if (!sourceIds.length || !candidateIds.length) {
    return false;
  }

  return sourceIds.some((id) => candidateIds.includes(id));
}

/*
=====================================================
GENERIC SEARCH STOP WORDS
=====================================================

Only remove words that carry almost no product
identity.

IMPORTANT:

"boys" and "girls" are NOT stop words.

They can be useful search intent.
=====================================================
*/

const GENERIC_STOP_WORDS = new Set([
  "for",
  "the",
  "and",
  "with",
  "of",
  "to",
  "a",
  "an",
  "in",
  "on",
  "by",
  "from",
  "this",
  "that",
  "is",
  "are",
  "was",
  "were",
  "has",
  "have",
  "new",
  "latest",
  "original",
  "online",
  "buy",
  "sale",
]);

/* =====================================================
   GENERIC ATTRIBUTE TOKENS
   =====================================================

   These describe a product attribute rather than the
   core product itself.

   Example:

       "neckless t shirts"

   Core:
       shirt

   Attribute:
       neckless

   Attribute tokens are handled separately so that a
   missing literal attribute word does not automatically
   reject an otherwise valid product.
   ===================================================== */

const GENERIC_ATTRIBUTE_GROUPS = {
  neckStyle: new Set([
    "neckless",
    "collarless",
    "nocollar",
    "no-collar",
    "roundneck",
    "round",
    "vneck",
    "v-neck",
    "polo",
    "mandarin",
    "turtleneck",
    "crewneck",
    "crew",
  ]),

  fit: new Set([
    "oversized",
    "oversize",
    "loose",
    "regular",
    "slim",
    "relaxed",
    "baggy",
    "straight",
    "skinny",
  ]),

  sleeve: new Set([
    "fullsleeve",
    "full-sleeve",
    "halfsleeve",
    "half-sleeve",
    "sleeveless",
    "shortsleeve",
    "short-sleeve",
  ]),
};

/*
=====================================================
TEXT NORMALIZATION
=====================================================
*/

function normalizeGenericText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
=====================================================
CANONICAL GENERIC TOKENS
=====================================================

IMPORTANT:

Uses the same canonical token system as the rest
of StockSense.

Therefore:

shirts  -> shirt
phones  -> phone
laptops -> laptop

This fixes the current:

"shirts" != "shirt"

bug.
=====================================================
*/

function getGenericTokens(text) {
  return getCanonicalTokens(normalizeGenericText(text)).filter(
    (token) => token.length >= 2 && !GENERIC_STOP_WORDS.has(token),
  );
}

/*
=====================================================
PRODUCT / ACCESSORY INTENT GUARD
=====================================================

Purpose:

Prevent a product search from accepting an obvious
accessory for that product.

Examples:

    Query:
        "iPhone 16"

    Candidate:
        "iPhone 16 Case"

    -> reject


    Query:
        "laptop"

    Candidate:
        "laptop stand"

    -> reject


Important:

This is intentionally generic.

It does NOT contain product-specific names.
=====================================================
*/

const ACCESSORY_TERMS = new Set([
  "case",
  "cover",
  "sleeve",
  "pouch",
  "protector",
  "screen",
  "tempered",
  "glass",
  "charger",
  "charging",
  "cable",
  "adapter",
  "dongle",
  "hub",
  "dock",
  "stand",
  "holder",
  "mount",
  "bracket",
  "strap",
  "replacement",
  "replacementpart",
  "part",
  "skin",
  "sticker",
  "wrap",
  "bag",
]);

/*
-----------------------------------------------------
TOKENIZE INTENT
-----------------------------------------------------
*/

function getIntentTokens(text) {
  return getGenericTokens(text);
}

/*
-----------------------------------------------------
CHECK WHETHER QUERY ITSELF IS AN ACCESSORY SEARCH

Examples:

    "iphone 16 case"
    "usb cable"
    "laptop charger"

These MUST NOT be rejected merely because the
candidate contains an accessory term.
-----------------------------------------------------
*/

function queryRequestsAccessory(productName) {
  const tokens = getIntentTokens(productName);

  return tokens.some((token) => ACCESSORY_TERMS.has(token));
}

/*
-----------------------------------------------------
CHECK WHETHER CANDIDATE IS AN ACCESSORY
-----------------------------------------------------
*/

function isAccessoryCandidate(productName, candidateTitle) {
  const queryTokens = getIntentTokens(productName);

  const candidateTokens = getIntentTokens(candidateTitle);

  if (queryTokens.length === 0 || candidateTokens.length === 0) {
    return false;
  }

  /*
    -------------------------------------------------
    EXPLICIT ACCESSORY QUERY
    -------------------------------------------------

    Example:

        iPhone 16 case
        laptop charger

    These are legitimate accessory searches.
    */

  if (queryRequestsAccessory(productName)) {
    return false;
  }

  const queryText = normalizeGenericText(productName);

  const candidateText = normalizeGenericText(candidateTitle);

  /*
    -------------------------------------------------
    APPAREL PROTECTION
    -------------------------------------------------

    Words such as:

        sleeve
        strap
        collar
        pocket
        fit

    are normal product attributes in clothing.

    They must NOT cause an accessory rejection.
    */

  const APPAREL_TERMS = new Set([
    "shirt",
    "tshirt",
    "t shirt",
    "dress",
    "jacket",
    "coat",
    "blazer",
    "hoodie",
    "sweatshirt",
    "sweater",
    "top",
    "kurta",
    "saree",
    "pant",
    "pants",
    "trouser",
    "jean",
    "jeans",
    "short",
    "shorts",
    "skirt",
    "ethnic",
    "apparel",
    "clothing",
  ]);

  const queryLooksLikeApparel = [...APPAREL_TERMS].some((term) =>
    queryText.includes(term),
  );

  /*
    -------------------------------------------------
    STRONG ACCESSORY PHRASES
    -------------------------------------------------
    */

  const strongAccessoryPatterns = [
    /\bphone\s+case\b/i,

    /\blaptop\s+case\b/i,

    /\btablet\s+case\b/i,

    /\bback\s+cover\b/i,

    /\bprotective\s+case\b/i,

    /\btempered\s+glass\b/i,

    /\bscreen\s+protector\b/i,

    /\blaptop\s+charger\b/i,

    /\bmobile\s+charger\b/i,

    /\bphone\s+charger\b/i,

    /\bpower\s+adapter\b/i,

    /\bcharging\s+cable\b/i,

    /\busb\s+cable\b/i,

    /\bdata\s+cable\b/i,

    /\breplacement\s+part\b/i,

    /\breplacement\s+charger\b/i,

    /\breplacement\s+battery\b/i,

    /\bphone\s+holder\b/i,

    /\bphone\s+mount\b/i,

    /\blaptop\s+stand\b/i,

    /\bmonitor\s+stand\b/i,

    /\btablet\s+stand\b/i,
  ];

  const strongAccessoryMatch = strongAccessoryPatterns.some((pattern) =>
    pattern.test(candidateText),
  );

  if (strongAccessoryMatch) {
    /*
        Apparel titles can contain words that
        superficially resemble accessories.

        Never reject clothing merely because of
        those words.
        */

    if (queryLooksLikeApparel) {
      return false;
    }

    return true;
  }

  /*
    -------------------------------------------------
    GENERIC HARD ACCESSORY TERMS
    -------------------------------------------------

    These are much safer than ambiguous words such
    as sleeve, screen, glass, charging and stand.
    */

  const HARD_ACCESSORY_TERMS = new Set([
    "case",
    "cover",
    "pouch",
    "protector",
    "charger",
    "cable",
    "adapter",
    "dongle",
    "hub",
    "dock",
    "bracket",
    "replacement",
    "replacementpart",
    "skin",
    "sticker",
    "wrap",
  ]);

  const accessoryHits = candidateTokens.filter((token) =>
    HARD_ACCESSORY_TERMS.has(token),
  );

  if (accessoryHits.length === 0) {
    return false;
  }

  /*
    -------------------------------------------------
    PRODUCT CORE OVERLAP
    -------------------------------------------------

    We still require the candidate to contain the
    requested product concept.

    This prevents unrelated products that happen
    to contain an accessory word from being rejected
    unnecessarily.
    */

  let coreMatches = 0;

  for (const token of queryTokens) {
    if (candidateTokens.includes(token)) {
      coreMatches++;
    }
  }

  const requiredCore = Math.min(2, queryTokens.length);

  if (coreMatches >= requiredCore) {
    return true;
  }

  return false;
}

/*
=====================================================
TOKEN MATCH
=====================================================
*/

function tokenMatches(queryToken, candidateTokens) {
  /*
    ---------------------------------------------
    EXACT CANONICAL MATCH
    ---------------------------------------------
    */

  if (candidateTokens.includes(queryToken)) {
    return {
      matched: true,

      exact: true,
    };
  }

  /*
    ---------------------------------------------
    COMPOUND TOKEN SUPPORT

    Example:

    query:
        ramraj

    candidate:
        ramrajcotton
    ---------------------------------------------
    */

  if (queryToken.length >= 4) {
    const compoundMatch = candidateTokens.some((candidateToken) =>
      candidateToken.includes(queryToken),
    );

    if (compoundMatch) {
      return {
        matched: true,

        exact: false,
      };
    }
  }

  return {
    matched: false,

    exact: false,
  };
}

/* =====================================================
   ATTRIBUTE DETECTION
   ===================================================== */

function getAttributeGroup(token) {
  const normalized = String(token || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  for (const [group, tokens] of Object.entries(GENERIC_ATTRIBUTE_GROUPS)) {
    for (const attribute of tokens) {
      const normalizedAttribute = String(attribute)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "");

      if (normalized === normalizedAttribute) {
        return group;
      }
    }
  }

  return null;
}

/* =====================================================
   SEPARATE CORE TOKENS FROM ATTRIBUTE TOKENS
   ===================================================== */

function splitGenericTokens(tokens) {
  const coreTokens = [];
  const attributeTokens = [];

  for (const token of tokens) {
    const group = getAttributeGroup(token);

    if (group) {
      attributeTokens.push({
        token,
        group,
      });
    } else {
      coreTokens.push(token);
    }
  }

  return {
    coreTokens,
    attributeTokens,
  };
}

/*
=====================================================
WEIGHTED GENERIC INTENT
=====================================================

We now score CANONICAL tokens.

Examples:

"ramraj shirts"

becomes:

ramraj
shirt

Candidate:

"Ramraj Men Formal Shirt"

becomes:

ramraj
men
formal
shirt

Both important query concepts match.
=====================================================
*/

/* =====================================================
   ATTRIBUTE-AWARE GENERIC INTENT
   ===================================================== */

function calculateGenericIntent(productName, candidateTitle) {
  const allQueryTokens = getGenericTokens(productName);

  const candidateTokens = getGenericTokens(candidateTitle);

  if (allQueryTokens.length === 0) {
    return {
      score: 0,

      coverage: 0,

      exactCoverage: 0,

      matchedTokens: [],

      missingTokens: [],

      coreMatchedTokens: [],

      coreMissingTokens: [],

      attributeTokens: [],

      matchedAttributes: [],

      missingAttributes: [],
    };
  }

  /* -------------------------------------------------
       Separate core product tokens and attributes
       ------------------------------------------------- */

  const { coreTokens, attributeTokens } = splitGenericTokens(allQueryTokens);

  let totalWeight = 0;
  let matchedWeight = 0;
  let exactWeight = 0;

  const matchedTokens = [];
  const missingTokens = [];

  const coreMatchedTokens = [];
  const coreMissingTokens = [];

  const matchedAttributes = [];
  const missingAttributes = [];

  /* =================================================
       CORE PRODUCT TOKENS
       ================================================= */

  coreTokens.forEach((token, index) => {
    const weight = index === 0 ? 3 : 2;

    totalWeight += weight;

    const result = tokenMatches(token, candidateTokens);

    if (result.matched) {
      matchedWeight += weight;

      matchedTokens.push(token);

      coreMatchedTokens.push(token);

      if (result.exact) {
        exactWeight += weight;
      }
    } else {
      missingTokens.push(token);

      coreMissingTokens.push(token);
    }
  });

  /* =================================================
       ATTRIBUTE TOKENS
       =================================================

       Attributes are important, but they are NOT treated
       as hard mandatory title tokens.

       This prevents:

           "neckless t shirts"

       from rejecting every T-shirt simply because the
       title does not literally contain "neckless".
       ================================================= */

  for (const attribute of attributeTokens) {
    const result = tokenMatches(attribute.token, candidateTokens);

    if (result.matched) {
      matchedAttributes.push({
        token: attribute.token,
        group: attribute.group,
      });

      matchedTokens.push(attribute.token);
    } else {
      missingAttributes.push({
        token: attribute.token,
        group: attribute.group,
      });

      /*
       * Do NOT add attribute tokens to
       * missingTokens.
       *
       * They are tracked separately.
       */
    }
  }

  /* =================================================
       ATTRIBUTE BONUS
       ================================================= */

  let attributeBonus = 0;

  if (attributeTokens.length > 0) {
    const matchedAttributeCount = matchedAttributes.length;

    if (matchedAttributeCount > 0) {
      attributeBonus = Math.min(20, matchedAttributeCount * 10);
    }
  }

  /* =================================================
       CORE COVERAGE
       ================================================= */

  const coverage = totalWeight > 0 ? matchedWeight / totalWeight : 0;

  const exactCoverage = totalWeight > 0 ? exactWeight / totalWeight : 0;

  /*
   * Core intent remains the primary signal.
   */

  let score = Math.round(coverage * 60 + exactCoverage * 40);

  /*
   * Attribute evidence improves ranking but does not
   * become a hard rejection condition.
   */

  score = Math.min(100, score + attributeBonus);

  return {
    score,

    coverage,

    exactCoverage,

    matchedTokens,

    missingTokens,

    coreMatchedTokens,

    coreMissingTokens,

    attributeTokens,

    matchedAttributes,

    missingAttributes,
  };
}

/*
=====================================================
GENERIC INTENT GATE
=====================================================

The goal is:

GOOD:

ramraj shirts
    -> Ramraj ... Shirt

ramraj shirts for boys
    -> Ramraj Boys ... Shirt


BAD:

ramraj shirts
    -> unrelated shirt from another brand

baggy pants for boys
    -> unrelated regular pants

=====================================================
*/

/* =====================================================
   ATTRIBUTE-AWARE GENERIC INTENT GATE
   ===================================================== */

function passesGenericIntent(intent) {
  const {
    score,

    matchedTokens,

    coreMatchedTokens,

    coreMissingTokens,
  } = intent;

  /* -------------------------------------------------
       Nothing matched
       ------------------------------------------------- */

  if (matchedTokens.length === 0) {
    return false;
  }

  /* -------------------------------------------------
       CORE PRODUCT TOKEN CHECK
       -------------------------------------------------

       Attributes can be missing.

       Core product concepts cannot.

       Example:

           "neckless t shirts"

       Candidate:

           "HELLCAT Women Printed T-shirt"

       Core:
           shirt ✅

       Attribute:
           neckless — not present

       Result:
           candidate remains eligible.
       ------------------------------------------------- */

  if (coreMatchedTokens.length === 0) {
    return false;
  }

  /*
   * If a core token is missing, retain the existing
   * strict behavior.
   */

  if (coreMissingTokens.length > 0) {
    return false;
  }

  /* -------------------------------------------------
       SINGLE CORE PRODUCT TOKEN
       ------------------------------------------------- */

  if (coreMatchedTokens.length === 1) {
    return score >= 45;
  }

  /* -------------------------------------------------
       MULTIPLE CORE PRODUCT TOKENS
       ------------------------------------------------- */

  return score >= 55;
}

/*
=====================================================
TITLE NORMALIZATION FOR DEDUPLICATION
=====================================================
*/

function normalizeTitleForDedup(title) {
  return normalizeGenericText(title)
    .replace(
      /\b\d+(?:\.\d+)?\s*(kg|kgs|g|gm|gram|grams|ml|l|litre|litres)\b/g,
      " ",
    )
    .replace(/\b\d+\s*x\s*\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
=====================================================
DEDUP KEY
=====================================================
*/

function buildDedupKey(product) {
  const platform = String(product?.platform || "unknown")
    .toLowerCase()
    .trim();

  /*
    -------------------------------------------------
    URL IS THE STRONGEST UNIQUE IDENTIFIER
    -------------------------------------------------

    Two marketplace listings can have:

        same title
        different model
        different variant
        different product URL

    Therefore URL must be preferred whenever present.
    -------------------------------------------------
    */

  const rawUrl = String(
    product?.url || product?.productUrl || product?.landingPageUrl || "",
  )
    .trim()
    .toLowerCase();

  if (rawUrl) {
    let normalizedUrl = rawUrl;

    /*
        Remove search/tracking parameters.

        Keep the actual product path/identifier.
        */

    try {
      const parsed = new URL(rawUrl);

      normalizedUrl = `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, "");
    } catch (_) {
      normalizedUrl = rawUrl.split("?")[0].split("#")[0].replace(/\/+$/, "");
    }

    return `${platform}::url::${normalizedUrl}`;
  }

  /*
    -------------------------------------------------
    FALLBACK TO NORMALIZED TITLE
    -------------------------------------------------
    */

  const title = normalizeTitleForDedup(product?.title);

  return `${platform}::title::${title}`;
}

/*
=====================================================
DEDUPLICATION
=====================================================
*/

function deduplicateCandidates(candidates) {
  const map = new Map();

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate) {
      continue;
    }

    const key = buildDedupKey(candidate);

    const existing = map.get(key);

    /*
        ---------------------------------------------
        FIRST CANDIDATE
        ---------------------------------------------
        */

    if (!existing) {
      map.set(key, candidate);

      continue;
    }

    /*
        ---------------------------------------------
        KEEP HIGHER RULE SCORE
        ---------------------------------------------
        */

    const candidateScore = Number(candidate.ruleScore || 0);

    const existingScore = Number(existing.ruleScore || 0);

    if (candidateScore > existingScore) {
      map.set(key, candidate);

      continue;
    }

    /*
        ---------------------------------------------
        SAME SCORE
        ---------------------------------------------
        */

    if (candidateScore === existingScore) {
      /*
            Prefer a candidate with an actual URL.
            */

      const candidateUrl = Boolean(
        candidate.url || candidate.productUrl || candidate.landingPageUrl,
      );

      const existingUrl = Boolean(
        existing.url || existing.productUrl || existing.landingPageUrl,
      );

      if (candidateUrl && !existingUrl) {
        map.set(key, candidate);
      }
    }
  }

  return Array.from(map.values());
}

/*
=====================================================
GENERIC RANKING
=====================================================
*/

function rankGenericCandidates(candidates) {
  return candidates
    .map((candidate) => {
      const intentScore = candidate.genericIntent?.score || 0;

      const rule = candidate.ruleScore || 0;

      /*
                -------------------------------------
                INTENT IS PRIMARY

                Rule score remains secondary.

                -------------------------------------
                */

      const rankingScore = intentScore * 0.65 + rule * 0.35;

      return {
        ...candidate,

        rankingScore,
      };
    })
    .sort((a, b) => (b.rankingScore || 0) - (a.rankingScore || 0));
}

/*
=====================================================
COLLECT CANDIDATES
=====================================================

REQUEST MODES:

GENERIC
    Broad product discovery.

BRANDED
    Brand is mandatory, but variants are allowed.

SPECIFIC
    Exact product / configuration discovery.

IMPORTANT:

Do NOT use:

    brand exists -> SPECIFIC

because:

    "boost energy drink"

is a BRANDED search, not an exact SKU search.

=====================================================
*/

function collectCandidates(originalProduct, products) {
  let candidates = [];

  /*
    =================================================
    REQUEST MODE
    =================================================
    */

  const productName = String(originalProduct?.productName || "").trim();

  const requestMode = getRequestMode(originalProduct);

  const isGenericSearch = requestMode === REQUEST_MODES.GENERIC;

  const isBrandedSearch = requestMode === REQUEST_MODES.BRANDED;

  const isSpecificSearch = requestMode === REQUEST_MODES.SPECIFIC;

  const isVisualSearch = requestMode === REQUEST_MODES.VISUAL;

  console.log(`🔎 Search type: ${requestMode}`);

  /*
    =================================================
    CANDIDATE THRESHOLD
    =================================================

    GENERIC
        Lower threshold because ranking is controlled
        by generic intent.

    BRANDED
        Moderate threshold because legitimate variants
        can have different product wording.

    SPECIFIC
        Moderate initial threshold.

        Final strong-candidate gate remains 70.
    =================================================
    */

  const MIN_SCORE = isGenericSearch
    ? 15
    : isVisualSearch
      ? 25
      : isSpecificSearch
        ? 20
        : 40;

  console.log(`🎯 Candidate threshold: ${MIN_SCORE}`);

  /*
    =================================================
    SCORE PRODUCTS
    =================================================
    */

  for (const product of Array.isArray(products) ? products : []) {
    if (!product) {
      continue;
    }

    /*
        =============================================
        GENERIC INTENT
        =============================================
        */

    let genericIntent = null;

    if (isGenericSearch) {
      genericIntent = calculateGenericIntent(productName, product.title);

      if (!passesGenericIntent(genericIntent)) {
        console.log(`❌ Generic intent reject: ${product.title}`);

        console.log(
          `   Matched: ${genericIntent.matchedTokens.join(", ") || "none"}`,
        );

        console.log(
          `   Missing: ${genericIntent.missingTokens.join(", ") || "none"}`,
        );

        continue;
      }
    }

    /*
        =============================================
        EXACT SOURCE PRODUCT MATCH
        =============================================
        */

    const exactSourceMatch = isExactSourceProduct(originalProduct, product);

    /*
        =============================================
        ACCESSORY GUARD
        =============================================

        Prevent:

            iPhone 16
                ->
            iPhone 16 Case

        while still allowing:

            iPhone 16 Case
                ->
            explicit case search
        =============================================
        */

    if (isAccessoryCandidate(productName, product.title)) {
      console.log(`❌ Accessory mismatch: ${product.title}`);

      continue;
    }

    /*
        =============================================
        VARIANT VALIDATION
        =============================================
        */

    if (!validateVariant(originalProduct, product)) {
      console.log(`❌ Variant rejected: ${product.title}`);

      continue;
    }

    /*
=====================================================
RULE SCORE
=====================================================
*/

    let score = 0;

    /*
        =====================================================
        STANDARD TEXT SEARCH
        =====================================================
        */

    if (!isVisualSearch) {
      score = ruleScore(
        originalProduct,

        product,
      );
    } else {
      /*
        =====================================================
        VISUAL SEARCH
        =====================================================
        
        For visual searches:
        
            brand is SOFT evidence
        
        because another marketplace may omit the brand
        from its product title.
        
        Therefore we deliberately remove the hard brand
        requirement from the base rule score.
        
        Product identity remains important.
        
        =====================================================
        */
      const visualScoringProduct = {
        ...originalProduct,

        brand: "",
      };

      const baseScore = ruleScore(
        visualScoringProduct,

        product,
      );

      const visualBrandScore = calculateBrandScore(
        originalProduct.brand,

        product.title,
      );

      /*
            ---------------------------------------------
            Brand evidence is a BONUS only.
            It is NOT a mandatory gate.
            ---------------------------------------------
            */

      score = Math.min(
        100,

        baseScore + (visualBrandScore > 0 ? 20 : 0),
      );

      console.log(
        `👁️ Visual scoring: base=${baseScore}, brandBonus=${
          visualBrandScore > 0 ? 20 : 0
        }`,
      );
    }

    const brandMatchStatus = originalProduct?.brand
      ? getBrandMatchStatus(
          originalProduct.brand,
          product.title,
          product.brand ||
            product.brandName ||
            product.brandLabel ||
            product.brand_name ||
            "",
          originalProduct.productName || "",
        )
      : "NOT_REQUESTED";

    console.log(`🏷️ Brand evidence: ${product.title} -> ${brandMatchStatus}`);

    /*
        =============================================
        BASIC SCORE GATE
        =============================================
        */

    if (score < MIN_SCORE && !exactSourceMatch) {
      console.log(`❌ Weak candidate: ${product.title} | score=${score}`);

      continue;
    }

    /*
        =============================================
        BRANDED HARD IDENTITY GATE
        =============================================

        A BRANDED request requires the requested brand.

        Example:

            Requested:
                Boost Energy Drink

            Candidate:
                Healthoxide Energy Boost Drink

        Rule scorer now gives this candidate:

            Brand Score = 0

        Therefore it never reaches this stage.

        We additionally keep the branded threshold
        strong enough to prevent a title containing only
        the brand token from entering the AI queue.

        Example:

            "Boost"

        is not enough for:

            "Boost Energy Drink"

        =============================================
        */

    if (isBrandedSearch) {
      const BRANDED_MIN_SCORE = 55;

      if (
        !exactSourceMatch &&
        (brandMatchStatus !== "MATCH" || score < BRANDED_MIN_SCORE)
      ) {
        console.log(
          `❌ Weak/wrong branded candidate: ${product.title} | brand=${brandMatchStatus} | score=${score}`,
        );

        continue;
      }
    }

    /*
        =============================================
        STORE CANDIDATE
        =============================================
        */

    const exactSourceProduct = isExactSourceProduct(originalProduct, product);

    candidates.push({
      ...product,

      ruleScore: exactSourceProduct ? 100 : score,

      exactProductIdMatch: exactSourceProduct,

      urlProductIdMatch: exactSourceProduct,

      genericIntent,

      requestMode,
    });
  }

  /*
    =================================================
    DEDUPLICATION
    =================================================
    */

  const beforeDedup = candidates.length;

  candidates = deduplicateCandidates(candidates);

  console.log(
    `🧹 Candidate deduplication: ${beforeDedup} → ${candidates.length}`,
  );

  /*
    =================================================
    RANK
    =================================================
    */

  if (isGenericSearch) {
    candidates = rankGenericCandidates(candidates);
  } else {
    candidates.sort((a, b) => {
      const scoreDifference = (b.ruleScore || 0) - (a.ruleScore || 0);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const titleA = String(a.title || "");

      const titleB = String(b.title || "");

      return titleA.localeCompare(titleB);
    });
  }

  console.log(`🎯 Candidate Collector: ${candidates.length} strong candidates`);

  /*
    =================================================
    MAX CANDIDATES
    =================================================

    GENERIC / BRANDED:
        10

    SPECIFIC:
        8
    =================================================
    */

  const MAX_CANDIDATES = isGenericSearch || isBrandedSearch ? 10 : 8;

  let selected = [];

  /*
   =====================================================
   SPECIFIC SEARCH
   =====================================================
  
   SPECIFIC means:
  
       The user gave a specific product/configuration.
  
   At this stage we should NOT require deterministic
   proof of exact identity.
  
   Instead:
  
       1. Remove clearly weak candidates
       2. Keep the strongest relevant candidates
       3. Send them to AI verification
  
   AI is responsible for deciding:
  
       EXACT
       RELATED
       IRRELEVANT
  
   This is especially important for cross-marketplace
   searches where the requested brand/model may be absent
   from another marketplace title.
  
   =====================================================
   */

  if (isSpecificSearch) {
    /*
        =====================================================
        SPECIFIC SEARCH HANDOFF
        =====================================================

        Exact source URL/product-ID matches are always kept
        first. Then strong candidates are distributed across
        marketplaces so one platform cannot consume the whole
        verification queue.
        =====================================================
        */

    const STRONG_SCORE = 45;

    const exactCandidates = candidates.filter(
      (candidate) =>
        candidate.exactSourceMatch === true ||
        candidate.exactProductIdMatch === true ||
        candidate.urlProductIdMatch === true,
    );

    const strongCandidates = candidates.filter(
      (candidate) =>
        (candidate.ruleScore || 0) >= STRONG_SCORE &&
        !exactCandidates.includes(candidate),
    );

    selected.push(...exactCandidates.slice(0, MAX_CANDIDATES));

    if (selected.length < MAX_CANDIDATES) {
      const platformGroups = {};

      for (const candidate of strongCandidates) {
        const platform = candidate.platform || "Unknown";

        if (!platformGroups[platform]) {
          platformGroups[platform] = [];
        }

        platformGroups[platform].push(candidate);
      }

      const platforms = Object.keys(platformGroups);

      platforms.sort(
        (a, b) =>
          (platformGroups[b][0]?.ruleScore || 0) -
          (platformGroups[a][0]?.ruleScore || 0),
      );

      for (const platform of platforms) {
        if (selected.length >= MAX_CANDIDATES) {
          break;
        }

        const candidate = platformGroups[platform].shift();

        if (candidate) {
          selected.push(candidate);
        }
      }

      while (selected.length < MAX_CANDIDATES) {
        let addedThisRound = false;

        for (const platform of platforms) {
          if (selected.length >= MAX_CANDIDATES) {
            break;
          }

          const group = platformGroups[platform];

          if (!Array.isArray(group) || group.length === 0) {
            continue;
          }

          const candidate = group.shift();

          if (candidate) {
            selected.push(candidate);
            addedThisRound = true;
          }
        }

        if (!addedThisRound) {
          break;
        }
      }
    }
  } else if (isBrandedSearch) {
    /*
    =====================================================
    BRANDED SEARCH
    =====================================================
    */
    const platformGroups = {};

    for (const candidate of candidates) {
      const platform = candidate.platform || "Unknown";

      if (!platformGroups[platform]) {
        platformGroups[platform] = [];
      }

      platformGroups[platform].push(candidate);
    }

    const platforms = Object.keys(platformGroups);

    platforms.sort(
      (a, b) =>
        (platformGroups[b][0]?.ruleScore || 0) -
        (platformGroups[a][0]?.ruleScore || 0),
    );

    /*
        ---------------------------------------------
        FIRST PASS
        One candidate per platform
        ---------------------------------------------
        */

    for (const platform of platforms) {
      if (selected.length >= MAX_CANDIDATES) {
        break;
      }

      const candidate = platformGroups[platform].shift();

      if (candidate) {
        selected.push(candidate);
      }
    }

    /*
        ---------------------------------------------
        SECOND PASS
        Round-robin additional variants
        ---------------------------------------------
        */

    while (selected.length < MAX_CANDIDATES) {
      let addedThisRound = false;

      for (const platform of platforms) {
        if (selected.length >= MAX_CANDIDATES) {
          break;
        }

        const group = platformGroups[platform];

        if (!Array.isArray(group) || group.length === 0) {
          continue;
        }

        const candidate = group.shift();

        if (candidate) {
          selected.push(candidate);

          addedThisRound = true;
        }
      }

      if (!addedThisRound) {
        break;
      }
    }
  } else if (isVisualSearch) {
    /*
    =====================================================
    VISUAL SEARCH
    =====================================================
    */
    const platformGroups = {};

    for (const candidate of candidates) {
      const platform = candidate.platform || "Unknown";

      if (!platformGroups[platform]) {
        platformGroups[platform] = [];
      }

      platformGroups[platform].push(candidate);
    }

    const platforms = Object.keys(platformGroups);

    platforms.sort(
      (a, b) =>
        (platformGroups[b][0]?.ruleScore || 0) -
        (platformGroups[a][0]?.ruleScore || 0),
    );

    /*
        ---------------------------------------------
        FIRST PASS
        One visually relevant candidate per platform
        ---------------------------------------------
        */

    for (const platform of platforms) {
      if (selected.length >= MAX_CANDIDATES) {
        break;
      }

      const candidate = platformGroups[platform].shift();

      if (candidate) {
        selected.push(candidate);
      }
    }

    /*
        ---------------------------------------------
        SECOND PASS
        Round-robin additional visual candidates
        ---------------------------------------------
        */

    while (selected.length < MAX_CANDIDATES) {
      let addedThisRound = false;

      for (const platform of platforms) {
        if (selected.length >= MAX_CANDIDATES) {
          break;
        }

        const group = platformGroups[platform];

        if (!Array.isArray(group) || group.length === 0) {
          continue;
        }

        const candidate = group.shift();

        if (candidate) {
          selected.push(candidate);

          addedThisRound = true;
        }
      }

      if (!addedThisRound) {
        break;
      }
    }
  } else {
    /*
    =====================================================
    GENERIC SEARCH
    =====================================================
    */
    const platformGroups = {};

    for (const candidate of candidates) {
      const platform = candidate.platform || "Unknown";

      if (!platformGroups[platform]) {
        platformGroups[platform] = [];
      }

      platformGroups[platform].push(candidate);
    }

    const platforms = Object.keys(platformGroups);

    platforms.sort(
      (a, b) =>
        (platformGroups[b][0]?.rankingScore || 0) -
        (platformGroups[a][0]?.rankingScore || 0),
    );

    /*
        ---------------------------------------------
        FIRST PASS
        One candidate per platform
        ---------------------------------------------
        */

    for (const platform of platforms) {
      if (selected.length >= MAX_CANDIDATES) {
        break;
      }

      const candidate = platformGroups[platform].shift();

      if (candidate) {
        selected.push(candidate);
      }
    }

    /*
        ---------------------------------------------
        SECOND PASS
        Round-robin additional candidates
        ---------------------------------------------
        */

    while (selected.length < MAX_CANDIDATES) {
      let addedThisRound = false;

      for (const platform of platforms) {
        if (selected.length >= MAX_CANDIDATES) {
          break;
        }

        const group = platformGroups[platform];

        if (!Array.isArray(group) || group.length === 0) {
          continue;
        }

        const candidate = group.shift();

        if (candidate) {
          selected.push(candidate);

          addedThisRound = true;
        }
      }

      if (!addedThisRound) {
        break;
      }
    }
  }

  /*
    =================================================
    FINAL SORT
    =================================================

    Keep generic candidates ranked by generic ranking.

    Keep branded/specific candidates ranked by ruleScore.
    =================================================
    */

  selected.sort((a, b) => {
    const scoreA = isGenericSearch ? a.rankingScore || 0 : a.ruleScore || 0;

    const scoreB = isGenericSearch ? b.rankingScore || 0 : b.ruleScore || 0;

    return scoreB - scoreA;
  });

  /*
    =================================================
    DEBUG
    =================================================
    */

  const counts = {};

  for (const product of selected) {
    const platform = product.platform || "Unknown";

    counts[platform] = (counts[platform] || 0) + 1;
  }

  console.log(`🎯 Selected ${selected.length} candidates for AI`);

  console.log("📊 AI candidates by platform:");

  for (const [platform, count] of Object.entries(counts)) {
    console.log(`   ${platform}: ${count}`);
  }

  /*
    =================================================
    GENERIC DEBUG
    =================================================
    */

  if (isGenericSearch) {
    for (const candidate of selected) {
      console.log(`   ⭐ ${candidate.platform}: ${candidate.title}`);

      console.log(`      Intent Score: ${candidate.genericIntent?.score ?? 0}`);

      console.log(
        `      Matched Tokens: ${
          candidate.genericIntent?.matchedTokens?.join(", ") || "none"
        }`,
      );

      console.log(
        `      Missing Tokens: ${
          candidate.genericIntent?.missingTokens?.join(", ") || "none"
        }`,
      );

      console.log(`      Ranking Score: ${candidate.rankingScore ?? 0}`);

      console.log(`      Rule Score: ${candidate.ruleScore ?? 0}`);
    }
  }

  /*
    =================================================
    BRANDED DEBUG
    =================================================
    */

  if (isBrandedSearch) {
    for (const candidate of selected) {
      console.log(`   🏷️ ${candidate.platform}: ${candidate.title}`);

      console.log(`      Rule Score: ${candidate.ruleScore ?? 0}`);
    }
  }

  /* 
=================================================
VISUAL DEBUG
=================================================
*/

  if (isVisualSearch) {
    for (const candidate of selected) {
      console.log(`   👁️ ${candidate.platform}: ${candidate.title}`);

      console.log(`      Visual Rule Score: ${candidate.ruleScore ?? 0}`);

      console.log(
        `      Source Brand: ${
          originalProduct?.sourceBrandLabel || originalProduct?.brand || "none"
        }`,
      );

      console.log(`      Color: ${originalProduct?.color || "none"}`);

      console.log(
        `      Product Type: ${originalProduct?.productName || "none"}`,
      );
    }
  }

  return selected;
}

module.exports = {
  collectCandidates,

  normalizeGenericText,

  getGenericTokens,

  tokenMatches,

  calculateGenericIntent,

  passesGenericIntent,

  isAccessoryCandidate,

  queryRequestsAccessory,

  normalizeTitleForDedup,

  buildDedupKey,

  deduplicateCandidates,

  rankGenericCandidates,

  extractProductIdentifiers,

  isExactSourceProduct,
};
