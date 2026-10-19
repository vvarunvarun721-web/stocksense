const mongoose =
  require("mongoose");


const productSchema =
  new mongoose.Schema(

    {

      title: {

        type: String,

        required: true

      },


      brand: String,

      category: String,

      weight: String,

      flavour: String,

      storage: String,

      ram: String,

      model: String,

      image: String,

      platform: String,


      url: {

        type: String,

        required: true,

        trim: true

      },


      currentPrice: {

        type: Number,

        default: null

      },


      /*
      =============================================
      SCHEDULER STATE
      =============================================
      */

      monitoringEnabled: {

        type: Boolean,

        default: true

      },


      lastChecked: {

        type: Date,

        default: null

      },


      lastSuccessfulCheck: {

        type: Date,

        default: null

      },


      lastCheckError: {

        type: String,

        default: null

      },


      consecutiveFailures: {

        type: Number,

        default: 0

      },


      retryAfter: {

        type: Date,

        default: null

      }

    },

    {

      timestamps: true

    }

  );


/*
=====================================================

ONE CANONICAL URL = ONE PRODUCT

MongoDB-level duplicate protection.

=====================================================
*/

productSchema.index(

  {

    url: 1

  },

  {

    unique: true

  }

);


module.exports =
  mongoose.model(

    "Product",

    productSchema

  );