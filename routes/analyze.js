const express = require("express");

const router = express.Router();

const {

    analyzeProduct

} = require("../controllers/analyzeController");

router.post("/", analyzeProduct);

module.exports = router;