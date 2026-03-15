const express = require("express");
const router = express.Router();
const controller = require("./auth.controller");

router.post("/signup", controller.signup);
router.post("/login", controller.login);

// OTP flow: forgot-password → verify-otp → change-password / reset-password
router.post("/forgot-password", controller.forgotPassword);
router.post("/verify-otp", controller.verifyOtp);
router.post("/reset-password", controller.resetPassword);   // no old password needed
router.post("/change-password", controller.changePassword); // old password required

module.exports = router;