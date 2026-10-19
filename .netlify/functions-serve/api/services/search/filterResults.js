const { matchProducts } = require("../ai/matcher");

const { calculateFinalScore } = require("./rankingEngine");

const { verifyLocally } = require("./localVerifier");

const { REQUEST_MODES, getRequestMode } = require("./stocksenseRequestMode");

/*
=========================================================
AI FALLBACK SAFETY LIMITS
=========================================================
*/

const AI_FALLBACK_MAX_TIME_MS = 12000;

const AI_FALLBACK_MAX_CANDIDATES = 4;

const AI_FALLBACK_CONCURRENCY = 2;

/*
=====================================================
HELPER
=====================================================
*/

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/*
=====================================================
SEARCH TYPE
=====================================================

A request is considered specific when the user supplied
identity or a strong distinguishing attribute.

Examples:

Samsung Galaxy S24
Boost Chocolate 800g
red shirt

Generic:

t shirt
study table
office chair
=====================================================
*/

function isGenericRequest(product = {}) {
  return getRequestMode(product) === REQUEST_MODES.GENERIC;
}

/*
=====================================================
GENERIC DETERMINISTIC CONFIDENCE CHECK
=====================================================

IMPORTANT:

This optimization is ONLY for GENERIC requests.

We do NOT use this for:

- BRANDED
- SPECIFIC
- URL
- IMAGE

The candidate must already have:

1. Intent Score = 100
2. At least one matched token
3. No missing tokens
4. No local rejection

This allows obvious generic matches to bypass AI.

Example:

Query:
    sparx shoes

Candidate:
    Sparx Men Running Shoes

Intent:
    100

Matched:
    sparx, shoe

Missing:
    none

=> Safe deterministic generic match.

=====================================================
*/
function isHighConfidenceGenericCandidate(candidate = {}) {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }

  const genericIntent = candidate.genericIntent;

  if (!genericIntent || typeof genericIntent !== "object") {
    return false;
  }

  const intentScore = Number(genericIntent.score ?? 0);

  /*
    -------------------------------------------------
    Matched tokens
    -------------------------------------------------
    */

  const matchedTokens = Array.isArray(genericIntent.matchedTokens)
    ? genericIntent.matchedTokens.filter(
        (token) =>
          token !== null && token !== undefined && String(token).trim() !== "",
      )
    : [];

  /*
    -------------------------------------------------
    Missing tokens
    -------------------------------------------------
    */

  const missingTokens = Array.isArray(genericIntent.missingTokens)
    ? genericIntent.missingTokens.filter(
        (token) =>
          token !== null && token !== undefined && String(token).trim() !== "",
      )
    : [];

  /*
    -------------------------------------------------
    SAFETY CONDITIONS
    -------------------------------------------------

    Generic deterministic matching is allowed only
    when:

    1. Intent score >= 75
    2. At least one token matched
    3. No required token is missing

    This allows semantic matches such as:

        slipper -> flip-flop
        slipper -> slider
        shoe    -> footwear

    without requiring a perfect score of 100.

    -------------------------------------------------
    */

  if (intentScore < 75) {
    return false;
  }

  if (matchedTokens.length === 0) {
    return false;
  }

  if (missingTokens.length > 0) {
    return false;
  }

  return true;
}

/*
=====================================================
BUILD DETERMINISTIC GENERIC MATCH
=====================================================

We intentionally classify this as "related" rather
than "exact".

Why?

Because:

    "sparx shoes"

does not identify one exact SKU.

It identifies a generic product family.

So:

    related = valid generic product

This avoids pretending that a generic search identified
an exact model/SKU.

=====================================================
*/

function buildGenericDeterministicMatch(candidate, verification) {
  const deterministicVerification = {
    ...verification,

    matchType: "related",

    confidence: 90,

    reason: "DETERMINISTIC_GENERIC_INTENT",
  };

  return buildLocalMatch(candidate, deterministicVerification);
}

/*
=====================================================
AI MATCH WITH RETRY
=====================================================
*/

/*
=========================================================
AI MATCH WITH SAFE RETRY
=========================================================

IMPORTANT:

This function does NOT change matching decisions.

It only prevents slow/rate-limited AI calls from
blocking the entire StockSense pipeline.

Rules:

- Normal AI request: maximum 1 attempt
- 429/rate limit: one short retry
- Timeout: NEVER retry
- Other errors: fail immediately
=========================================================
*/

async function matchWithRetry(originalProduct, candidate, maxRetries = 1) {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await matchProducts(originalProduct, candidate);
    } catch (err) {
      const message = String(err?.message || "").toLowerCase();

      /*
            =============================================
            TIMEOUT
            =============================================

            IMPORTANT:
            Do NOT retry a timeout.

            The matcher already waited for the maximum
            permitted time.
            =============================================
            */

      if (err?.code === "GROQ_MATCH_TIMEOUT") {
        console.warn("⏱️ AI MATCH TIMEOUT - skipping candidate");

        return null;
      }

      /*
            =============================================
            RATE LIMIT
            =============================================
            */

      const isRateLimit =
        message.includes("429") || message.includes("rate_limit_exceeded");

      if (isRateLimit && attempt <= maxRetries) {
        /*
                -----------------------------------------
                Short retry only.
                -----------------------------------------
                */

        const delay = 1500;

        console.warn(`⚠️ Groq rate limit. Retrying once after ${delay}ms...`);

        await sleep(delay);

        continue;
      }

      /*
            =============================================
            OTHER ERROR
            =============================================

            Don't keep retrying unknown errors.
            =============================================
            */

      console.warn("⚠️ AI MATCH FAILED:", err?.message || err);

      return null;
    }
  }

  return null;
}

/*
=====================================================
BUILD LOCAL MATCH
=====================================================
*/

function buildLocalMatch(
  candidate,

  verification,
) {
  const ruleScore = candidate.ruleScore ?? 0;

  const finalScore = calculateFinalScore(
    ruleScore,

    verification.confidence,
  );

  return {
    ...candidate,

    matchType: verification.matchType,

    ruleScore,

    confidence: verification.confidence,

    finalScore,

    reason: verification.reason,

    strategy: verification.strategy,

    verificationMethod: "local",

    identityRelationship: verification.identity?.relationship ?? null,

    identityReason: verification.identity?.reason ?? null,

    candidateIdentity: verification.candidateIdentity ?? null,

    variantPriority: verification.variantPolicy?.priority ?? null,

    variantPolicyReason: verification.variantPolicy?.reason ?? null,

    attributeRelationship: verification.attributeResult?.relationship ?? null,

    attributeReason: verification.attributeResult?.reason ?? null,

    attributeDetails: verification.attributeResult?.attributes ?? null,
  };
}

/*
=====================================================
BUILD AI MATCH
=====================================================
*/

function buildAIMatch(
  candidate,

  verification,

  aiResult,
) {
  const ruleScore = candidate.ruleScore ?? 0;

  const finalScore = calculateFinalScore(
    ruleScore,

    aiResult.confidence,
  );

  return {
    ...candidate,

    matchType: aiResult.matchType,

    ruleScore,

    confidence: aiResult.confidence,

    finalScore,

    reason: aiResult.reason,

    strategy: verification.strategy,

    verificationMethod: "ai",

    identityRelationship: verification.identity?.relationship ?? null,

    identityReason: verification.identity?.reason ?? null,

    candidateIdentity: verification.candidateIdentity ?? null,

    variantPriority: verification.variantPolicy?.priority ?? null,

    variantPolicyReason: verification.variantPolicy?.reason ?? null,

    attributeRelationship: verification.attributeResult?.relationship ?? null,

    attributeReason: verification.attributeResult?.reason ?? null,

    attributeDetails: verification.attributeResult?.attributes ?? null,
  };
}

function isAccessoryCandidate(candidate = {}) {
  const title = String(candidate.title || "").toLowerCase();

  const accessoryPatterns = [
    "screen guard",
    "screen protector",
    "tempered glass",
    "watch strap",
    "watch band",
    "silicone belt",
    "replacement strap",
    "watch case",
    "watch cover",
    "protective case",
    "bumper case",
    "charging cable",
    "charger cable",
    "charging dock",
    "charging stand",
    "watch protector",
  ];

  return accessoryPatterns.some((pattern) => title.includes(pattern));
}

/*
=====================================================
FILTER RESULTS
=====================================================

Pipeline:

1. Local verification
2. Reject definite conflicts
3. Keep strong local matches
4. GENERIC high-confidence deterministic shortcut
5. Send remaining uncertain candidates to AI
6. Apply exact/related policy
7. Rank

IMPORTANT:

Only GENERIC receives the deterministic shortcut.

SPECIFIC / BRANDED remain on their existing AI path.

=====================================================
*/

async function filterResults(
  originalProduct,

  candidates,
) {
  const matched = [];

  const aiCandidates = [];

  const requestMode = getRequestMode(originalProduct);

  const specificRequest = requestMode === REQUEST_MODES.SPECIFIC;

  const genericRequest = requestMode === REQUEST_MODES.GENERIC;

  console.log(
    `🧠 Local verification starting for ${candidates.length} candidates...`,
  );

  console.log(`🧭 Request type: ${requestMode}`);

  /*
    =================================================
    STEP 1
    LOCAL VERIFICATION
    =================================================
    */

  for (const candidate of candidates) {
    console.log("\n🔎 Verifying:", candidate.title);

    const verification = verifyLocally(
      originalProduct,

      candidate,
    );

    console.log("🎯 Action:", verification.action);

    console.log("🧠 Strategy:", verification.strategy);

    console.log("📝 Reason:", verification.reason);

    /*
        =============================================
        DEFINITE REJECT
        =============================================
        */

    if (verification.action === "REJECT") {
      console.log("❌ LOCAL REJECT:", candidate.title);

      continue;
    }

    /*
        =============================================
        STRONG LOCAL MATCH
        =============================================
        */

    if (verification.action === "SKIP_AI") {
      const localMatch = buildLocalMatch(
        candidate,

        verification,
      );

      matched.push(localMatch);

      console.log("⚡ LOCAL MATCH:", candidate.title);

      console.log("Final Score:", localMatch.finalScore);

      continue;
    }

    /*
        =============================================
        GENERIC FAST PATH
        =============================================

        THIS IS THE MAIN PERFORMANCE PATCH.

        We only enter here when:

            requestMode === GENERIC

        and:

            verification.action === VERIFY_AI

        and:

            intentScore === 100
            matchedTokens.length > 0
            missingTokens.length === 0

        Therefore:

            obvious generic matches

        no longer need a Groq request.

        =============================================
        */

    if (
      genericRequest &&
      verification.action === "VERIFY_AI" &&
      isHighConfidenceGenericCandidate(candidate)
    ) {
      const genericMatch = buildGenericDeterministicMatch(
        candidate,

        verification,
      );

      matched.push(genericMatch);

      console.log("⚡ GENERIC FAST MATCH:", candidate.title);

      console.log("   Intent Score:", candidate.genericIntent?.score ?? 0);

      console.log(
        "   Matched Tokens:",
        candidate.genericIntent?.matchedTokens ?? [],
      );

      console.log(
        "   Missing Tokens:",
        candidate.genericIntent?.missingTokens ?? [],
      );

      console.log("   Final Score:", genericMatch.finalScore);

      console.log("   🤖 Groq skipped");

      continue;
    }

    /*
=====================================================
NEED AI / RELATED FAST PATH
=====================================================

For SPECIFIC searches:

    RELATED
        -> accept locally when it is clearly
           the same brand + same category

    DIFFERENT
        -> reject

    UNKNOWN
        -> send to AI

This avoids unnecessary Groq calls for obvious
related alternatives.

=====================================================
*/

    if (verification.action === "VERIFY_AI") {
      const identityRelationship = verification.identity?.relationship ?? null;

      /*
    -------------------------------------------------
    ACCESSORY SAFETY
    -------------------------------------------------

    Never locally accept accessories as related
    products.

    -------------------------------------------------
    */

      if (
        specificRequest &&
        identityRelationship === "RELATED" &&
        isAccessoryCandidate(candidate)
      ) {
        console.log("❌ RELATED FAST REJECT [ACCESSORY]:", candidate.title);

        continue;
      }

      /*
    -------------------------------------------------
    RELATED FAST PATH
    -------------------------------------------------

    Same brand + same category + different model
    is already classified as RELATED by the
    deterministic identity system.

    No Groq call is required.

    -------------------------------------------------
    */

      if (specificRequest && identityRelationship === "RELATED") {
        const relatedVerification = {
          ...verification,

          matchType: "related",

          confidence: 85,

          reason: "DETERMINISTIC_RELATED_IDENTITY",
        };

        const relatedMatch = buildLocalMatch(candidate, relatedVerification);

        matched.push(relatedMatch);

        console.log("⚡ RELATED FAST MATCH:", candidate.title);

        console.log("   Identity:", identityRelationship);

        console.log("   Confidence:", relatedVerification.confidence);

        console.log("   🤖 Groq skipped");

        continue;
      }

      /*
    -------------------------------------------------
    NORMAL AI PATH
    -------------------------------------------------

    Anything that is not safely RELATED still
    receives the existing AI verification.

    -------------------------------------------------
    */

      aiCandidates.push({
        candidate,

        verification,
      });

      console.log("🤖 QUEUED FOR AI:", candidate.title);
    }
  }

  /*
    =================================================
    AI VERIFICATION
    =================================================
    */

  console.log(
    `\n🤖 AI verification starting for ${aiCandidates.length} candidates...`,
  );

  /*
    =================================================
    CONTROLLED AI CONCURRENCY
    =================================================

    IMPORTANT:

    Keep this at 2 for now.

    We are reducing the NUMBER of AI calls instead
    of blindly increasing concurrency.

    This avoids creating Groq 429/rate-limit problems.

    =================================================
    */

  /*
=========================================================
AI FALLBACK CANDIDATE LIMIT
=========================================================

AI verification is expensive.

We keep the strongest candidates first and prevent a
large uncertain candidate pool from causing a long chain
of AI requests.

This does NOT change deterministic matches.
It only limits expensive AI fallback work.
=========================================================
*/

  const limitedAICandidates = aiCandidates.slice(0, AI_FALLBACK_MAX_CANDIDATES);

  console.log(
    "🤖 AI FALLBACK CANDIDATES:",
    aiCandidates.length,
    "→",
    limitedAICandidates.length,
  );

  const CONCURRENCY = AI_FALLBACK_CONCURRENCY;

  const aiFallbackStartTime = Date.now();

  for (let i = 0; i < limitedAICandidates.length; i += CONCURRENCY) {
    const elapsed = Date.now() - aiFallbackStartTime;

    if (elapsed >= AI_FALLBACK_MAX_TIME_MS) {
      console.warn(
        "⏱️ AI FALLBACK TIME LIMIT REACHED - stopping further AI verification",
      );

      break;
    }

    const batch = limitedAICandidates.slice(
      i,

      i + CONCURRENCY,
    );

    console.log(
      `⚡ AI batch ${
        Math.floor(i / CONCURRENCY) + 1
      } (${batch.length} products)`,
    );

    const results = await Promise.all(
      batch.map(
        async ({
          candidate,

          verification,
        }) => {
          try {
            const ruleScore = candidate.ruleScore ?? 0;

            console.log("\n🤖 Checking:", candidate.title);

            console.log("📊 Rule Score:", ruleScore);

            console.log("🧠 Local Strategy:", verification.strategy);

            const aiResult = await matchWithRetry(
              originalProduct,

              candidate,
            );

            console.log("🤖 AI Result:", aiResult.matchType);

            console.log("Confidence:", aiResult.confidence);

            console.log("Reason:", aiResult.reason);

            /*
                            =========================================
                            AI MATCH TYPE POLICY
                            =========================================

                            GENERIC / BRANDED

                                exact
                                    -> accept

                                related
                                    -> accept

                                irrelevant
                                    -> reject


                            SPECIFIC

                                exact
                                    -> accept

                                related
                                    -> reject

                                irrelevant
                                    -> reject


                            =========================================
                            */

            if (aiResult.matchType === "irrelevant") {
              console.log("❌ AI REJECT [IRRELEVANT]:", candidate.title);

              return null;
            }

            /*
=========================================
SPECIFIC REQUEST SAFETY
=========================================

SPECIFIC SEARCH:

    exact
        -> ACCEPT

    related
        -> ACCEPT ONLY when deterministic
           identity says RELATED

    irrelevant
        -> REJECT

IMPORTANT:

AI is NOT allowed to override
deterministic identity.

Therefore:

    RELATED identity + AI exact
        -> REJECT

because a different model cannot become
the exact requested model just because AI
said "exact".

=========================================
*/

            const identityRelationship =
              verification.identity?.relationship ?? null;

            /*
-----------------------------------------
EXACT AI MATCH
-----------------------------------------
*/

            if (
              requestMode === REQUEST_MODES.SPECIFIC &&
              aiResult.matchType === "exact"
            ) {
              /*
    A candidate already identified as
    RELATED cannot become EXACT.
    */

              if (identityRelationship === "RELATED") {
                console.log(
                  "❌ AI EXACT REJECT [IDENTITY IS RELATED]:",
                  candidate.title,
                );

                console.log("Identity relationship:", identityRelationship);

                return null;
              }

              console.log("✅ AI EXACT MATCH:", candidate.title);
            }

            /*
-----------------------------------------
RELATED AI MATCH
-----------------------------------------
*/

            if (
              requestMode === REQUEST_MODES.SPECIFIC &&
              aiResult.matchType === "related"
            ) {
              /*
    Related products are allowed only when
    our deterministic identity system also
    classified them as RELATED.

    Example:

        Requested:
        Titan Unisex Smart Watch
        Model: 90155AP03

        Candidate:
        Titan Evolution Smartwatch
        Model: different

        Brand: same
        Category: same

        Identity:
        RELATED

        AI:
        related

        => ACCEPT
    */

              if (identityRelationship !== "RELATED") {
                console.log(
                  "❌ AI RELATED REJECT [IDENTITY NOT RELATED]:",
                  candidate.title,
                );

                console.log(
                  "Identity relationship:",
                  identityRelationship || "UNKNOWN",
                );

                return null;
              }

              console.log("✅ AI RELATED ALTERNATIVE:", candidate.title);
            }

            /*
-----------------------------------------
ANY OTHER AI MATCH TYPE
-----------------------------------------
*/

            if (
              requestMode === REQUEST_MODES.SPECIFIC &&
              aiResult.matchType !== "exact" &&
              aiResult.matchType !== "related"
            ) {
              console.log(
                "❌ AI REJECT [INVALID SPECIFIC MATCH]:",
                candidate.title,
              );

              return null;
            }

            /*
                            =========================================
                            LOW CONFIDENCE
                            =========================================
                            */

            if (aiResult.confidence < 70) {
              console.log("❌ LOW AI CONFIDENCE:", candidate.title);

              return null;
            }

            /*
                            =========================================
                            ACCEPT
                            =========================================
                            */

            const aiMatch = buildAIMatch(
              candidate,

              verification,

              aiResult,
            );

            console.log("✅ AI MATCH:", candidate.title);

            console.log("Final Score:", aiMatch.finalScore);

            return aiMatch;
          } catch (err) {
            console.error("❌ AI matching failed:", err.message);

            return null;
          }
        },
      ),
    );

    /*
        =============================================
        ADD RESULTS
        =============================================
        */

    for (const result of results) {
      if (result) {
        matched.push(result);
      }
    }
  }

  /*
    =================================================
    STEP 3
    FINAL SORT
    =================================================
    */

  matched.sort((a, b) => {
    /*
            =========================================
            EXACT FIRST
            =========================================
            */

    if (a.matchType === "exact" && b.matchType !== "exact") {
      return -1;
    }

    if (a.matchType !== "exact" && b.matchType === "exact") {
      return 1;
    }

    /*
            =========================================
            VARIANT PRIORITY
            =========================================
            */

    const priorityRank = {
      exact: 2,

      alternative: 1,
    };

    const aPriority = priorityRank[a.variantPriority] ?? 0;

    const bPriority = priorityRank[b.variantPriority] ?? 0;

    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    /*
            =========================================
            SAME IDENTITY
            =========================================
            */

    if (
      a.identityRelationship === "SAME" &&
      b.identityRelationship !== "SAME"
    ) {
      return -1;
    }

    if (
      a.identityRelationship !== "SAME" &&
      b.identityRelationship === "SAME"
    ) {
      return 1;
    }

    /*
            =========================================
            FINAL SCORE
            =========================================
            */

    return b.finalScore - a.finalScore;
  });

  /*
    =================================================
    FINAL LOG
    =================================================
    */

  console.log(`\n🎯 Final verification completed: ${matched.length} products`);

  console.log(
    `⚡ Generic deterministic matches: ${
      matched.filter(
        (product) =>
          product.verificationMethod === "local" &&
          product.reason === "DETERMINISTIC_GENERIC_INTENT",
      ).length
    }`,
  );

  console.log(
    `🤖 AI matches: ${
      matched.filter((product) => product.verificationMethod === "ai").length
    }`,
  );

  return matched;
}

/*
=====================================================
EXPORT
=====================================================
*/

module.exports = {
  filterResults,

  isGenericRequest,
};
