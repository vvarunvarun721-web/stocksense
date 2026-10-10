const express = require("express");

const verifyToken = require("../middleware/auth");

const {
  processProduct
} = require("../services/pipeline/productPipeline");

const router = express.Router();

/*
=====================================================
MANUALLY CHECK A PRODUCT
=====================================================

Frontend sends:

{
    "url": "https://www.amazon.in/..."
}

The existing StockSense product pipeline processes
that URL and returns the complete result.

=====================================================
*/

router.post(
  "/check-now",
  verifyToken,
  async (req, res) => {

    try {

      const {
        url
      } = req.body;


      /*
      =============================================
      VALIDATE URL
      =============================================
      */

      if (
        !url ||
        typeof url !== "string" ||
        !url.trim()
      ) {

        return res.status(400).json({
          message: "Product URL is required"
        });

      }


      /*
      =============================================
      RUN EXISTING STOCKSENSE PIPELINE
      =============================================
      */

      console.log(
        `🔍 API CHECK REQUEST: ${url.trim()}`
      );


      const results =
        await processProduct(
          url.trim()
        );


      /*
      =============================================
      RESPONSE
      =============================================
      */

      return res.json({

        message: "Check complete",

        results

      });

    }
    catch (err) {

      console.error(
        "❌ Product check failed:",
        err
      );


      return res.status(500).json({

        message: "Server error",

        error: err.message

      });

    }

  }
);


module.exports = router;