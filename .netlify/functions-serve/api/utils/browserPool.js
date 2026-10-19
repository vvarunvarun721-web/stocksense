const { chromium } = require("playwright");

/*
=====================================================
SHARED BROWSER
=====================================================
*/

let browser = null;

/*
A shared launch promise prevents concurrent requests
from launching multiple Chromium instances.

Example:

User A -> getBrowser()
User B -> getBrowser()
User C -> getBrowser()

All three wait for the same launch operation.
*/

let browserLaunchPromise = null;

/*
=====================================================
POOL CONFIGURATION
=====================================================
*/

const MAX_CONCURRENT_PAGES = Math.max(
  1,
  Number(process.env.BROWSER_MAX_CONCURRENT_PAGES || 12),
);

/*
=====================================================
POOL STATE
=====================================================
*/

let activePages = 0;

const waitingRequests = [];

let shuttingDown = false;

/*
=====================================================
HEADLESS MODE
=====================================================
*/

function isHeadless() {
  return (
    String(process.env.BROWSER_HEADLESS || "true").toLowerCase() === "true"
  );
}

/*
=====================================================
GET BROWSER
=====================================================
*/

async function getBrowser() {
  if (browser && browser.isConnected()) {
    return browser;
  }

  if (shuttingDown) {
    throw new Error("Browser pool is shutting down.");
  }

  /*
    IMPORTANT:

    If another request is already launching Chromium,
    reuse that same promise instead of starting another
    browser.
    */

  if (browserLaunchPromise) {
    return browserLaunchPromise;
  }

  console.log("🚀 Launching Browser Pool...");

  browserLaunchPromise = chromium
    .launch({
      headless: isHeadless(),
    })
    .then((launchedBrowser) => {
      browser = launchedBrowser;

      browser.on("disconnected", () => {
        browser = null;
      });

      return browser;
    })
    .finally(() => {
      browserLaunchPromise = null;
    });

  return browserLaunchPromise;
}

/* 
===================================================== 
PROCESS WAITING PAGE REQUESTS 
===================================================== 
*/

function processQueue() {
  while (
    activePages < MAX_CONCURRENT_PAGES &&
    waitingRequests.length > 0 &&
    !shuttingDown
  ) {
    const next = waitingRequests.shift();

    if (!next) {
      continue;
    }

    activePages++;

    next.resolve();

    console.log(
      `POOL: queued request promoted | active=${activePages}/${MAX_CONCURRENT_PAGES} | queued=${waitingRequests.length}`,
    );
  }
}

/* 
===================================================== 
ACQUIRE PAGE SLOT 
===================================================== 
*/

async function acquirePageSlot() {
  if (shuttingDown) {
    throw new Error("Browser pool is shutting down.");
  }

  /*
    =============================================
    SLOT AVAILABLE IMMEDIATELY
    =============================================
    */

  if (activePages < MAX_CONCURRENT_PAGES) {
    activePages++;

    return;
  }

  /*
    =============================================
    POOL FULL
    =============================================
    */

  console.log(
    `POOL: saturated | active=${activePages}/${MAX_CONCURRENT_PAGES} | queued=${waitingRequests.length}`,
  );

  await new Promise((resolve, reject) => {
    waitingRequests.push({
      resolve,

      reject,
    });

    console.log(
      `POOL: request queued | active=${activePages}/${MAX_CONCURRENT_PAGES} | queued=${waitingRequests.length}`,
    );
  });

  if (shuttingDown) {
    throw new Error("Browser pool is shutting down.");
  }
}

/*
=====================================================
RELEASE PAGE SLOT
=====================================================
*/

function releasePageSlot() {
  if (activePages > 0) {
    activePages--;
  }

  processQueue();
}

/*
=====================================================
GET PAGE
=====================================================
*/

/* 
===================================================== 
GET PAGE 
===================================================== 
*/

async function getPage() {
  /*
    Start timing BEFORE acquiring the slot.

    This measures the real wait caused by pool
    contention.
    */

  const waitStarted = Date.now();

  console.log(
    `POOL: page requested | active=${activePages} queued=${waitingRequests.length}`,
  );

  /*
    =============================================
    ACQUIRE SLOT
    =============================================
    */

  await acquirePageSlot();

  const slotWait = Date.now() - waitStarted;

  console.log(
    `POOL: slot acquired | wait=${slotWait} ms | active=${activePages} queued=${waitingRequests.length}`,
  );

  let page = null;

  try {
    /*
        =============================================
        GET SHARED BROWSER
        =============================================
        */

    const sharedBrowser = await getBrowser();

    /*
        =============================================
        CREATE ISOLATED PAGE
        =============================================
        */

    page = await sharedBrowser.newPage();

    /*
        =============================================
        INTERNAL RELEASE MARKER
        =============================================
        */

    page.__browserPoolSlotReleased = false;

    console.log(
      `POOL: page created | active=${activePages} queued=${waitingRequests.length}`,
    );

    return page;
  } catch (error) {
    /*
        =============================================
        PAGE CREATION FAILED
        =============================================

        Slot must be returned immediately.
        =============================================
        */

    releasePageSlot();

    console.log(
      `POOL: page creation failed | active=${activePages} queued=${waitingRequests.length}`,
    );

    throw error;
  }
}

/*
=====================================================
CLOSE PAGE
=====================================================
*/

async function closePage(page) {
  if (!page) {
    return;
  }

  /*
    Always attempt to close the page first.

    The cleanup operation itself should never cause
    the caller's search operation to fail.
    */

  try {
    await page.close();
  } catch (_) {
    /*
        Ignore page-close errors.
        */
  }

  /*
    Release exactly one pool slot.
    */

  if (!page.__browserPoolSlotReleased) {
    page.__browserPoolSlotReleased = true;

    releasePageSlot();
  }
}

/*
=====================================================
POOL STATUS
=====================================================
*/

function getPoolStats() {
  return {
    maxConcurrentPages: MAX_CONCURRENT_PAGES,

    activePages,

    queuedRequests: waitingRequests.length,

    browserConnected: Boolean(browser && browser.isConnected()),
  };
}

/*
=====================================================
SHUTDOWN BROWSER
=====================================================
*/

async function shutdownBrowser() {
  shuttingDown = true;

  /*
    Reject requests that are waiting for a page slot.
    */

  const pendingRequests = waitingRequests.splice(0);

  for (const request of pendingRequests) {
    try {
      request.reject(
        new Error("Browser pool was shut down while request was waiting."),
      );
    } catch (_) {}
  }

  /*
    Wait for any browser launch already in progress.
    */

  if (browserLaunchPromise) {
    try {
      await browserLaunchPromise;
    } catch (_) {}
  }

  if (browser) {
    try {
      await browser.close();
    } catch (_) {}
  }

  browser = null;

  browserLaunchPromise = null;

  activePages = 0;

  shuttingDown = false;
}

/*
=====================================================
EXPORT
=====================================================
*/

module.exports = {
  getBrowser,

  getPage,

  closePage,

  shutdownBrowser,

  getPoolStats,
};
