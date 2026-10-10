const express = require("express");

const router = express.Router();

const {

    getDashboard

} = require("../controllers/dashboardController");

const verifyToken = require("../middleware/verifyToken");

router.get(

    "/",

    verifyToken,

    getDashboard

);

module.exports = router;