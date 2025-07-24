


// utils/email.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const sendEmail = async ({ to, subject, template, context }) => {
  try {
    // Ensure verificationUrl exists and is not undefined
    const verificationUrl = context.verificationUrl || '';
    
    // Email templates
    const templates = {
      emailVerification: `
        <h2>Welcome ${context.name}!</h2>
        <p>Please click the link below to verify your email address:</p>
        <a href="${verificationUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Verify Email</a>
        <p>This link will expire in 24 hours.</p>
        <p>If the button doesn't work, copy and paste this link in your browser:</p>
        <p>${verificationUrl}</p>
      `,
      passwordReset: `
        <h2>Password Reset Request</h2>
        <p>Hello ${context.name},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${context.resetUrl}" style="background: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `,
      orderConfirmation: `
        <h2>Order Confirmation</h2>
        <p>Hello ${context.name},</p>
        <p>Thank you for your order! Your order number is: <strong>${context.orderNumber}</strong></p>
        <p>Order Total: ${context.total}</p>
        <p>We'll send you tracking information once your order ships.</p>
      `
    };

    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html: templates[template] || context.html
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Email sending error:', error);
    throw error;
  }
};

module.exports = { sendEmail };
