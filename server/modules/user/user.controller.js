const { extractSkills } = require("../../services/gemini.service");
const User = require("./user.model");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const mammoth = require("mammoth");
// GET current user profile
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE profile (mobile + preferences)
exports.updateProfile = async (req, res) => {
  try {
    const { mobileNumber, countryCode, reminderPreferences } = req.body;

    const user = await User.findById(req.user._id);

    if (mobileNumber) user.mobileNumber = mobileNumber;
    if (countryCode) user.countryCode = countryCode;
    if (reminderPreferences) user.reminderPreferences = reminderPreferences;

    await user.save();

    res.json({ message: "Profile updated", user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

exports.uploadResume = async (req, res) => {
  try {
    const filePath = req.file.path;
    const dataBuffer = await fs.promises.readFile(filePath);

    let extractedText;

    if (req.file.mimetype === "application/pdf") {
      const parsed = await pdfParse(dataBuffer);
      extractedText = parsed.text;
    } else {
      const result = await mammoth.extractRawText({ buffer: dataBuffer });
      extractedText = result.value;
    }

    const skills = await extractSkills(extractedText);

    const user = await User.findById(req.user._id);
    user.resumeUrl = filePath;
    user.extractedSkills = skills;

    await user.save();

    // cleanup
    await fs.promises.unlink(filePath).catch(e => console.error("Failed to cleanup resume", e));

    res.json({
      message: "Resume processed",
      skills,
    });
  } catch (error) {
    console.error("Resume upload error:", error);
    res.status(500).json({ message: "Server error during file processing" });
  }
};