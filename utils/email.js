// utils/email.js
const Nodemailer = require("nodemailer");
const { MailtrapTransport } = require("mailtrap");

const transport = Nodemailer.createTransport(
  MailtrapTransport({
    token: process.env.MAILTRAP_TOKEN,
  })
);

const sendEmail = async ({ to, subject, template, context }) => {
  try {
    const templates = {
      emailVerification: `
        <h2>Welcome ${context.name}!</h2>
        <p>Please verify your email:</p>
        <a href="${context.verificationUrl}">Verify Email</a>
        <p>This link expires in 24 hours.</p>
      `,
      passwordReset: `
        <h2>Password Reset</h2>
        <a href="${context.resetUrl}">Reset Password</a>
      `,
      passwordResetOTP: `
        <h2>Password Reset OTP</h2>
        <h1>${context.otp}</h1>
      `,
      orderConfirmation: `
        <h2>Order Confirmation</h2>
        <p>Order #${context.orderNumber}</p>
      `,
    };

    await transport.sendMail({
      from: {
        address: process.env.EMAIL_FROM,       // MUST be "address"
        name: process.env.EMAIL_FROM_NAME,
      },
      to: Array.isArray(to) ? to : [to],        // MUST be array of strings
      subject,
      html: templates[template] || context.html,
      category: template || "Transactional",
    });

    console.log(`✅ Email sent to ${to}`);
  } catch (error) {
    console.error("❌ Mailtrap error:", error);
    throw error;
  }
};

module.exports = { sendEmail };
