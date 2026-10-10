const express = require("express");

const router = express.Router();

const {

    add,

    list,

    remove

} = require("../controllers/watchlistController");

router.post("/add", add);

router.get("/:userId", list);

router.delete("/remove", remove);

module.exports = router;