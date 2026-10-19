"use strict";

/*
=========================================================
 STOCKSENSE SEARCH MANAGER - HARDENED VERSION
=========================================================

Goals:

1. Run marketplaces concurrently
2. Enforce a bounded global search budget
3. Pass AbortSignal + deadline to adapters
4. Return valid partial results
5. Never lose a result because of a timeout race
6. Never wait indefinitely for a slow marketplace
7. Run multi-query searches concurrently
8. Deduplicate results safely
9. Handle adapter exceptions safely
10. Handle malformed adapter responses safely
11. Preserve results from adapters that completed
12. Abort only genuinely unfinished work
=========================================================
*/

const adapters = require("./registry");

const { getPlatformsForCategory } = require("./categoryRouter");

const { REQUEST_MODES, getRequestMode } = require("./stocksenseRequestMode");

/*
=========================================================
 CONFIGURATION
=========================================================
*/

const SEARCH_CONFIG = {
  /*
    Absolute main search budget.
    */

  GLOBAL_TIMEOUT: 6500,

  /*
    Individual marketplace budget.

    IMPORTANT:
    This is intentionally below the global deadline,
    but high enough to avoid losing valid results from
    platforms that finish slightly after 2800ms.
    */

  PLATFORM_TIMEOUT: 6000,

  /*
    Extra grace period.

    Used only to allow an adapter that is already
    finishing to publish its result.
    */

  RESULT_GRACE_PERIOD: 750,

  /*
    Maximum queries sent to one platform.
    */

  MAX_QUERIES_PER_PLATFORM: 2,

  /*
    Never allow a query timeout below this value.
    */

  MIN_QUERY_TIMEOUT: 250,

  /*
    Small reservation for final aggregation.
    */

  RETURN_RESERVE_MS: 50,

  /*
    -----------------------------------------------------
    GENERIC EARLY COMPLETION
    -----------------------------------------------------

    Generic searches do not need to wait for every
    marketplace when enough marketplace coverage has
    already been collected.

    IMPORTANT:
    This is used ONLY for GENERIC requests.

    URL / IMAGE / SPECIFIC searches continue using
    the existing global timeout flow.
    */

  GENERIC_EARLY_COMPLETION: true,

  GENERIC_MIN_COMPLETED_PLATFORMS: 2,

  GENERIC_MIN_PRODUCTS: 20,
};

/*
=========================================================
 TIME
=========================================================
*/

function now() {
  return Date.now();
}

function remainingUntil(deadline) {
  return Math.max(0, deadline - now());
}

/*
=========================================================
 SAFE HELPERS
=========================================================
*/

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function safeString(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

/*
=========================================================
 NORMALIZE SEARCH QUERY
=========================================================

Removes placeholder values and repeated query tokens before
queries are sent to marketplace adapters.

Examples:

    "puma hustle v 2 men's shoes v 2 white white"
        -> "puma hustle v 2 men's shoes white"

    "llpcm 17 null grey"
        -> "llpcm 17 grey"
=========================================================
*/

function normalizeSearchQuery(query) {
  const value = safeString(query);

  if (!value) {
    return "";
  }

  const tokens = value.split(/\s+/);

  const seen = new Set();

  const cleaned = [];

  for (const token of tokens) {
    const cleanToken = safeString(token);

    if (!cleanToken) {
      continue;
    }

    const key = cleanToken.toLowerCase();

    if (key === "null" || key === "undefined") {
      continue;
    }

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    cleaned.push(cleanToken);
  }

  return cleaned.join(" ").trim();
}

/*
=========================================================
 SPECIFIC SEARCH
=========================================================
*/

function isSpecificProductSearch(originalProduct = {}) {
  if (!originalProduct || typeof originalProduct !== "object") {
    return false;
  }

  /*
    URL/image input is inherently specific.
    */

  if (
    originalProduct.inputType === "url" ||
    originalProduct.inputType === "image"
  ) {
    return true;
  }

  const specificFields = [
    "model",
    "variant",
    "weight",
    "flavour",
    "color",
    "storage",
    "ram",
  ];

  if (specificFields.some((field) => hasValue(originalProduct[field]))) {
    return true;
  }

  const title = safeString(originalProduct.title);

  const productName = safeString(originalProduct.productName);

  /*
    A branded product whose full title contains
    significantly more information than productName
    is treated as specific.
    */

  if (
    hasValue(originalProduct.brand) &&
    title &&
    productName &&
    title.toLowerCase() !== productName.toLowerCase() &&
    title.length >= productName.length + 8
  ) {
    return true;
  }

  return false;
}

/*
=========================================================
 NORMALIZE ONE PLATFORM RESULT
=========================================================
*/

function normalizePlatformResults(results, adapter) {
  if (!Array.isArray(results)) {
    return [];
  }

  const platformName =
    safeString(adapter?.platform || adapter?.name || "Unknown") || "Unknown";

  const normalized = [];

  for (const product of results) {
    if (!product || typeof product !== "object") {
      continue;
    }

    const title =
      product.productName ||
      product.product ||
      product.title ||
      product.name ||
      "";

    const url =
      product.productUrl ||
      product.landingPageUrl ||
      product.url ||
      product.link ||
      "";

    const cleanTitle = safeString(title);

    const cleanUrl = safeString(url);

    /*
        Candidate Collector requires both a title
        and a URL.
        */

    if (!cleanTitle || !cleanUrl) {
      continue;
    }

    normalized.push({
      ...product,

      productName: cleanTitle,

      title: cleanTitle,

      price: product.price ?? product.currentPrice ?? product.salePrice ?? null,

      image:
        product.image ||
        product.searchImage ||
        product.imageUrl ||
        product.thumbnail ||
        "",

      url: cleanUrl,

      productUrl: cleanUrl,

      platform: product.platform || platformName,
    });
  }

  /*
    Deduplicate within one platform.
    */

  const seen = new Set();

  return normalized.filter((product) => {
    const platform = safeString(product.platform).toLowerCase();

    const title = safeString(product.productName)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    const url = safeString(product.url).toLowerCase().trim();

    const key = url ? `${platform}|url|${url}` : `${platform}|title|${title}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

/*
=========================================================
 SEARCH ONE QUERY
=========================================================
*/

async function executeAdapterQuery({
  adapter,
  query,
  originalProduct,
  hardDeadline,
  controller,
}) {
  const platformName =
    safeString(adapter?.platform || adapter?.name || "Unknown") || "Unknown";

  /*
    Stop immediately if this adapter was aborted.
    */

  if (controller.signal.aborted) {
    return {
      query,
      products: [],
      completed: false,
      timedOut: true,
      aborted: true,
      error: false,
    };
  }

  const remaining = remainingUntil(hardDeadline);

  if (remaining <= 0) {
    return {
      query,
      products: [],
      completed: false,
      timedOut: true,
      aborted: false,
      error: false,
    };
  }

  /*
    Reserve a tiny amount of time for aggregation.
    */

  const queryTimeout = Math.max(
    SEARCH_CONFIG.MIN_QUERY_TIMEOUT,
    Math.min(
      SEARCH_CONFIG.PLATFORM_TIMEOUT,
      Math.max(
        SEARCH_CONFIG.MIN_QUERY_TIMEOUT,
        remaining - SEARCH_CONFIG.RETURN_RESERVE_MS,
      ),
    ),
  );

  /*
    Select fastest available adapter method.
    */

  let searchFunction = null;

  if (typeof adapter.searchFast === "function") {
    searchFunction = adapter.searchFast.bind(adapter);
  } else if (typeof adapter.search === "function") {
    searchFunction = adapter.search.bind(adapter);
  }

  if (!searchFunction) {
    console.log(`[${platformName}] No search method available`);

    return {
      query,
      products: [],
      completed: false,
      timedOut: false,
      aborted: false,
      error: true,
    };
  }

  query = normalizeSearchQuery(query);

  if (!query) {
    return {
      query: "",
      products: [],
      completed: false,
      timedOut: false,
      aborted: false,
      error: false,
    };
  }

  console.log(
    `[${platformName}] Query "${query}" starting with ${queryTimeout}ms budget`,
  );

  /*
    -----------------------------------------------------
    START ADAPTER
    -----------------------------------------------------
    */

  let adapterPromise;

  try {
    adapterPromise = Promise.resolve(
      searchFunction(query, originalProduct, {
        timeout: queryTimeout,

        deadline: hardDeadline,

        signal: controller.signal,
      }),
    );
  } catch (error) {
    console.log(
      `[${platformName}] Query "${query}" threw synchronously: ${error.message}`,
    );

    return {
      query,
      products: [],
      completed: false,
      timedOut: false,
      aborted: false,
      error,
    };
  }

  /*
    -----------------------------------------------------
    MANAGER TIMEOUT
    -----------------------------------------------------

    IMPORTANT:

    Promise.race is used only to prevent the manager
    from waiting forever.

    If the adapter has already resolved at the same
    moment, its result wins and is preserved.
    -----------------------------------------------------
    */

  let timer = null;

  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({
        __managerTimeout: true,
      });
    }, queryTimeout);
  });

  let outcome;

  try {
    outcome = await Promise.race([
      adapterPromise
        .then((results) => ({
          __adapterCompleted: true,

          results,
        }))
        .catch((error) => ({
          __adapterError: true,

          error,
        })),

      timeoutPromise,
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /*
    -----------------------------------------------------
    ADAPTER COMPLETED
    -----------------------------------------------------
    */

  if (outcome && outcome.__adapterCompleted) {
    const normalized = normalizePlatformResults(outcome.results, adapter);

    console.log(
      `[${platformName}] Query "${query}" completed with ${normalized.length} products`,
    );

    return {
      query,

      products: normalized,

      completed: true,

      timedOut: false,

      aborted: false,

      error: false,
    };
  }

  /*
    -----------------------------------------------------
    ADAPTER ERROR
    -----------------------------------------------------
    */

  if (outcome && outcome.__adapterError) {
    const error = outcome.error;

    /*
        Abort errors are not treated as fatal errors.
        */

    if (controller.signal.aborted) {
      return {
        query,

        products: [],

        completed: false,

        timedOut: true,

        aborted: true,

        error: false,
      };
    }

    console.log(
      `[${platformName}] Query "${query}" failed: ${error?.message || error}`,
    );

    return {
      query,

      products: [],

      completed: false,

      timedOut: false,

      aborted: false,

      error: error || true,
    };
  }

  /*
    -----------------------------------------------------
    MANAGER TIMEOUT
    -----------------------------------------------------
    */

  if (outcome && outcome.__managerTimeout) {
    console.log(`[${platformName}] Query "${query}" reached manager timeout`);

    /*
        IMPORTANT:

        Do NOT immediately destroy the result.

        The adapter may have completed at almost exactly
        the same time. Give the adapter promise one
        microtask turn to settle.

        This prevents the classic:
            2801ms adapter result
            2800ms manager timeout
            => valid result lost
        */

    const lateResult = await Promise.race([
      adapterPromise
        .then((results) => ({
          completed: true,

          results,
        }))
        .catch(() => ({
          completed: false,
        })),

      new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              completed: false,
            }),
          25,
        ),
      ),
    ]);

    if (lateResult && lateResult.completed) {
      const normalized = normalizePlatformResults(lateResult.results, adapter);

      console.log(
        `[${platformName}] Query "${query}" completed during timeout race with ${normalized.length} products`,
      );

      return {
        query,

        products: normalized,

        completed: true,

        timedOut: false,

        aborted: false,

        error: false,
      };
    }

    return {
      query,

      products: [],

      completed: false,

      timedOut: true,

      aborted: controller.signal.aborted,

      error: false,
    };
  }

  /*
    -----------------------------------------------------
    UNKNOWN OUTCOME
    -----------------------------------------------------
    */

  return {
    query,

    products: [],

    completed: false,

    timedOut: false,

    aborted: controller.signal.aborted,

    error: false,
  };
}

/*
=========================================================
 SEARCH ONE PLATFORM
=========================================================
*/

async function searchPlatform(
  adapter,
  queries,
  originalProduct,
  searchDeadline,
  hardDeadline,
  controller,
) {
  const platformName =
    safeString(adapter?.platform || adapter?.name || "Unknown") || "Unknown";

  /*
    Normalize query list.
    */

  const queryList = Array.from(
    new Set(
      (Array.isArray(queries) ? queries : [queries])
        .map((query) => normalizeSearchQuery(query))
        .filter(Boolean),
    ),
  ).slice(0, SEARCH_CONFIG.MAX_QUERIES_PER_PLATFORM);

  if (queryList.length === 0) {
    return {
      platform: platformName,

      products: [],

      completed: false,

      timedOut: false,

      error: false,
    };
  }

  if (controller.signal.aborted) {
    return {
      platform: platformName,

      products: [],

      completed: false,

      timedOut: true,

      error: false,
    };
  }

  if (remainingUntil(hardDeadline) <= 0) {
    return {
      platform: platformName,

      products: [],

      completed: false,

      timedOut: true,

      error: false,
    };
  }

  console.log(`[${platformName}] Starting search`);

  console.log(`[${platformName}] Queries:`, queryList);

  /*
    -----------------------------------------------------
    SAME-PLATFORM QUERIES RUN CONCURRENTLY
    -----------------------------------------------------
    */

  const queryPromises = queryList.map((query) =>
    executeAdapterQuery({
      adapter,
      query,
      originalProduct,
      hardDeadline,
      controller,
    }),
  );

  const queryResults = await Promise.all(queryPromises);

  /*
    -----------------------------------------------------
    MERGE QUERY RESULTS
    -----------------------------------------------------
    */

  const mergedProducts = [];

  const seen = new Set();

  for (const result of queryResults) {
    if (!result || !Array.isArray(result.products)) {
      continue;
    }

    for (const product of result.products) {
      if (!product) {
        continue;
      }

      const url = safeString(product.url || product.productUrl)
        .toLowerCase()
        .trim();

      const title = safeString(product.productName || product.title)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      if (!url && !title) {
        continue;
      }

      const key = url
        ? `${platformName}|url|${url}`
        : `${platformName}|title|${title}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      mergedProducts.push(product);
    }
  }

  const successfulQueries = queryResults.filter(
    (result) => result?.completed === true,
  ).length;

  const timedOutQueries = queryResults.filter(
    (result) => result?.timedOut === true,
  ).length;

  const hasErrors = queryResults.some((result) => Boolean(result?.error));

  /*
    IMPORTANT:

    If ANY query completed successfully,
    this platform is considered completed even
    if another query timed out.
    */

  const completed = successfulQueries > 0;

  const timedOut = !completed && timedOutQueries > 0;

  console.log(
    `[${platformName}] Completed queries: ${successfulQueries}/${queryResults.length}, products: ${mergedProducts.length}`,
  );

  return {
    platform: platformName,

    products: mergedProducts,

    completed,

    timedOut,

    error: !completed && hasErrors,
  };
}

/*
=========================================================
 GENERIC EARLY COMPLETION CHECK
=========================================================

Returns true when a GENERIC search already has enough
marketplace coverage to provide a useful response.

Requirements:

    1. At least 2 marketplaces completed successfully
    2. At least 20 products collected

IMPORTANT:

    This helper is ONLY called for GENERIC requests.

URL / IMAGE / SPECIFIC searches never use this path.
=========================================================
*/

function hasGenericEarlyCompletion(platformEntries) {
  if (!Array.isArray(platformEntries)) return false;

  let completedPlatforms = 0;
  let totalProducts = 0;

  for (const entry of platformEntries) {
    if (!entry || !entry.completed) continue;

    const products = Array.isArray(entry.result?.products)
      ? entry.result.products
      : [];

    if (entry.result?.completed === true && products.length > 0) {
      completedPlatforms++;
      totalProducts += products.length;
    }
  }

  return (
    completedPlatforms >= SEARCH_CONFIG.GENERIC_MIN_COMPLETED_PLATFORMS &&
    totalProducts >= SEARCH_CONFIG.GENERIC_MIN_PRODUCTS
  );
}

/*
=========================================================
 WAIT FOR GENERIC EARLY COMPLETION
=========================================================

Resolves TRUE as soon as enough completed marketplace
results exist.

Resolves FALSE if every platform finishes before the
threshold is reached.

This does NOT change the existing timeout behavior.
=========================================================
*/

function waitForGenericEarlyCompletion(platformEntries) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    // Check immediately in case the threshold was already reached.
    if (hasGenericEarlyCompletion(platformEntries)) {
      finish(true);
      return;
    }

    let remainingTasks = platformEntries.length;

    if (remainingTasks === 0) {
      finish(false);
      return;
    }

    for (const entry of platformEntries) {
      if (!entry || !entry.task || typeof entry.task.then !== "function") {
        remainingTasks--;

        if (remainingTasks <= 0) {
          finish(false);
        }

        continue;
      }

      entry.task
        .then(() => {
          // IMPORTANT:
          // SearchManager may already have returned because
          // generic early completion was reached.
          // Ignore all later platform completions.
          if (settled) return;

          if (hasGenericEarlyCompletion(platformEntries)) {
            finish(true);
            return;
          }

          remainingTasks--;

          if (remainingTasks <= 0) {
            finish(false);
          }
        })
        .catch(() => {
          if (settled) return;

          remainingTasks--;

          if (remainingTasks <= 0) {
            finish(false);
          }
        });
    }
  });
}

/*
=========================================================
 SEARCH ALL PLATFORMS
=========================================================
*/

async function searchAll(queries, originalProduct, category = "electronics") {
  const startedAt = now();

  /*
    -----------------------------------------------------
    NORMALIZE SEARCH QUERIES
    -----------------------------------------------------
    */

  const searchQueries = Array.isArray(queries)
    ? Array.from(
        new Set(
          queries.map((query) => normalizeSearchQuery(query)).filter(Boolean),
        ),
      ).slice(0, 3)
    : [normalizeSearchQuery(queries)].filter(Boolean);

  const primaryQuery = searchQueries[0];

  if (!primaryQuery) {
    console.log("[SearchManager] Empty search query");

    return [];
  }

  /*
    -----------------------------------------------------
    REQUEST MODE
    -----------------------------------------------------
    */

  let requestMode;

  try {
    requestMode = getRequestMode(originalProduct || {});
  } catch (error) {
    console.log(
      `[SearchManager] Request mode detection failed: ${error.message}`,
    );

    requestMode = REQUEST_MODES.GENERIC;
  }

  /*
    Specific/branded searches should normally use
    only the primary query.

    Generic searches can use multiple queries.
    */

  const platformQueries =
    requestMode === REQUEST_MODES.GENERIC
      ? searchQueries.slice(0, SEARCH_CONFIG.MAX_QUERIES_PER_PLATFORM)
      : [primaryQuery];

  console.log(`[SearchManager] Search mode: ${requestMode}`);

  console.log(
    `[SearchManager] Platform query fan-out: ${platformQueries.length}`,
  );

  /*
    -----------------------------------------------------
    DEADLINES
    -----------------------------------------------------
    */

  const globalDeadline = startedAt + SEARCH_CONFIG.GLOBAL_TIMEOUT;

  const hardDeadline = globalDeadline + SEARCH_CONFIG.RESULT_GRACE_PERIOD;

  /*
    -----------------------------------------------------
    CATEGORY ROUTING
    -----------------------------------------------------
    */

  let allowedPlatforms = [];

  try {
    allowedPlatforms = safeArray(getPlatformsForCategory(category));
  } catch (error) {
    console.log(`[SearchManager] Category routing failed: ${error.message}`);

    allowedPlatforms = [];
  }

  console.log(`[SearchManager] Category: ${category}`);

  console.log(`[SearchManager] Platforms: ${allowedPlatforms.join(", ")}`);

  /*
    -----------------------------------------------------
    ACTIVE ADAPTERS
    -----------------------------------------------------
    */

  const activeAdapters = allowedPlatforms
    .map((platformName) =>
      adapters.find((adapter) => adapter && adapter.platform === platformName),
    )
    .filter(Boolean);

  console.log(`[SearchManager] Active adapters: ${activeAdapters.length}`);

  if (activeAdapters.length === 0) {
    console.log("[SearchManager] No active adapters");

    return [];
  }

  /*
    -----------------------------------------------------
    CREATE PLATFORM ENTRIES
    -----------------------------------------------------

    Each entry owns its own state.

    This is important because the global Promise.race
    must never erase a result that has already arrived.
    -----------------------------------------------------
    */

  const platformEntries = activeAdapters.map((adapter) => ({
    adapter,

    controller: new AbortController(),

    started: false,

    completed: false,

    result: null,

    task: null,
  }));

  /*
    -----------------------------------------------------
    START ALL PLATFORMS IMMEDIATELY
    -----------------------------------------------------
    */

  for (const entry of platformEntries) {
    const platformName =
      safeString(entry.adapter.platform || entry.adapter.name || "Unknown") ||
      "Unknown";

    entry.started = true;

    entry.task = (async () => {
      try {
        const result = await searchPlatform(
          entry.adapter,
          platformQueries,
          originalProduct,
          globalDeadline,
          hardDeadline,
          entry.controller,
        );

        /*
                    Store result IMMEDIATELY.

                    Do not wait for Promise.all.
                    Do not depend on global timeout state.
                    */

        entry.result = result;

        entry.completed = true;

        return result;
      } catch (error) {
        console.log(`[${platformName}] Unexpected error: ${error.message}`);

        const result = {
          platform: platformName,

          products: [],

          completed: false,

          timedOut: false,

          error: true,
        };

        entry.result = result;

        entry.completed = true;

        return result;
      }
    })();
  }

  /*
    -----------------------------------------------------
    WAIT UNTIL MAIN DEADLINE
    -----------------------------------------------------
    */

  const mainRemaining = remainingUntil(globalDeadline);

  /*
    -----------------------------------------------------
    MAIN WAIT
    -----------------------------------------------------

    GENERIC:

        Return early when enough marketplace coverage
        is already available.

    SPECIFIC / BRANDED / URL / IMAGE:

        Preserve the existing timeout behavior.
    -----------------------------------------------------
    */

  let genericEarlyCompleted = false;

  if (mainRemaining > 0) {
    const allPlatformsFinished = Promise.allSettled(
      platformEntries.map((entry) => entry.task),
    );

    const mainTimeout = new Promise((resolve) =>
      setTimeout(() => resolve("timeout"), mainRemaining),
    );

    if (
      requestMode === REQUEST_MODES.GENERIC &&
      SEARCH_CONFIG.GENERIC_EARLY_COMPLETION
    ) {
      const genericEarlyCompletion = waitForGenericEarlyCompletion(
        platformEntries,
      ).then((completed) => (completed ? "generic-early" : "all-finished"));

      const waitResult = await Promise.race([
        allPlatformsFinished.then(() => "all-finished"),

        genericEarlyCompletion,

        mainTimeout,
      ]);

      if (waitResult === "generic-early") {
        genericEarlyCompleted = true;

        console.log(
          `[SearchManager] ⚡ ` +
            `GENERIC search completed early ` +
            `after ${now() - startedAt}ms`,
        );
      }
    } else {
      /*
            -------------------------------------------------
            EXISTING PATH

            This remains unchanged for:

                URL
                IMAGE
                SPECIFIC
                BRANDED
            -------------------------------------------------
            */

      await Promise.race([allPlatformsFinished, mainTimeout]);
    }
  }

  /*
    -----------------------------------------------------
    COLLECT RESULTS BEFORE ABORTING
    -----------------------------------------------------

    This is the critical ordering.

    OLD BUG:

        timeout
          ↓
        abort
          ↓
        collect

    could lose a result that completed around the
    timeout boundary.

    NEW:

        timeout
          ↓
        collect already-completed results
          ↓
        grace
          ↓
        collect again
          ↓
        abort remaining work
    -----------------------------------------------------
    */

  let completedProducts = collectCompletedProducts(platformEntries);

  /*
    -----------------------------------------------------
    GRACE PERIOD
    -----------------------------------------------------
    */

  const hardRemaining = remainingUntil(hardDeadline);

  if (
    !genericEarlyCompleted &&
    hardRemaining > 0 &&
    hasUnfinishedPlatforms(platformEntries)
  ) {
    console.log(
      `[SearchManager] Main budget reached at ${now() - startedAt}ms`,
    );

    await Promise.race([
      Promise.allSettled(
        platformEntries
          .filter((entry) => !entry.completed)
          .map((entry) => entry.task),
      ),

      new Promise((resolve) => setTimeout(resolve, hardRemaining)),
    ]);
  }

  /*
    -----------------------------------------------------
    FINAL COLLECTION
    -----------------------------------------------------

    Recollect after grace because a platform may have
    completed during the grace window.
    */

  completedProducts = collectCompletedProducts(platformEntries);

  /*
    -----------------------------------------------------
    ABORT ONLY STILL-RUNNING PLATFORMS
    -----------------------------------------------------
    */

  for (const entry of platformEntries) {
    if (entry.started && !entry.completed && !entry.controller.signal.aborted) {
      const platformName =
        safeString(entry.adapter.platform || entry.adapter.name || "Unknown") ||
        "Unknown";

      console.log(
        `[SearchManager] Aborting unfinished platform: ${platformName}`,
      );

      try {
        entry.controller.abort();
      } catch {
        /*
                Ignore abort failures.
                */
      }
    }
  }

  /*
    -----------------------------------------------------
    GLOBAL DEDUPLICATION
    -----------------------------------------------------
    */

  const finalProducts = [];

  const seenProducts = new Set();

  for (const product of completedProducts) {
    if (!product) {
      continue;
    }

    const platform = safeString(product.platform).toLowerCase() || "unknown";

    const url = safeString(product.url || product.productUrl)
      .toLowerCase()
      .trim();

    const title = safeString(product.productName || product.title)
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

    if (!url && !title) {
      continue;
    }

    const key = url ? `${platform}|url|${url}` : `${platform}|title|${title}`;

    if (seenProducts.has(key)) {
      continue;
    }

    seenProducts.add(key);

    finalProducts.push(product);
  }

  /*
    -----------------------------------------------------
    PLATFORM SUMMARY
    -----------------------------------------------------
    */

  const platformCounts = {};

  for (const product of finalProducts) {
    const platform = product.platform || "unknown";

    platformCounts[platform] = (platformCounts[platform] || 0) + 1;
  }

  console.log("[SearchManager] Final platform counts:");

  for (const [platform, count] of Object.entries(platformCounts)) {
    console.log(`  ${platform}: ${count}`);
  }

  console.log(`[SearchManager] Returning ${finalProducts.length} products`);

  console.log(`[SearchManager] Total time: ${now() - startedAt}ms`);

  return finalProducts;
}

/*
=========================================================
 COLLECT COMPLETED PRODUCTS
=========================================================

This function is intentionally separate.

It reads the current state of every platform entry.

A platform is included when:

    entry.completed === true
    AND
    entry.result.completed === true
    AND
    result.products is an array

This prevents the global timeout from accidentally
discarding a valid result.
=========================================================
*/

function collectCompletedProducts(platformEntries) {
  const products = [];

  for (const entry of platformEntries) {
    if (!entry || !entry.completed || !entry.result) {
      continue;
    }

    const result = entry.result;

    if (result.completed !== true) {
      continue;
    }

    if (!Array.isArray(result.products)) {
      continue;
    }

    if (result.products.length === 0) {
      continue;
    }

    products.push(...result.products);
  }

  return products;
}

/*
=========================================================
 CHECK UNFINISHED PLATFORMS
=========================================================
*/

function hasUnfinishedPlatforms(platformEntries) {
  return platformEntries.some(
    (entry) => entry && entry.started && !entry.completed,
  );
}

/*
=========================================================
 EXPORTS
=========================================================
*/

module.exports = {
  searchAll,

  searchPlatform,

  normalizePlatformResults,

  isSpecificProductSearch,

  normalizeSearchQuery,

  collectCompletedProducts,

  SEARCH_CONFIG,
};
