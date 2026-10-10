const { canonicalizeProductText } = require("../../utils/attributeNormalizer");

/*
=====================================================

NORMALIZE

=====================================================
*/

function normalize(text) {
  if (!text) {
    return "";
  }

  return canonicalizeProductText(String(text)).toLowerCase().trim();
}

/*
=====================================================

REMOVE SPECIFICATIONS

This removes common technical specifications
that should not become part of the model identity.

Examples:

128GB
256GB
8GB RAM
2000W
500ml
800g

=====================================================
*/

function removeSpecifications(text) {
  if (!text) {
    return "";
  }

  return text
    .replace(/\b\d+(\.\d+)?\s*(gb|tb|mb|kb)\b/gi, " ")
    .replace(/\b\d+(\.\d+)?\s*(w|kw)\b/gi, " ")
    .replace(/\b\d+(\.\d+)?\s*(g|kg|gm|ml|l|litre|liter)\b/gi, " ")
    .replace(/\b\d+\s*gb\s*ram\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/*
=====================================================

UNSAFE GENERIC BRAND TOKEN

A candidate title should NOT automatically use
its first word as the brand.

Examples that are NOT safe standalone brands:

5
3
2
men
women
sofa
fabric
shoe
shoes
phone
laptop
watch

This prevents cases such as:

"5 Seater Fabric Sofa Set..."
    ↓
brand = "5"   ❌

Instead:

brand = null   ✅

=====================================================
*/

function isUnsafeBrandToken(value) {
  const token = String(value || "")
    .trim()
    .toLowerCase();

  if (!token) {
    return true;
  }

  /*
  -------------------------------------------------
  Numeric tokens are never safe standalone brands
  -------------------------------------------------
  */

  if (/^\d+$/.test(token)) {
    return true;
  }

  /*
  -------------------------------------------------
  Common generic product/category descriptors
  -------------------------------------------------
  */

  const genericTokens = new Set([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",

    "men",
    "mens",
    "women",
    "womens",
    "unisex",

    "new",
    "latest",
    "premium",
    "original",
    "best",

    "fabric",
    "leather",
    "sofa",
    "sofas",
    "chair",
    "chairs",
    "table",
    "tables",
    "bed",
    "beds",

    "phone",
    "phones",
    "mobile",
    "mobiles",
    "laptop",
    "laptops",
    "tablet",
    "tablets",
    "watch",
    "watches",

    "shoe",
    "shoes",
    "sneaker",
    "sneakers",
    "footwear",

    "shirt",
    "shirts",
    "tshirt",
    "tshirts",
    "jeans",
    "pants",
    "dress",

    "headphone",
    "headphones",
    "earphone",
    "earphones",
    "speaker",
    "speakers",

    "tv",
    "television",
    "monitor",

    "camera",
    "cameras",

    "heater",
    "heaters",

    "mixer",
    "mixers",

    "refrigerator",
    "fridge",

    "washing",
    "machine",

    "printer",
    "printers",
  ]);

  return genericTokens.has(token);
}

/*
=====================================================

EXTRACT BRAND

Priority:

1. Candidate's explicit brand, when available.
2. Original brand if it appears in candidate title.
3. Original brand when candidate clearly contains
   the original product/model identity but the
   marketplace omitted the brand.
4. Safe generic first-token fallback.

Example:

Original:
    brand = Puma
    model = Hustle V2

Candidate:
    "Hustle V2 Sneakers For Men"

Result:
    brand = Puma

This prevents "Hustle" from being incorrectly
interpreted as the brand.

=====================================================
*/

function extractBrand(originalProduct, candidateTitle, candidateBrand = null) {
  const originalBrand = normalize(originalProduct.brand);

  const title = normalize(candidateTitle);

  const suppliedCandidateBrand = normalize(candidateBrand);

  if (!title) {
    return null;
  }

  /*
  ---------------------------------------------

  1. Candidate has explicit brand

  ---------------------------------------------
  */

  if (suppliedCandidateBrand) {
    return candidateBrand;
  }

  /*
  ---------------------------------------------

  2. Original brand appears in candidate

  ---------------------------------------------
  */

  if (originalBrand && title.includes(originalBrand)) {
    return originalProduct.brand;
  }

  /*
  ---------------------------------------------

  3. Marketplace omitted the brand

  Only use the original brand when the candidate
  clearly contains the original model/product identity.

  Example:

      Original:
          Puma Hustle V2

      Candidate:
          Hustle V2 Sneakers For Men

      → Puma

  But:

      Candidate:
          Hustle XT Running Shoe

      does NOT contain Hustle V2.

      → do NOT assume Puma.

  ---------------------------------------------
  */

  const originalModel = normalize(originalProduct.model);

  const originalProductName = normalize(originalProduct.productName);

  const modelMatches = Boolean(originalModel && title.includes(originalModel));

  const productNameMatches = Boolean(
    originalProductName && title.includes(originalProductName),
  );

  if (originalBrand && (modelMatches || productNameMatches)) {
    return originalProduct.brand;
  }

  /*
  ---------------------------------------------

  4. Safe generic fallback

  DO NOT assume the first token is a brand when
  it is clearly a number or generic product term.

  Example:

      "5 Seater Fabric Sofa Set..."

      first token = "5"

      → NOT a brand

  Example:

      "KENDALWOOD Furniture 5 Seater Sofa..."

      first token = "KENDALWOOD"

      → safe standalone brand fallback

  ---------------------------------------------
  */

  const tokens = title.split(/\s+/);

  if (tokens.length >= 2) {
    const firstToken = tokens[0];

    if (firstToken && !isUnsafeBrandToken(firstToken)) {
      return firstToken;
    }
  }

  return null;
}

/*
=====================================================

EXTRACT MODEL

Strategy:

1. Remove brand.
2. Remove specifications.
3. Compare against original model.
4. If original model is not present,
   build a candidate model identity.

Examples:

Samsung Galaxy S24 128GB
→ Galaxy S24

Samsung Galaxy S23 128GB
→ Galaxy S23

OnePlus 12 256GB
→ 12

=====================================================
*/

function extractModel(originalProduct, candidateTitle) {
  const title = normalize(candidateTitle);

  if (!title) return null;

  const originalBrand = normalize(originalProduct.brand);
  const originalModel = normalize(originalProduct.model);

  let candidateText = removeSpecifications(title);

  if (originalBrand && candidateText.startsWith(originalBrand + " ")) {
    candidateText = candidateText.slice(originalBrand.length).trim();
  }

  // --------------------------------------------------
  // 1. Only use a model when the SOURCE actually has one
  // --------------------------------------------------
  if (originalModel) {
    const modelWithoutSpecs = removeSpecifications(originalModel);

    // Exact model match
    if (modelWithoutSpecs && candidateText.includes(modelWithoutSpecs)) {
      return originalProduct.model;
    }

    // Flexible model-token match
    const modelTokens = modelWithoutSpecs.split(/\s+/).filter(Boolean);

    if (modelTokens.length >= 2) {
      const candidateTokens = candidateText.split(/\s+/).filter(Boolean);

      let matched = 0;

      for (const token of candidateTokens) {
        if (token === modelTokens[matched]) {
          matched++;

          if (matched === modelTokens.length) {
            return originalProduct.model;
          }
        }
      }
    }
  }

  // --------------------------------------------------
  // 2. IMPORTANT:
  //    Do NOT convert productName into model
  // --------------------------------------------------
  return null;
}

/*
=====================================================

EXTRACT VARIANT

A variant is an identity-changing suffix that
appears after the base model.

Examples:

Galaxy S24 Ultra
→ Ultra

iPhone 16 Pro
→ Pro

iPhone 16 Pro Max
→ Pro Max

Galaxy S24 128GB
→ null

=====================================================
*/

function extractVariant(originalProduct, candidateTitle) {
  const title = removeSpecifications(normalize(candidateTitle));

  const originalModel = normalize(
    originalProduct.model || originalProduct.productName,
  );

  if (!title || !originalModel) {
    return null;
  }

  const index = title.indexOf(originalModel);

  if (index === -1) {
    return null;
  }

  let afterModel = title.slice(index + originalModel.length).trim();

  if (!afterModel) {
    return null;
  }

  /*
  =====================================================
  REMOVE GENERIC MARKETPLACE DESCRIPTORS

  These words normally describe the product category
  or target user, not a true variant.

  Example:

  Hustle V2 Sneakers For Men
                  ↓
             generic suffix

  Should NOT become a variant.
  =====================================================
  */

  afterModel = afterModel

    .replace(/\bfor\s+men(?:['’]s)?\b/gi, " ")

    .replace(/\bfor\s+women(?:['’]s)?\b/gi, " ")

    .replace(/\bfor\s+kids\b/gi, " ")

    .replace(/\bfor\s+boys\b/gi, " ")

    .replace(/\bfor\s+girls\b/gi, " ")

    // Men's / Women's

    .replace(/\bmen(?:['’]s)?\b/gi, " ")

    .replace(/\bwomen(?:['’]s)?\b/gi, " ")

    .replace(/\bunisex\b/gi, " ")

    .replace(/\bsneakers?\b/gi, " ")

    .replace(/\bshoes?\b/gi, " ")

    .replace(/\bfootwear\b/gi, " ")

    .replace(/\s+/g, " ")

    .trim();

  /*
  =====================================================
  NO REAL VARIANT
  =====================================================
  */

  if (!afterModel) {
    return null;
  }

  /*
  =====================================================
  REMAINING WORDS ARE POSSIBLE VARIANT
  =====================================================
  */

  const tokens = afterModel.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return null;
  }

  return tokens.slice(0, 3).join(" ");
}

/*
=====================================================

CATEGORY

Candidate extraction should not invent a category.

Use original category only as comparison context.

=====================================================
*/

function extractCategory(originalProduct) {
  return originalProduct.category || null;
}

/*
=====================================================

MAIN EXTRACTOR

=====================================================
*/

function extractCandidateIdentity(originalProduct, candidate) {
  const title = candidate.title || "";

  const identity = {
    brand: extractBrand(
      originalProduct,
      title,
      candidate.brand ||
        candidate.brandName ||
        candidate.brandLabel ||
        candidate.brand_name ||
        null,
    ),

    model: extractModel(originalProduct, title),

    variant: extractVariant(originalProduct, title),

    category: extractCategory(originalProduct),
  };

  console.log("🧩 Candidate Identity:", candidate.title, "→", identity);

  return identity;
}

module.exports = {
  extractCandidateIdentity,
};
