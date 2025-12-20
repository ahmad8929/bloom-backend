const Nodemailer = require("nodemailer");
const { MailtrapTransport } = require("mailtrap");

// ===============================
// CONFIG
// ===============================
const MAILTRAP_TOKEN = process.env.MAILTRAP_TOKEN || "0873a4acf16f8376bd746cb02274269e";

const FRONTEND_URL = "https://bloomtales.shop";

if (!MAILTRAP_TOKEN) {
  console.warn("⚠️ MAILTRAP_TOKEN is missing");
}

const transport = Nodemailer.createTransport(
  MailtrapTransport({
    token: MAILTRAP_TOKEN,
  })
);

// ===============================
// EMAIL SENDER
// ===============================
const sendEmail = async ({ to, subject, template, context = {} }) => {
  
const safeVerificationUrl =
  context.verificationUrl ||
  `${FRONTEND_URL.replace(/\/$/, '')}/verify-email/${context.token || ''}`;

  try {
    console.log(`📧 Sending email → ${to}`);
    console.log(`📧 Template → ${template}`);

    // ===============================
    // EMAIL TEMPLATES
    // ===============================
    const templates = {
      // -------------------------------
      // EMAIL VERIFICATION
      // -------------------------------
      emailVerification: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Welcome ${context.name} 👋</h2>

          <p>Thank you for joining <strong>Bloom Tales</strong>.</p>

          <p>Please verify your email address to activate your account:</p>

          <a href="${safeVerificationUrl}"
            style="
              display: inline-block;
              padding: 12px 24px;
              background-color: #4CAF50;
              color: #ffffff;
              text-decoration: none;
              border-radius: 6px;
              font-weight: bold;
            ">
            Verify Email
          </a>

          <p style="margin-top: 20px;">
            If the button doesn’t work, copy and paste this link into your browser:
          </p>

          <p>
            <a href="${safeVerificationUrl}">
              ${safeVerificationUrl}
            </a>
          </p>

          <p style="font-size: 12px; color: #888;">
            This link will expire in 24 hours.
          </p>

          <hr />
          <p style="font-size: 12px; color: #999;">
            © Bloom Tales
          </p>
        </div>
      `,

      // -------------------------------
      // PASSWORD RESET OTP
      // -------------------------------
      passwordResetOTP: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Password Reset Request</h2>

          <p>Hello ${context.name},</p>

          <p>Use the OTP below to reset your password:</p>

          <div style="
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 6px;
            color: #4CAF50;
            margin: 20px 0;
          ">
            ${context.otp}
          </div>

          <p>This OTP is valid for <strong>15 minutes</strong>.</p>

          <p>If you did not request this, please ignore this email.</p>

          <hr />
          <p style="font-size: 12px; color: #999;">
            © Bloom Tales
          </p>
        </div>
      `,

      // -------------------------------
      // ORDER CONFIRMATION
      // -------------------------------
      orderConfirmation: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Order Confirmed 🎉</h2>

          <p>Thank you for shopping with <strong>Bloom Tales</strong>.</p>

          <p>Your order number:</p>

          <h3>#${context.orderNumber}</h3>

          <p>We’ll notify you once your order is shipped.</p>

          <hr />
          <p style="font-size: 12px; color: #999;">
            © Bloom Tales
          </p>
        </div>
      `,
    };

    const htmlContent =
      templates[template] || context.html || "";

    const mailOptions = {
      from: {
        address: "hello@bloomtales.shop",
        name: process.env.EMAIL_FROM_NAME || "Bloom Tales",
      },
      to: Array.isArray(to) ? to : [to],
      subject,
      html: htmlContent,
      category: template || "Transactional",
    };

    console.log("📧 Mail options prepared");

    const result = await transport.sendMail(mailOptions);

    console.log(`✅ Email sent successfully → ${to}`);
    console.log(`🆔 Message ID → ${result.messageId}`);

    return result;
  } catch (error) {
    console.error("❌ Email sending failed");
    console.error("❌ Name:", error.name);
    console.error("❌ Message:", error.message);
    console.error("❌ Code:", error.code);
    console.error("❌ Full Error:", error);

    throw error;
  }
};

module.exports = { sendEmail };
