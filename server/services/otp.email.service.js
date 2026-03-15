const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // use Gmail App Password, not account password
  },
});

exports.sendOtpEmail = async (toEmail, otp) => {
  await transporter.sendMail({
    from: `"Mail-or-a" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Your OTP for Password Reset",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333;">Password Reset OTP</h2>
        <p style="color: #555;">Use the OTP below to reset your password. It is valid for <strong>10 minutes</strong>.</p>
        <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; text-align: center; padding: 16px 0; color: #2563eb;">
          ${otp}
        </div>
        <p style="color: #888; font-size: 13px;">If you did not request a password reset, please ignore this email.</p>
      </div>
    `,
  });
};
