const mongoose = require("mongoose");

const emailSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    connectedAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ConnectedAccount",
      required: true,
    },

    provider: {
      type: String,
      enum: ["google", "microsoft"],
      required: true,
    },

    providerMessageId: {
      type: String,
      required: true,
    },

    // 🔐 Encrypted fields
    subject: String,
    from: String,
    snippet: String,
    body: String,

    receivedAt: Date,

    category: {
      type: String,
      enum: ["job", "internship", "hackathon", "interview", "other"],
      default: "other",
    },

    stage: {
      type: String,
      enum: ["apply", "inprogress", "completed"],
      default: "apply",
    },

    deadlineDate: Date,
    expiryDate: Date,

    isExpired: {
      type: Boolean,
      default: false,
    },

    aiProcessed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Prevent duplicate email storage
emailSchema.index(
  { providerMessageId: 1, provider: 1 },
  { unique: true }
);

emailSchema.index({ userId: 1, receivedAt: -1 });

module.exports = mongoose.model("Email", emailSchema);