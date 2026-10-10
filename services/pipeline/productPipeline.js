const timer = require("../../utils/performanceTimer");

const {
  findOrCreatePlatformProduct,
  updatePlatformProduct,
} = require("../platform/platformProductService");

const { checkWatchlistPrice } = require("../notification/notificationEngine");

const { analyzePrice } = require("../intelligence/priceAnalyzer");

const { buildProductResponse } = require("../response/responseBuilder");

const { resolveProductInput } = require("../input/inputResolver");

const { normalizeProduct } = require("../ai/normalize");

const { generateSearchQueries } = require("../ai/searchGenerator");

const { searchAll } = require("../search/searchManager");

const { collectCandidates } = require("../search/candidateCollector");

const { filterResults } = require("../search/filterResults");

/*
=====================================================
NEW PRODUCT VERIFICATION PIPELINE

Replaces the old filterResults() flow.

Verification flow:

Candidate
    ↓
Product Intelligence
    ↓
Deep Verification (only if uncertain)
    ↓
Accepted / Uncertain / Rejected
=====================================================
*/

const { verifyCandidates } = require("../search/candidateVerificationPipeline");

const { findOrCreateProduct } = require("../catalog/catalogService");

const { saveSnapshot } = require("../history/historyService");

const { detectPriceEvent } = require("../intelligence/eventDetector");

const { recommendProducts } = require("../recommendation/recommendationEngine");

const {
  analyzePriceIntelligence,
} = require("../intelligence/priceIntelligenceEngine");

/*
=====================================================
PROCESS PRODUCT
=====================================================
*/

async function processProduct(url) {
  console.log("🔍 PIPELINE RECEIVED URL:", url);

  console.log("🔍 URL TYPE:", typeof url);

  timer.start("TOTAL PIPELINE");

  console.log("🚀 PRODUCT PIPELINE V3 RUNNING");

  console.log("========== STOCKSENSE PIPELINE ==========");

  /*
    =================================================
    STEP 1
    SCRAPE ORIGINAL PRODUCT
    =================================================
    */

  console.log("Step 1 : Scraping Product");

  timer.start("Scraping");

  console.log("🔍 BEFORE SCRAPER:", JSON.stringify(url));

  const scraped = await resolveProductInput(url);

  console.log("🔍 AFTER SCRAPER URL:", JSON.stringify(scraped?.url));

  console.log("🔍 AFTER SCRAPER IMAGE:", JSON.stringify(scraped?.image));

  console.log("🔍 AFTER SCRAPER AVAILABILITY:", scraped?.availability);

  timer.end("Scraping");

  console.log("✅ Scraped Successfully");

  console.dir(scraped, {
    depth: null,
  });

  console.log("-----------------------------------------");

  /* 
=================================================
STEP 2
AI PRODUCT NORMALIZATION
=================================================
*/

  console.log("Step 2 : AI Product Normalization");

  timer.start("AI Normalization");

  let normalized;

  /*
    =================================================
    IMAGE INPUT
    =================================================
    */

  if (scraped?.inputType === "image" && scraped?.identity) {
    console.log("🖼️ IMAGE INPUT: Using vision-extracted product identity");

    const {
      normalizeMarketplaceBrand,
    } = require("../search/stocksenseRequestMode");

    const sourceBrand = String(scraped.identity.brand || "").trim();

    const canonicalBrand = normalizeMarketplaceBrand(sourceBrand);

    normalized = {
      /*
            -----------------------------------------
            CORE IDENTITY
            -----------------------------------------
            */

      title: scraped.identity.productName || scraped.title || "",

      brand: canonicalBrand || sourceBrand || "",

      productName: scraped.identity.productName || "",

      category: scraped.identity.category || "electronics",

      model: scraped.identity.model || null,

      variant: scraped.identity.variant || null,

      weight: scraped.identity.weight || null,

      flavour: scraped.identity.flavour || null,

      color: scraped.identity.color || null,

      storage: scraped.identity.storage || null,

      ram: scraped.identity.ram || null,

      /*
            -----------------------------------------
            IMAGE / SOURCE METADATA
            -----------------------------------------
            */

      inputType: "image",

      sourceBrandLabel: sourceBrand || null,

      sourcePlatform: scraped.platform || null,

      sourceUrl: scraped.url || null,

      image: scraped.image || null,

      evidence: scraped.evidence || null,

      visibleText: Array.isArray(scraped.visibleText)
        ? scraped.visibleText
        : [],

      imageAnalysis: scraped.imageAnalysis || null,
    };
  } else {
    /*
    =================================================
    URL / NORMAL TEXT INPUT
    =================================================
    */
    normalized = await normalizeProduct(scraped.title);

    // ----------------------------------------------------
    // PRESERVE DETERMINISTIC SCRAPER ATTRIBUTES
    // ----------------------------------------------------
    //
    // AI normalization is allowed to return null when
    // an attribute is not obvious from the title.
    //
    // If the marketplace scraper already extracted the
    // attribute, that structured information is stronger
    // than guessing from the title.
    //
    // ----------------------------------------------------

    normalized = {
      ...normalized,

      brand: scraped.brand ?? normalized.brand ?? null,

      model: scraped.model ?? normalized.model ?? null,

      variant: scraped.variant ?? normalized.variant ?? null,

      weight: scraped.weight ?? normalized.weight ?? null,

      flavour: scraped.flavour ?? normalized.flavour ?? null,

      color: scraped.color ?? normalized.color ?? null,

      storage: scraped.storage ?? normalized.storage ?? null,

      ram: scraped.ram ?? normalized.ram ?? null,
    };

    console.log("🔒 STRUCTURED SCRAPER ATTRIBUTES PRESERVED:", {
      brand: normalized.brand,
      model: normalized.model,
      variant: normalized.variant,
      weight: normalized.weight,
      flavour: normalized.flavour,
      color: normalized.color,
      storage: normalized.storage,
      ram: normalized.ram,
    });

    /*
        ---------------------------------------------
        PRESERVE INPUT TYPE
        ---------------------------------------------
        */

    normalized = {
      ...normalized,

      inputType: scraped?.inputType || "url",

      sourcePlatform: scraped?.platform || null,

      sourceUrl: scraped?.url || null,

      image: scraped?.image || null,
    };
  }

  timer.end("AI Normalization");

  console.log("🧠 NORMALIZED PRODUCT:", normalized);

  /*
    =================================================
    STEP 3
    PRODUCT CATALOG
    =================================================
    */

  console.log("Step 3 : Product Catalog");

  timer.start("Catalog");

  const catalogFindStarted = Date.now();

  const product = await findOrCreateProduct(normalized, scraped);

  console.log(
    `⏱ Catalog: findOrCreateProduct: ${Date.now() - catalogFindStarted} ms`,
  );

  const catalogTasks = [];

  if (
    scraped?.inputType !== "image" &&
    scraped?.currentPrice !== null &&
    scraped?.currentPrice !== undefined
  ) {
    catalogTasks.push(saveSnapshot(product, scraped));
  } else {
    console.log("⏭️ Skipping source price-history snapshot: price unavailable");
  }

  catalogTasks.push(checkWatchlistPrice(product._id, scraped.currentPrice));

  const catalogTaskStarted = Date.now();

  await Promise.all(catalogTasks);

  console.log(
    `⏱ Catalog side-effects completed: ${Date.now() - catalogTaskStarted} ms`,
  );

  console.log("-----------------------------------------");

  /*
    =================================================
    STEP 4
    GENERATE SEARCH QUERIES
    =================================================
    */

  console.log("Step 4 : Generate Search Queries");

  timer.start("Search Query Generation");

  const queries = generateSearchQueries(normalized);

  timer.end("Search Query Generation");

  console.dir(queries, {
    depth: null,
  });

  console.log("-----------------------------------------");

  /*
    =================================================
    STEP 5
    SEARCH PLATFORMS
    =================================================
    */

  console.log("Step 5 : Search Platforms");

  timer.start("Platform Search");

  const candidates = await searchAll(
    queries,

    normalized,

    normalized.category,
  );

  timer.end("Platform Search");

  console.log(`Found ${candidates.length} products`);

  console.log("-----------------------------------------");

  /*
    =================================================
    STEP 6
    CANDIDATE COLLECTION
    =================================================
    */

  console.log("Step 6 : Candidate Collection");

  timer.start("Candidate Collection");

  const filteredCandidates = collectCandidates(
    normalized,

    candidates,
  );

  timer.end("Candidate Collection");

  console.log(`Collected ${filteredCandidates.length} candidates`);

  console.log("-----------------------------------------");

  /*
    =================================================
    STEP 7
    PRODUCT VERIFICATION ⭐

    This is now the core product matching system.

    It uses:

    1. Product Matcher
    2. Match Scorer
    3. Identity Validator
    4. Evidence Analyzer
    5. Product Decision Engine
    6. Deep Verifier (only when required)

    No unnecessary AI calls.
    =================================================
    */

  /*
=====================================================
STEP 7 : INTELLIGENT CANDIDATE VERIFICATION
=====================================================
*/

  console.log("Step 7 : Candidate Verification");

  timer.start("Candidate Verification");

  /*
    =====================================================
    RUN DETERMINISTIC + DEEP VERIFICATION
    =====================================================
    */

  const verificationResult = await verifyCandidates(
    normalized,

    filteredCandidates,
  );

  timer.end("Candidate Verification");

  /*
    =====================================================
    VERIFICATION SUMMARY
    =====================================================
    */

  console.log("\n📊 CANDIDATE VERIFICATION SUMMARY");

  console.dir(verificationResult.summary, {
    depth: null,
  });

  console.log(`✅ Accepted: ${verificationResult.accepted.length}`);

  console.log(`🤖 Uncertain: ${verificationResult.uncertain.length}`);

  console.log(`❌ Rejected: ${verificationResult.rejected.length}`);

  /*
    =====================================================
    EXTRACT ACCEPTED PRODUCTS
    =====================================================
    */

  const deterministicallyMatchedProducts = verificationResult.accepted.map(
    (item) => item.candidate,
  );

  /*
    =====================================================
    STEP 7.5 : AI FALLBACK
    
    AI IS USED ONLY FOR UNCERTAIN PRODUCTS.
    
    This prevents unnecessary AI calls and makes the
    pipeline faster and cheaper.
    =====================================================
    */

  let aiMatchedProducts = [];

  if (verificationResult.uncertain.length > 0) {
    console.log("\n🤖 Step 7.5 : AI Verification Fallback");

    timer.start("AI Fallback");

    /*
        ================================================
        EXTRACT UNCERTAIN CANDIDATES
        ================================================
        */

    const uncertainCandidates = verificationResult.uncertain.map(
      (item) => item.candidate,
    );

    /*
        ================================================
        SEND ONLY UNCERTAIN PRODUCTS TO AI
        ================================================
        */

    try {
      const aiFallbackStarted = Date.now();

      aiMatchedProducts = await filterResults(normalized, uncertainCandidates);

      console.log(
        `⏱ AI Verification Fallback: ${Date.now() - aiFallbackStarted} ms`,
      );
    } catch (error) {
      console.error(`❌ AI verification fallback failed: ${error.message}`);

      aiMatchedProducts = [];
    }

    timer.end("AI Fallback");

    console.log(`🤖 AI verified: ${aiMatchedProducts.length}`);
  } else {
    console.log("\n⚡ No AI fallback required");
  }

  /*
    =====================================================
    MERGE FINAL MATCHED PRODUCTS
    =====================================================
    */

  const matchedProducts = [
    ...deterministicallyMatchedProducts,

    ...aiMatchedProducts,
  ];

  /*
    =====================================================
    FINAL DEDUPLICATION
    
    Protect against accidental duplicates.
    =====================================================
    */

  const finalSeen = new Set();

  const finalMatchedProducts = matchedProducts.filter((product) => {
    const platform = String(product.platform || "")
      .trim()
      .toLowerCase();

    const url = String(product.url || "")
      .trim()
      .toLowerCase();

    const title = String(product.title || "")
      .trim()
      .toLowerCase();

    const key = url ? `${platform}::${url}` : `${platform}::${title}`;

    if (finalSeen.has(key)) {
      return false;
    }

    finalSeen.add(key);

    return true;
  });

  console.log("\n========================================");

  console.log("🏁 FINAL MATCHING RESULT");

  console.log("========================================");

  console.log(
    `⚡ Deterministic matches: ${deterministicallyMatchedProducts.length}`,
  );

  console.log(`🤖 AI matches: ${aiMatchedProducts.length}`);

  console.log(`🎯 Final matches: ${finalMatchedProducts.length}`);

  console.log("========================================");

  console.log("-----------------------------------------");

  /*
    =================================================
    STEP 8
    SAVE VERIFIED PLATFORM PRODUCTS
    =================================================
    */

  console.log("Step 8 : Save Platform Products");

  timer.start("Platform Product Save");

  const validMatchedProducts = [];

  for (const matched of finalMatchedProducts) {
    console.log("\n💾 SAVING VERIFIED PLATFORM PRODUCT");

    console.dir({
      platform: matched.platform,

      title: matched.title,

      url: matched.url,

      price: matched.price,

      image: matched.image,
    });

    /*
        =============================================
        SKIP PRODUCTS WITHOUT VALID URL
        =============================================
        */

    if (
      !matched.url ||
      typeof matched.url !== "string" ||
      !matched.url.trim()
    ) {
      console.log("❌ PRODUCT SKIPPED: URL IS MISSING");

      continue;
    }

    try {
      const platformProduct = await findOrCreatePlatformProduct(
        product._id,

        matched,
      );

      await updatePlatformProduct(
        platformProduct,

        matched,
      );

      /*
            =========================================
            ONLY SUCCESSFULLY SAVED PRODUCTS
            =========================================
            */

      validMatchedProducts.push(matched);

      console.log(`✅ Platform product saved: ${matched.title}`);
    } catch (err) {
      console.error(`❌ Failed to save: ${matched.title}`);

      console.error(err.message);
    }
  }

  timer.end("Platform Product Save");

  console.log("-----------------------------------------");

  // -----------------------------------------
  // Step 9 : Price Intelligence
  // -----------------------------------------
  console.log("-----------------------------------------");
  console.log("Step 9 : Price Intelligence");

  const priceAnalysisStarted = Date.now();

  const priceAnalysis = await analyzePrice(product._id, scraped?.url);

  console.log(`⏱ Price Analysis: ${Date.now() - priceAnalysisStarted} ms`);

  const priceIntelligenceStarted = Date.now();

  const priceIntelligence = await analyzePriceIntelligence(priceAnalysis);

  console.log(
    `⏱ Price Intelligence Decision: ${
      Date.now() - priceIntelligenceStarted
    } ms`,
  );

  const priceEventStarted = Date.now();

  const priceEvent = await detectPriceEvent(product._id);

  console.log(`⏱ Price Event Detection: ${Date.now() - priceEventStarted} ms`);

  console.log("-----------------------------------------");

  /*
    =================================================
    STEP 10
    PRICE EVENT DETECTION
    =================================================
    */

  console.log("Step 10 : Price Event Detection");

  timer.start("Price Event");

  timer.end("Price Event");

  console.dir(priceEvent, {
    depth: null,
  });

  console.log("-----------------------------------------");

  /*
    =================================================
    STEP 11
    RECOMMENDATION

    Only verified products are recommended.
    =================================================
    */

  console.log("Step 11 : Recommendation");

  timer.start("Recommendation");

  const recommendations = recommendProducts(validMatchedProducts);

  timer.end("Recommendation");

  console.log(`Verified and saved ${validMatchedProducts.length} products`);

  console.log("-----------------------------------------");

  /*
    =================================================
    TOTAL PIPELINE COMPLETE
    =================================================
    */

  timer.end("TOTAL PIPELINE");

  /*
    =================================================
    FINAL RESPONSE
    =================================================
    */

  return await buildProductResponse({
    product,

    scraped,

    normalized,

    queries,

    matchedProducts: validMatchedProducts,

    priceAnalysis,

    priceEvent,

    recommendations,

    priceIntelligence,

    /*
        =============================================
        VERIFICATION DATA

        Useful for debugging and future UI features.
        =============================================
        */

    verification: verificationResult,
  });
}

/*
=====================================================
EXPORT
=====================================================
*/

module.exports = {
  processProduct,
};
