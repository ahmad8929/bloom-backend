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
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
    <h2>Welcome ${context.name} 👋</h2>

    <p>Thank you for signing up at <strong>Bloom Tales</strong>.</p>

    <p>Please verify your email by clicking the button below:</p>

    <a href="${context.verificationUrl}"
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
      If you didn’t create an account, you can safely ignore this email.
    </p>

    <p style="color: #888; font-size: 12px;">
      This link will expire in 24 hours.
    </p>

    <hr />
    <p style="font-size: 12px; color: #999;">
      © Bloom Tales
    </p>
  </div>
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
