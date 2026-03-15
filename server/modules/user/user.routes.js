const express = require("express");
const router = express.Router();
const controller = require("./user.controller");
const { protect } = require("../../middlewares/auth.middleware");
const upload = require("../../middlewares/upload.middleware");

router.post("/upload-resume",protect,upload.single("file"),controller.uploadResume);
router.get("/me", protect, controller.getProfile);
router.put("/update", protect, controller.updateProfile);

module.exports = router;