const { extractSkills } = require("../../services/gemini.service");
const { uploadToS3 } = require("../../services/s3.service");
const User = require("./user.model");
const pdfParse = require("pdf-parse");
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
    // Guard — no file uploaded
    if (!req.file) {
      return res.status(400).json({ message: "Please upload a PDF or DOCX file." });
    }

    const fileBuffer = req.file.buffer;

    // Extract text from resume
    let extractedText;

    if (req.file.mimetype === "application/pdf") {
      const parsed = await pdfParse(fileBuffer);
      extractedText = parsed.text;
    } else {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      extractedText = result.value;
    }

    // Extract skills via Gemini AI
    const skills = await extractSkills(extractedText);

    // Upload to S3
    const { url, key } = await uploadToS3(
      fileBuffer,
      req.file.originalname,
      req.file.mimetype,
      req.user._id.toString()
    );

    // Save to user profile
    const user = await User.findById(req.user._id);
    user.resumeUrl = url;
    user.resumeS3Key = key;
    user.extractedSkills = skills;
    await user.save();

    res.json({
      message: "Resume processed and uploaded",
      resumeUrl: url,
      skills,
    });
  } catch (error) {
    console.error("Resume upload error:", error);
    res.status(500).json({ message: "Server error during file processing" });
  }
};