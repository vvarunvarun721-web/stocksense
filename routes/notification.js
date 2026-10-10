const express = require("express");

const router = express.Router();

const {

    list,

    read

} = require("../controllers/notificationController");

router.get("/:userId", list);

router.put("/read/:id", read);

module.exports = router;