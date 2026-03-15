const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    password: {
      type: String,
      select: false, // do not return by default
    },

    authProvider: {
      type: String,
      enum: ["local", "google", "microsoft"],
      default: "local",
    },

    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },

    microsoftId: {
      type: String,
      unique: true,
      sparse: true,
    },

    mobileNumber: {
      type: String,
      unique: true,
      sparse: true, // allows null but unique if present
    },

    countryCode: {
      type: String,
      default: "+91",
    },

    isMobileVerified: {
      type: Boolean,
      default: false,
    },

    reminderPreferences: {
      whatsapp: {
        type: Boolean,
        default: true,
      },
      email: {
        type: Boolean,
        default: true,
      },
    },

    resumeUrl: String,

    extractedSkills: [
      {
        type: String,
        trim: true,
      },
    ],

    passwordResetOtp: {
      type: String,
      select: false,
    },

    passwordResetOtpExpiry: {
      type: Date,
      select: false,
    },

    passwordResetToken: {
      type: String,
      select: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);