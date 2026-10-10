const groq = require("./groq");

const {
  REQUEST_MODES,
  getRequestMode,
} = require("../search/stocksenseRequestMode");

/*
=========================================================
GROQ REQUEST SAFETY SETTINGS
=========================================================

These settings prevent a single AI request from hanging
the StockSense pipeline for an unlimited amount of time.

IMPORTANT:
These limits affect ONLY the external Groq request.

They do NOT change product matching rules.
=========================================================
*/

const GROQ_MATCH_TIMEOUT_MS = 6000;

/*
=========================================================
CREATE GROQ REQUEST WITH HARD TIMEOUT
=========================================================
*/

async function createGroqMatchRequest(requestBody) {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, GROQ_MATCH_TIMEOUT_MS);

  try {
    return await groq.chat.completions.create(requestBody, {
      signal: controller.signal,
    });
  } catch (error) {
    /*
        ---------------------------------------------
        CONVERT ABORT/TIMEOUT INTO A CLEAR ERROR
        ---------------------------------------------
        */

    if (
      error?.name === "AbortError" ||
      error?.code === "ABORT_ERR" ||
      controller.signal.aborted
    ) {
      const timeoutError = new Error(
        `Groq product matching request timed out after ${GROQ_MATCH_TIMEOUT_MS}ms`,
      );

      timeoutError.code = "GROQ_MATCH_TIMEOUT";

      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/*
=========================================================
EXTRACT VALID JSON OBJECT FROM AI RESPONSE
=========================================================
*/

function extractJSONObject(text) {
  if (!text || typeof text !== "string") {
    throw new Error("AI returned empty response");
  }

  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  /*
    =====================================================
    DIRECT JSON PARSE
    =====================================================
    */

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Continue with extraction.
  }

  /*
    =====================================================
    FIND FIRST JSON OBJECT
    =====================================================
    */

  const start = cleaned.indexOf("{");

  if (start === -1) {
    throw new Error("AI response does not contain a JSON object");
  }

  let depth = 0;

  let inString = false;

  let escaped = false;

  for (let i = start; i < cleaned.length; i++) {
    const char = cleaned[i];

    /*
        =========================================
        ESCAPE HANDLING
        =========================================
        */

    if (char === "\\" && !escaped) {
      escaped = true;

      continue;
    }

    /*
        =========================================
        QUOTE HANDLING
        =========================================
        */

    if (char === '"' && !escaped) {
      inString = !inString;
    }

    escaped = false;

    /*
        =========================================
        IGNORE BRACES INSIDE STRINGS
        =========================================
        */

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth++;
    }

    if (char === "}") {
      depth--;
    }

    /*
        =========================================
        COMPLETE OBJECT FOUND
        =========================================
        */

    if (depth === 0) {
      const jsonText = cleaned.substring(start, i + 1);

      try {
        return JSON.parse(jsonText);
      } catch (err) {
        throw new Error(`Invalid JSON returned by AI: ${err.message}`);
      }
    }
  }

  throw new Error("AI returned incomplete JSON object");
}

/*
=========================================================
VALIDATE AI MATCH RESULT
=========================================================
*/

function validateMatchResult(result) {
  if (!result || typeof result !== "object") {
    throw new Error("AI result is not an object");
  }

  const allowedTypes = ["exact", "related", "irrelevant"];

  if (!allowedTypes.includes(result.matchType)) {
    throw new Error(`Invalid matchType: ${result.matchType}`);
  }

  const confidence = Number(result.confidence);

  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
    throw new Error(`Invalid confidence: ${result.confidence}`);
  }

  return {
    matchType: result.matchType,

    confidence,

    reason:
      typeof result.reason === "string" ? result.reason : "No reason provided",
  };
}

/*
=========================================================
TEXT NORMALIZATION
=========================================================
*/

function normalizeIdentityText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
=========================================================
CANONICAL IDENTITY TOKEN
=========================================================

Small normalization only.

We do NOT use aggressive synonyms because exact matching
must remain conservative.
=========================================================
*/

function canonicalIdentityToken(token) {
  let value = String(token || "")
    .toLowerCase()
    .trim();

  if (!value) {
    return "";
  }

  /*
    ---------------------------------------------
    COMMON SINGULAR / PLURAL NORMALIZATION
    ---------------------------------------------
    */

  if (value === "watts") {
    value = "watt";
  }

  if (value === "burners") {
    value = "burner";
  }

  if (value === "heaters") {
    value = "heater";
  }

  if (value === "plates") {
    value = "plate";
  }

  if (value === "phones") {
    value = "phone";
  }

  if (value === "laptops") {
    value = "laptop";
  }

  if (value.length > 5 && value.startsWith("electr")) {
    value = "electric";
  }

  return value;
}

/*
=========================================================
STOP WORDS FOR SPECIFIC TITLE COMPARISON
=========================================================
*/

const IDENTITY_STOP_WORDS = new Set([
  "the",
  "and",
  "with",
  "for",
  "from",
  "this",
  "that",
  "new",
  "original",
  "online",
  "buy",
  "sale",
  "best",
  "offer",
  "offers",
  "pack",
  "piece",
  "pieces",
  "free",
  "home",
  "use",
  "using",
  "available",
  "product",
]);

/*
=========================================================
GET IDENTITY TOKENS
=========================================================
*/

function getIdentityTokens(value) {
  return normalizeIdentityText(value)
    .split(/\s+/)
    .map(canonicalIdentityToken)
    .filter(
      (token) => token && token.length >= 2 && !IDENTITY_STOP_WORDS.has(token),
    );
}

/*
=========================================================
GET PRODUCT IDENTITY TEXT
=========================================================
*/

function getProductIdentityText(product) {
  if (!product || typeof product !== "object") {
    return "";
  }

  return [
    product.brand,

    product.productName,

    product.model,

    product.variant,

    product.weight,

    product.flavour,

    product.color,

    product.storage,

    product.ram,
  ]
    .filter(
      (value) =>
        value !== null && value !== undefined && String(value).trim() !== "",
    )
    .join(" ");
}

/*
=========================================================
TITLE SIMILARITY
=========================================================

Used only as a final safety check for SPECIFIC exact
matches.

High similarity means the candidate title is genuinely
close to the requested identity.

It does NOT prove exact identity by itself.
=========================================================
*/

function calculateIdentitySimilarity(productA, productB) {
  const tokensA = getIdentityTokens(getProductIdentityText(productA));

  const tokensB = new Set(
    getIdentityTokens(
      [
        productB?.brand,
        productB?.productName,
        productB?.title,
        productB?.model,
        productB?.variant,
        productB?.weight,
        productB?.flavour,
        productB?.color,
        productB?.storage,
        productB?.ram,
      ]
        .filter(Boolean)
        .join(" "),
    ),
  );

  if (tokensA.length === 0 || tokensB.size === 0) {
    return 0;
  }

  const uniqueA = [...new Set(tokensA)];

  let overlap = 0;

  for (const token of uniqueA) {
    if (tokensB.has(token)) {
      overlap++;
    }
  }

  return overlap / uniqueA.length;
}

/*
=========================================================
STRONG IDENTITY ANCHORS
=========================================================

These are much stronger than ordinary descriptive words.

Examples:

model
sku
productId
mpn
asin
ean
upc

We only treat an anchor as strong when it exists in BOTH
products and matches exactly after normalization.
=========================================================
*/

const STRONG_IDENTITY_FIELDS = [
  "model",

  "sku",

  "productId",

  "productID",

  "mpn",

  "asin",

  "ean",

  "upc",
];

function normalizeAnchor(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function hasMatchingStrongIdentityAnchor(productA, productB) {
  for (const field of STRONG_IDENTITY_FIELDS) {
    const valueA = normalizeAnchor(productA?.[field]);

    const valueB = normalizeAnchor(productB?.[field]);

    if (valueA && valueB && valueA === valueB) {
      return true;
    }
  }

  return false;
}

/*
=========================================================
DETERMINE WHETHER PRODUCT B HAS A DISTINCT VARIANT
=========================================================
*/

function hasExplicitConflictingAttribute(productA, productB) {
  const fields = [
    "model",

    "storage",

    "ram",

    "weight",

    "flavour",

    "variant",

    "color",
  ];

  for (const field of fields) {
    const a = canonicalIdentityToken(productA?.[field]);

    const b = canonicalIdentityToken(productB?.[field]);

    if (a && b && a !== b) {
      return true;
    }
  }

  return false;
}

/*
=========================================================
SPECIFIC EXACT EVIDENCE
=========================================================

Rules:

1. A matching SKU/model/MPN/etc. is strong evidence.

2. Without a strong identity anchor, the titles must be
   very close.

3. A merely similar product description is NOT enough.

This is the final deterministic safety net after AI.
=========================================================
*/

function hasStrongSpecificExactEvidence(productA, productB) {
  if (hasExplicitConflictingAttribute(productA, productB)) {
    return false;
  }

  /*
    ---------------------------------------------
    STRONG IDENTITY ANCHOR
    ---------------------------------------------
    */

  if (hasMatchingStrongIdentityAnchor(productA, productB)) {
    return true;
  }

  /*
    ---------------------------------------------
    NEAR-IDENTICAL IDENTITY TEXT
    ---------------------------------------------
    */

  const similarity = calculateIdentitySimilarity(productA, productB);

  /*
    0.82 means the candidate shares nearly all
    important requested identity terms.

    This is intentionally strict.
    */

  return similarity >= 0.82;
}

/*
=========================================================
SANITIZE AI REASON
=========================================================

The AI must not claim evidence that it never received.

For example:

"identical image"

is invalid when the matcher only received an image URL.

Likewise:

"same model"

is invalid when neither product contains a model.
=========================================================
*/

function sanitizeAIReason(result, productA, productB) {
  let reason = String(result?.reason || "").trim();

  if (!reason) {
    return "No detailed reason provided";
  }

  const lowerReason = reason.toLowerCase();

  const hasVisualClaim =
    lowerReason.includes("identical image") ||
    lowerReason.includes("same image") ||
    lowerReason.includes("image is identical") ||
    lowerReason.includes("visual match");

  const hasImageEvidence = Boolean(
    productA?.imageAnalysis ||
    productA?.visualEvidence ||
    productA?.visionEvidence,
  );

  if (hasVisualClaim && !hasImageEvidence) {
    return "AI classified the candidate using available product identity information; no direct image comparison evidence was available.";
  }

  const hasModelClaim =
    lowerReason.includes("same model") ||
    lowerReason.includes("identical model") ||
    lowerReason.includes("matching model");

  const hasModelEvidence = Boolean(productA?.model || productB?.model);

  if (hasModelClaim && !hasModelEvidence) {
    return "AI classified the candidate using available product identity information; no explicit model identifier was provided.";
  }

  return reason;
}

/*
=========================================================
FINAL AI RESULT SAFETY POLICY
=========================================================

This function is critical.

The AI can propose:

    exact
    related
    irrelevant

but StockSense still applies one final deterministic
safety layer.

For SPECIFIC searches:

    AI exact
        +
    strong identity evidence
        =
    exact

Otherwise:

    AI exact
        +
    insufficient exact evidence
        =
    related

This prevents overclaiming exact identity.
=========================================================
*/

function applyFinalMatchPolicy(aiResult, productA, productB, requestMode) {
  const result = {
    ...aiResult,

    reason: sanitizeAIReason(aiResult, productA, productB),
  };

  /*
    =====================================================
    SPECIFIC
    =====================================================
    */

  if (requestMode === REQUEST_MODES.SPECIFIC) {
    /*
        ---------------------------------------------
        AI IRRELEVANT
        ---------------------------------------------
        */

    if (result.matchType === "irrelevant") {
      return result;
    }

    /*
        ---------------------------------------------
        AI RELATED
        ---------------------------------------------
        */

    if (result.matchType === "related") {
      return result;
    }

    /*
        ---------------------------------------------
        AI EXACT
        ---------------------------------------------
        */

    if (result.matchType === "exact") {
      const strongEvidence = hasStrongSpecificExactEvidence(productA, productB);

      if (!strongEvidence) {
        console.log(
          "⚠️ SPECIFIC exact downgraded to related: insufficient deterministic identity evidence",
        );

        return {
          ...result,

          matchType: "related",

          reason:
            "The candidate is closely related, but the available evidence does not contain a strong enough unique identity anchor or near-identical product identity to prove an exact match.",
        };
      }
    }
  }

  /*
    =====================================================
    VISUAL
    =====================================================

    Visual exact is already heavily constrained by the
    prompt. We keep the AI result, but still prevent very
    low-confidence exact classifications.
    =====================================================
    */

  if (requestMode === REQUEST_MODES.VISUAL) {
    if (result.matchType === "exact" && result.confidence < 80) {
      return {
        ...result,

        matchType: "related",

        reason:
          "Visual evidence is insufficient for a high-confidence exact identification.",
      };
    }
  }

  return result;
}

/*
=========================================================
MATCH PRODUCTS
=========================================================
*/

async function matchProducts(productA, productB) {
  const requestMode = getRequestMode(productA);

  console.log("🤖 AI Matcher Request Mode:", requestMode);

  const prompt = `
You are StockSense's final product matching AI.

Product A is the user's requested product or the product
identity extracted from the user's input.

Product B is a product found on an online shopping platform.

Your task is to classify Product B into exactly ONE:

"exact"
"related"
"irrelevant"


=========================================================
REQUEST MODE
=========================================================

${requestMode}


/*
=========================================================
GENERIC
=========================================================
*/

For GENERIC searches:

The user is asking for a broad product category or
semantic product family rather than one exact SKU/model.

Use:

"exact"
    when Product B clearly belongs to the requested
    generic product identity.

"related"
    when Product B belongs to the same reasonable
    product family but uses a different marketplace
    terminology, subtype, design or variation.

"irrelevant"
    only when Product B is genuinely a different
    product type or product family.

Do NOT classify a candidate as irrelevant merely because
the marketplace uses different terminology.

=========================================================
SEMANTIC EQUIVALENCE
=========================================================

Treat common marketplace synonyms and closely related
product-type terminology as belonging to the same generic
family when the underlying product type is clearly the same.

Example:

Product A:
sparx slippers

Product B:
Sparx Men Rubber Sliders

=> exact or related

Product B:
Sparx Men Thong Flip-Flops

=> exact or related

Product B:
Sparx Men Printed Flip-Flops

=> exact or related

Product B:
Sparx Men Running Shoes

=> irrelevant

For footwear, terminology such as:

- slippers
- slides
- sliders
- flip-flops
- thong flip-flops
- rubber slippers
- rubber sliders

can describe the same broad slipper/slide/flip-flop
product family.

Do not use the exact wording alone to determine relevance.

Evaluate the underlying product type.

=========================================================
GENERIC BRAND HANDLING
=========================================================

A generic request may still contain a brand name.

For example:

"sparx slippers"

is still a generic footwear-family search when the
request does not identify a unique model or exact
configuration.

The requested brand should be respected when it is
explicitly present, but do not require an exact model.

Do not reject a candidate merely because the candidate
uses a different subtype name within the same requested
generic family.

=========================================================
BRANDED
=========================================================

For BRANDED searches:

The requested brand matters.

Different models, sizes, package types and variants of
the same requested brand may be relevant.

Example:

Product A:
Boost Energy Drink

Product B:
Boost Chocolate Nutrition Drink 500 g

=> related

Product B:
Boost Chocolate Nutrition Drink 800 g

=> related

Product B:
Horlicks Chocolate Nutrition Drink 800 g

=> irrelevant

Do not confuse a word appearing inside another brand or
title with the requested brand.


=========================================================
SPECIFIC
=========================================================

For SPECIFIC searches the identity of the requested
product matters.

An exact match requires strong identity evidence.

Strong evidence includes:

- same explicit model
- same SKU
- same MPN
- same product ID
- same ASIN / EAN / UPC when available
- or an almost direct title/identity match containing
  the requested important descriptors without conflict


IMPORTANT:

Brand + category + one common specification is NOT
automatically enough for "exact".

For example:

Product A:
De-Ultimate 500 Watts Mini Single Burner Portable Electric

Product B:
De-Ultimate 500 Watt Portable Electric Heater Hot Plate

Do NOT automatically call this "exact" merely because
both mention De-Ultimate, 500 Watt, Portable and Electric.

When there is no explicit unique model/SKU/identifier and
the titles are materially different, prefer:

"related"


Another example:

Product A:
Motorola Edge 70 Fusion

Product B:
Motorola Edge 70 Fusion 8GB 256GB

=> exact when the requested configuration does not conflict.

Product B:
Motorola Edge 70 Pro

=> related

Product B:
Motorola G57

=> irrelevant


IMPORTANT SPECIFIC RULE:

If Product A has no model, SKU, MPN or other unique
identifier, do NOT invent one.

If two products appear to belong to the same product
family but the available evidence cannot prove they are
the exact same listing/product identity, classify as:

"related"


Do not upgrade a product to exact only because it looks
like a reasonable substitute.


=========================================================
VISUAL
=========================================================

For VISUAL searches, Product A was derived from an image.

Use only the visual/product evidence actually supplied.

Relevant evidence can include:

- product category/type
- physical shape
- physical form
- design
- pattern
- visible color
- visible branding
- visible text
- visible model information
- distinctive physical details

IMPORTANT:

Matching only:

- broad category
- color
- shape
- generic wording
- general product family

does NOT prove exact identity.

For VISUAL:

"exact"
    means strong evidence that Product B is the same
    pictured product.

"related"
    means the product is visually or functionally similar
    but exact identity cannot be established.

"irrelevant"
    means it is materially different.

When uncertain, use "related" rather than "exact".


=========================================================
EVIDENCE LIMITATION
=========================================================

Do NOT invent evidence.

A URL is NOT visual evidence.

An image URL by itself does NOT prove that two images are
identical.

Do NOT say:

"identical image"
"same image"
"visually identical"

unless actual visual/image evidence was provided for
comparison.

Likewise, do NOT say:

"same model"
"identical model"

unless an explicit model identifier is present in the
provided product data.

Do NOT infer hidden SKU/model information from a URL.

Do NOT claim specifications that are not present in the
provided data.


=========================================================
FINAL DECISION RULE
=========================================================

Choose the strongest classification supported by the
available evidence.

IMPORTANT:

When exact identity cannot be proven, choose:

"related"

Do not use "exact" simply because the products are
similar, compatible, same-brand, same-category, or have
overlapping specifications.


=========================================================
PRODUCT A
=========================================================

${JSON.stringify(productA)}


=========================================================
PRODUCT B
=========================================================

${JSON.stringify(productB)}


=========================================================
REQUIRED OUTPUT
=========================================================

Return exactly one JSON object:

{
    "matchType": "exact",
    "confidence": 98,
    "reason": "Brief evidence-based explanation"
}

Rules:

- matchType must be exactly:
  exact
  related
  irrelevant

- confidence must be between 0 and 100

- reason must describe ONLY evidence actually present in
  Product A and Product B

- never invent a model, SKU, image comparison or
  specification

- no Markdown

- no code fences

- no text outside the JSON object
`;

  /*
    =====================================================
    GROQ REQUEST
    =====================================================
    */

  const response = await createGroqMatchRequest({
    model: "openai/gpt-oss-20b",

    messages: [
      {
        role: "user",

        content: prompt,
      },
    ],

    temperature: 0,

    max_completion_tokens: 500,

    reasoning_effort: "low",

    include_reasoning: false,

    response_format: {
      type: "json_schema",

      json_schema: {
        name: "product_match",

        strict: true,

        schema: {
          type: "object",

          properties: {
            matchType: {
              type: "string",

              enum: ["exact", "related", "irrelevant"],
            },

            confidence: {
              type: "number",
            },

            reason: {
              type: "string",
            },
          },

          required: ["matchType", "confidence", "reason"],

          additionalProperties: false,
        },
      },
    },
  });

  /*
    =====================================================
    GET AI RESPONSE
    =====================================================
    */

  const raw = response?.choices?.[0]?.message?.content;

  if (!raw) {
    throw new Error("AI returned an empty response");
  }

  console.log("🤖 RAW AI RESPONSE:", raw);

  /*
    =====================================================
    EXTRACT JSON
    =====================================================
    */

  const parsed = extractJSONObject(raw);

  /*
    =====================================================
    VALIDATE AI RESULT
    =====================================================
    */

  const validated = validateMatchResult(parsed);

  /*
    =====================================================
    FINAL STOCKSENSE SAFETY POLICY
    =====================================================
    */

  const finalResult = applyFinalMatchPolicy(
    validated,
    productA,
    productB,
    requestMode,
  );

  /*
    =====================================================
    FINAL RESULT LOG
    =====================================================
    */

  console.log("🤖 AI FINAL RESULT:", finalResult.matchType);

  console.log("🤖 AI FINAL CONFIDENCE:", finalResult.confidence);

  console.log("🤖 AI FINAL REASON:", finalResult.reason);

  return finalResult;
}

/*
=========================================================
EXPORTS
=========================================================
*/

module.exports = {
  matchProducts,
};
