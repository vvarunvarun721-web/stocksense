const express = require("express");

const router = express.Router();

const {

    history

} = require("../controllers/searchHistoryController");

router.get("/:userId", history);

module.exports = router;