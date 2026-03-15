// webhooks/gmail.webhook.controller.js

const ConnectedAccount = require("../modules/connectedAccount/connectedAccount.model");
const Email = require("../modules/email/email.model");
const {
  refreshGoogleTokenIfNeeded,
  getGmailClient,
} = require("../services/google.service");

const { encrypt } = require("../utils/crypto");
const { classifyEmail } = require("../services/emailAI.service");

/**
 * Main webhook handler
 */
exports.handleGmailWebhook = async (req, res) => {
  try {
    console.log("📩 Gmail webhook received");

    // Implement webhook validation
    if (process.env.WEBHOOK_SECRET && req.query.token !== process.env.WEBHOOK_SECRET) {
        console.log("❌ Unauthorized webhook access");
        return res.sendStatus(403);
    }

    const message = req.body.message;

    if (!message || !message.data) {
      return res.sendStatus(200);
    }

    // Decode Pub/Sub message
    const decodedData = JSON.parse(
      Buffer.from(message.data, "base64").toString("utf-8")
    );

    const { emailAddress, historyId } = decodedData;

    console.log("Email:", emailAddress);
    console.log("New HistoryId:", historyId);

    const account = await ConnectedAccount.findOne({
      emailAddress,
      provider: "google",
      isActive: true,
    });

    if (!account) {
      console.log("❌ No connected account found");
      return res.sendStatus(200);
    }

    await fetchNewEmails(account, historyId);

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Gmail webhook error:", error);
    res.sendStatus(200); // IMPORTANT for Pub/Sub
  }
};

/**
 * Fetch new emails using history API
 */
async function fetchNewEmails(account, newHistoryId) {
  try {
    const oauthClient = await refreshGoogleTokenIfNeeded(account);
    const gmail = getGmailClient(oauthClient);

    const historyResponse = await gmail.users.history.list({
      userId: "me",
      startHistoryId: account.lastHistoryId,
    });

    if (!historyResponse.data.history) {
      account.lastHistoryId = newHistoryId;
      await account.save();
      return;
    }

    for (const record of historyResponse.data.history) {
      if (!record.messagesAdded) continue;

      for (const msgObj of record.messagesAdded) {
        const msg = msgObj.message;

        // Only process INBOX messages
        if (!msg.labelIds.includes("INBOX")) continue;

        const fullMessage = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
        });

        const headers = fullMessage.data.payload.headers;

        const subject =
          headers.find((h) => h.name === "Subject")?.value || "";

        const from =
          headers.find((h) => h.name === "From")?.value || "";

        const snippet = fullMessage.data.snippet || "";

        // Attempt resolving full body content
        let emailBody = snippet;
        let p = fullMessage.data.payload;
        if (p && p.parts) {
            // Find the most appropriate plain text or HTML part
            const textPart = p.parts.find((part) => part.mimeType === "text/plain");
            if (textPart && textPart.body && textPart.body.data) {
                emailBody = Buffer.from(textPart.body.data, "base64").toString("utf8");
            } else if (p.parts[0] && p.parts[0].body && p.parts[0].body.data) {
                emailBody = Buffer.from(p.parts[0].body.data, "base64").toString("utf8");
            }
        } else if (p && p.body && p.body.data) {
            emailBody = Buffer.from(p.body.data, "base64").toString("utf8");
        }

        try {
          // 1️⃣ Store encrypted email first
          await Email.create({
            userId: account.userId,
            connectedAccountId: account._id,
            provider: "google",
            providerMessageId: msg.id,
            subject: encrypt(subject),
            from,
            snippet: encrypt(snippet),
            body: encrypt(emailBody),
            receivedAt: new Date(
              parseInt(fullMessage.data.internalDate)
            ),
          });

          console.log("✅ Email stored:", subject);

          // 2️⃣ AI Classification
          const aiResult = await classifyEmail(subject, snippet);

          let deadlineDate;

          if (aiResult.deadline) {
            deadlineDate = new Date(aiResult.deadline);
            // Verify if Date is actually valid
            if (Number.isNaN(deadlineDate.getTime())) {
                deadlineDate = new Date();
                deadlineDate.setDate(deadlineDate.getDate() + 1);
            }
          } else {
            // If no deadline → next day
            deadlineDate = new Date();
            deadlineDate.setDate(deadlineDate.getDate() + 1);
          }

          const expiryDate = new Date(deadlineDate);
          expiryDate.setDate(expiryDate.getDate() + 5);

          // 3️⃣ Update email with AI result
          await Email.updateOne(
            { providerMessageId: msg.id },
            {
              category: aiResult.category,
              deadlineDate,
              expiryDate,
              aiProcessed: true,
            }
          );

          console.log("🤖 AI classification completed");

        } catch (err) {
          if (err.code === 11000) {
            console.log("⚠️ Duplicate skipped");
          } else {
            console.error("Email save error:", err);
          }
        }
      }
    }

    account.lastHistoryId = newHistoryId;
    await account.save();

  } catch (error) {
    console.error("Fetch email error:", error);
  }
}