process.env.SCHEDULER_ENABLED = "false";

const serverless = require("serverless-http");
const mongoose = require("mongoose");
const app = require("../../server");

const expressHandler = serverless(app);

exports.handler = async (event, context) => {
  if (context) {
    context.callbackWaitsForEmptyEventLoop = false;
  }

  try {
    await mongoose.connection.asPromise();
  } catch (error) {
    console.error(
      "[StockSense] Database initialization failed:",
      error.message
    );

    return {
      statusCode: 503,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        error: "StockSense backend is temporarily unavailable."
      })
    };
  }

  return expressHandler(event, context);
};
