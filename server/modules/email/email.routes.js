const express = require("express");
const router = express.Router();
const controller = require("./email.controller");
const { protect } = require("../../middlewares/auth.middleware");

router.get("/", protect, controller.getAllEmails);

module.exports = router;