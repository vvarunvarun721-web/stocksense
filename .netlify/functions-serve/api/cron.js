const cron =
  require("node-cron");


const {
  updateAllProducts
} =
  require(
    "./services/notification/productScheduler"
  );


const watchlistModule =
  require(
    "./services/notification/watchlistScheduler"
  );


/*
=====================================================
CONFIGURATION
=====================================================
*/

/*
Background scheduler is OFF unless explicitly enabled.

Development:
SCHEDULER_ENABLED=false

Production:
SCHEDULER_ENABLED=true
*/

const SCHEDULER_ENABLED =
  String(
    process.env.SCHEDULER_ENABLED ||
    "false"
  )
    .trim()
    .toLowerCase() === "true";


/*
Default schedule:
every 30 minutes.

The schedule can be overridden safely through
.env without changing source code.
*/

const SCHEDULER_CRON =
  String(
    process.env.SCHEDULER_CRON ||
    "*/30 * * * *"
  ).trim();


/*
=====================================================
WATCHLIST FUNCTION RESOLUTION
=====================================================

Supports the existing possible export names.
=====================================================
*/

const runWatchlistScheduler =
  watchlistModule.runWatchlistScheduler ||
  watchlistModule.runWatchlist ||
  watchlistModule.checkWatchlists ||
  watchlistModule.run;


/*
=====================================================
STATE
=====================================================
*/

let schedulerRunning =
  false;


let schedulerTask =
  null;


/*
=====================================================
RUN COMPLETE SCHEDULER
=====================================================
*/

async function runScheduler() {

  /*
  ---------------------------------------------------
  SAFETY GUARD
  ---------------------------------------------------

  This protects us even if runScheduler() is called
  manually while the previous cycle is still running.
  ---------------------------------------------------
  */

  if (
    schedulerRunning
  ) {

    console.log(
      "⏭️ Scheduler already running. Skipping this cycle."
    );

    return;

  }


  schedulerRunning =
    true;


  try {

    console.log(
      "\n⏰ Scheduler Started"
    );


    /*
    =============================================
    STEP 1
    UPDATE PRODUCTS
    =============================================
    */

    await updateAllProducts();


    /*
    =============================================
    STEP 2
    WATCHLIST NOTIFICATIONS
    =============================================
    */

    if (
      typeof runWatchlistScheduler ===
      "function"
    ) {

      await runWatchlistScheduler();

    }
    else {

      console.warn(
        "⚠️ Watchlist scheduler function not found. Skipping watchlist check."
      );

    }


    console.log(
      "✅ Scheduler Finished\n"
    );

  }
  catch (error) {

    console.error(
      "❌ Scheduler failed:",
      error?.message ||
      error
    );

  }
  finally {

    schedulerRunning =
      false;

  }

}


/*
=====================================================
START SCHEDULER
=====================================================

Important:
This function ONLY registers the background job.

It does NOT immediately execute runScheduler().
=====================================================
*/

function startScheduler() {

  /*
  ---------------------------------------------------
  ALREADY STARTED
  ---------------------------------------------------
  */

  if (
    schedulerTask
  ) {

    console.log(
      "⏭️ Scheduler already initialized."
    );

    return schedulerTask;

  }


  /*
  ---------------------------------------------------
  DISABLED
  ---------------------------------------------------
  */

  if (
    !SCHEDULER_ENABLED
  ) {

    console.log(
      "⏸️ Background scheduler disabled."
    );

    console.log(
      "   Set SCHEDULER_ENABLED=true to enable it."
    );

    return null;

  }


  /*
  ---------------------------------------------------
  CRON EXPRESSION VALIDATION
  ---------------------------------------------------
  */

  if (
    typeof cron.validate ===
    "function" &&
    !cron.validate(
      SCHEDULER_CRON
    )
  ) {

    console.error(
      `❌ Invalid scheduler cron expression: ${SCHEDULER_CRON}`
    );

    return null;

  }


  /*
  ---------------------------------------------------
  REGISTER TASK
  ---------------------------------------------------
  */

  try {

    schedulerTask =
      cron.schedule(
        SCHEDULER_CRON,
        runScheduler
      );


    console.log(
      `⏰ Price/stock scheduler started — ${SCHEDULER_CRON}`
    );


    return schedulerTask;

  }
  catch (error) {

    schedulerTask =
      null;


    console.error(
      "❌ Failed to start scheduler:",
      error?.message ||
      error
    );


    return null;

  }

}


/*
=====================================================
STOP SCHEDULER
=====================================================

Useful for graceful shutdown and testing.
=====================================================
*/

function stopScheduler() {

  if (
    !schedulerTask
  ) {

    return;

  }


  try {

    if (
      typeof schedulerTask.stop ===
      "function"
    ) {

      schedulerTask.stop();

    }


    /*
    Some node-cron versions expose destroy().
    The typeof check prevents compatibility errors.
    */

    if (
      typeof schedulerTask.destroy ===
      "function"
    ) {

      schedulerTask.destroy();

    }

  }
  catch (error) {

    console.error(
      "⚠️ Scheduler shutdown warning:",
      error?.message ||
      error
    );

  }
  finally {

    schedulerTask =
      null;

  }


  console.log(
    "🛑 Scheduler stopped."
  );

}


/*
=====================================================
EXPORT
=====================================================
*/

module.exports = {

  runScheduler,

  startScheduler,

  stopScheduler

};