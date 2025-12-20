const Nodemailer = require("nodemailer");
const { MailtrapTransport } = require("mailtrap");

const TOKEN = process.env.MAILTRAP_TOKEN || "0873a4acf16f8376bd746cb02274269e";
const transport = Nodemailer.createTransport(
  MailtrapTransport({
    token: TOKEN,
  })
);

const sendEmail = async ({ to, subject, template, context }) => {
  try {
    console.log(`📧 Attempting to send email to: ${to}`);
    console.log(`📧 Using MAILTRAP_TOKEN: ${TOKEN ? 'Token exists' : 'NO TOKEN!'}`);
    
    const templates = {
      emailVerification: `
        <h2>Welcome ${context.name}!</h2>
@@ -23,30 +27,53 @@ const sendEmail = async ({ to, subject, template, context }) => {
      `,
      passwordResetOTP: `
        <h2>Password Reset OTP</h2>
        <h1 style="font-size: 48px; color: #4CAF50;">${context.otp}</h1>
        <p>This OTP expires in 15 minutes.</p>
      `,
      orderConfirmation: `
        <h2>Order Confirmation</h2>
        <p>Order #${context.orderNumber}</p>
      `,
    };

    const mailOptions = {
      from: {
        address: "hello@bloomtales.shop",
        name: process.env.EMAIL_FROM_NAME || "Bloom Tales",
      },
      to: Array.isArray(to) ? to : [to],
      subject,
      html: templates[template] || context.html,
      category: template || "Transactional",
    };

    console.log('📧 Mail Options:', JSON.stringify({
      from: mailOptions.from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      category: mailOptions.category
    }, null, 2));

    const result = await transport.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${to}`);
    console.log(`✅ Message ID: ${result.messageId}`);
    
    return result;
  } catch (error) {
    console.error("❌ Mailtrap error details:");
    console.error("❌ Error name:", error.name);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error code:", error.code);
    console.error("❌ Full error:", error);
    
    if (error.response) {
      console.error("❌ Response:", error.response);
      console.error("❌ Response Code:", error.responseCode);
    }
    
    // Throw the full error so authController can format it
    throw error;
  }
};

module.exports = { sendEmail };
