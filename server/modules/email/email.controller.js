const Email = require("./email.model");
const { decrypt } = require("../../utils/crypto");

exports.getAllEmails = async (req, res) => {
  try {
    const emails = await Email.find({
      userId: req.user._id,
    }).sort({ receivedAt: -1 });

    const decrypted = emails.map((email) => ({
      ...email._doc,
      subject: decrypt(email.subject),
      snippet: decrypt(email.snippet),
      body: decrypt(email.body),
    }));

    res.json(decrypted);
  } catch (err) {
    console.error("Error fetching emails:", err);
    res.status(500).json({ message: "Server error" });
  }
};