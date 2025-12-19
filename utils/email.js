// utils/email.js - Production Ready
const Nodemailer = require("nodemailer");
const { MailtrapTransport } = require("mailtrap");

// Configuration
const MAILTRAP_TOKEN = process.env.MAILTRAP_TOKEN || "0873a4acf16f8376bd746cb02274269e";
const EMAIL_FROM = process.env.EMAIL_FROM || "noreply@bloomtales.shop";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || "Bloom Tales";

// Create transporter
const transporter = Nodemailer.createTransport(
  MailtrapTransport({
    token: MAILTRAP_TOKEN,
  })
);

// Email templates
const emailTemplates = {
  emailVerification: (context) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification - Bloom Tales</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 30px; border-radius: 10px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #4CAF50; }
        .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Bloom Tales</div>
          <h2>Verify Your Email Address</h2>
        </div>
        <p>Hello <strong>${context.name}</strong>,</p>
        <p>Thank you for registering with Bloom Tales! To complete your registration, please verify your email address by clicking the button below:</p>
        <p style="text-align: center;">
          <a href="${context.verificationUrl}" class="button">Verify Email Address</a>
        </p>
        <p>Or copy and paste this link in your browser:</p>
        <p><code>${context.verificationUrl}</code></p>
        <p>This verification link will expire in 24 hours.</p>
        <p>If you did not create an account with Bloom Tales, please ignore this email.</p>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Bloom Tales. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  
  passwordReset: (context) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Password - Bloom Tales</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 30px; border-radius: 10px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #4CAF50; }
        .button { display: inline-block; background: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Bloom Tales</div>
          <h2>Reset Your Password</h2>
        </div>
        <p>Hello <strong>${context.name}</strong>,</p>
        <p>We received a request to reset your password for your Bloom Tales account.</p>
        <p style="text-align: center;">
          <a href="${context.resetUrl}" class="button">Reset Password</a>
        </p>
        <p>Or copy and paste this link in your browser:</p>
        <p><code>${context.resetUrl}</code></p>
        <p>This password reset link will expire in 1 hour.</p>
        <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Bloom Tales. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  
  passwordResetOTP: (context) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset OTP - Bloom Tales</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 30px; border-radius: 10px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #4CAF50; }
        .otp { font-size: 48px; font-weight: bold; color: #4CAF50; text-align: center; letter-spacing: 10px; margin: 30px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Bloom Tales</div>
          <h2>Password Reset OTP</h2>
        </div>
        <p>Hello <strong>${context.name}</strong>,</p>
        <p>Use the following OTP (One-Time Password) to reset your password:</p>
        <div class="otp">${context.otp}</div>
        <p>This OTP is valid for <strong>15 minutes</strong> only.</p>
        <p>If you did not request a password reset, please ignore this email or contact our support team immediately.</p>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Bloom Tales. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  
  orderConfirmation: (context) => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Order Confirmation - Bloom Tales</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 30px; border-radius: 10px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { font-size: 24px; font-weight: bold; color: #4CAF50; }
        .order-number { font-size: 20px; font-weight: bold; color: #333; text-align: center; margin: 20px 0; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; text-align: center; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">Bloom Tales</div>
          <h2>Order Confirmation</h2>
        </div>
        <p>Hello <strong>${context.name}</strong>,</p>
        <p>Thank you for your order! Your order has been received and is being processed.</p>
        <div class="order-number">Order #${context.orderNumber}</div>
        <p>You will receive another email with tracking information once your order ships.</p>
        <p>You can view your order details and track its progress by visiting your account dashboard.</p>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} Bloom Tales. All rights reserved.</p>
          <p>This is an automated message, please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `
};

/**
 * Send email with Mailtrap
 * @param {Object} options - Email options
 * @param {string|Array} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.template - Template name
 * @param {Object} options.context - Template context
 * @returns {Promise} - Send result
 */
const sendEmail = async ({ to, subject, template, context }) => {
  try {
    // Validate inputs
    if (!to) throw new Error("Recipient email is required");
    if (!subject) throw new Error("Email subject is required");
    if (!template) throw new Error("Email template is required");
    if (!emailTemplates[template]) throw new Error(`Template "${template}" not found`);
    
    // Prepare recipients
    const recipients = Array.isArray(to) ? to : [to];
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const recipient of recipients) {
      if (!emailRegex.test(recipient)) {
        throw new Error(`Invalid email format: ${recipient}`);
      }
    }
    
    // Generate HTML from template
    const html = emailTemplates[template](context);
    
    // Prepare email options
    const mailOptions = {
      from: {
        address: EMAIL_FROM,
        name: EMAIL_FROM_NAME
      },
      to: recipients,
      subject: subject,
      html: html,
      category: template || "Transactional"
    };
    
    // Send email
    const result = await transporter.sendMail(mailOptions);
    
    console.log(`✅ Email sent successfully to ${recipients.join(', ')}`);
    console.log(`✅ Template: ${template}, Message ID: ${result.messageId}`);
    
    return result;
  } catch (error) {
    console.error("❌ Email sending failed:");
    console.error(`❌ Template: ${template}`);
    console.error(`❌ To: ${to}`);
    console.error(`❌ Error: ${error.message}`);
    
    // Re-throw with enhanced error information
    const enhancedError = new Error(`Failed to send ${template} email: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.details = {
      template,
      to,
      from: EMAIL_FROM,
      timestamp: new Date().toISOString()
    };
    
    throw enhancedError;
  }
};

/**
 * Verify email configuration
 */
const verifyEmailConfig = () => {
  console.log("📧 Email Configuration:");
  console.log(`   From: ${EMAIL_FROM_NAME} <${EMAIL_FROM}>`);
  console.log(`   Mailtrap Token: ${MAILTRAP_TOKEN ? "✓ Configured" : "✗ Missing"}`);
  
  if (!MAILTRAP_TOKEN) {
    console.warn("⚠️  MAILTRAP_TOKEN is not set. Emails will fail.");
  }
  
  if (!EMAIL_FROM || EMAIL_FROM === "noreply@bloomtales.shop") {
    console.warn("⚠️  Using default FROM address. Update EMAIL_FROM in .env");
  }
};

module.exports = {
  sendEmail,
  verifyEmailConfig,
  emailTemplates
};