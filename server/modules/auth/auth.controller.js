const User = require("../user/user.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { sendOtpEmail } = require("../../services/otp.email.service");

exports.signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password || password.length < 6) {
      return res.status(400).json({ message: "Invalid input. Please provide name, email, and password (min 6 characters)." });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
       return res.status(400).json({ message: "Invalid email format." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use." });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashed,
    });

    res.status(201).json({
      message: "Account created successfully.",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};


const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password" });
    }

    const user = await User.findOne({ email }).select("+password");
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // Block Google/Microsoft OAuth accounts from using password login
    if (user.authProvider !== "local") {
      return res.status(400).json({
        message: `This account uses ${user.authProvider} sign-in. Please log in with ${user.authProvider}.`,
      });
    }

    if (!user.password) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = generateToken(user._id);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── Forgot Password ─────────────────────────────────────────────────────────
// POST /api/auth/forgot-password
// Body: { email }
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Please provide your email." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Generic message to avoid user enumeration
      return res.json({ message: "If this email exists, an OTP has been sent." });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));

    // Hash OTP before storing
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.passwordResetOtp = hashedOtp;
    user.passwordResetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    user.passwordResetToken = undefined;
    await user.save();

    await sendOtpEmail(user.email, otp);

    res.json({ message: "If this email exists, an OTP has been sent." });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── Verify OTP ───────────────────────────────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { email, otp }
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required." });
    }

    const user = await User.findOne({ email }).select(
      "+passwordResetOtp +passwordResetOtpExpiry"
    );

    if (!user || !user.passwordResetOtp || !user.passwordResetOtpExpiry) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    if (user.passwordResetOtpExpiry < new Date()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    const isMatch = await bcrypt.compare(otp, user.passwordResetOtp);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    // OTP verified — issue a short-lived reset token (15 min)
    const resetToken = jwt.sign(
      { id: user._id, purpose: "password-reset" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    // Clear OTP fields, store reset token
    user.passwordResetOtp = undefined;
    user.passwordResetOtpExpiry = undefined;
    user.passwordResetToken = resetToken;
    await user.save();

    res.json({ message: "OTP verified.", resetToken });
  } catch (error) {
    console.error("Verify OTP error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
// POST /api/auth/reset-password
// Body: { resetToken, newPassword }
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({ message: "Reset token and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "Invalid or expired reset token." });
    }

    if (decoded.purpose !== "password-reset") {
      return res.status(400).json({ message: "Invalid reset token." });
    }

    const user = await User.findById(decoded.id).select("+passwordResetToken");
    if (!user || user.passwordResetToken !== resetToken) {
      return res.status(400).json({ message: "Reset token already used or invalid." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = undefined;
    await user.save();

    res.json({ message: "Password reset successful. You can now log in." });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ─── Change Password (OTP verified) ──────────────────────────────────────────
// POST /api/auth/change-password
// Body: { resetToken, oldPassword, newPassword }
// Flow: forgot-password → verify-otp (get resetToken) → change-password
exports.changePassword = async (req, res) => {
  try {
    const { resetToken, oldPassword, newPassword } = req.body;

    if (!resetToken || !oldPassword || !newPassword) {
      return res.status(400).json({ message: "Reset token, old password, and new password are required." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters." });
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(400).json({ message: "Invalid or expired reset token." });
    }

    if (decoded.purpose !== "password-reset") {
      return res.status(400).json({ message: "Invalid reset token." });
    }

    const user = await User.findById(decoded.id).select("+password +passwordResetToken");
    if (!user || user.passwordResetToken !== resetToken) {
      return res.status(400).json({ message: "Reset token already used or invalid." });
    }

    // Verify old password
    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is incorrect." });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({ message: "New password must be different from the old password." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = undefined;
    await user.save();

    res.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};