// utils/email.js
const nodemailer = require('nodemailer');

// FIX: Change createTransporter to createTransport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Rest of your code remains the same...

const sendEmail = async ({ to, subject, template, context }) => {
  try {
    // Email templates
    const templates = {
      emailVerification: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; text-align: center; margin-bottom: 30px;">Welcome ${context.name}!</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">Please click the button below to verify your email address:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${context.verificationUrl}" style="background: #007bff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Verify Email</a>
            </div>
            <p style="color: #999; font-size: 14px;">This link will expire in 24 hours.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px;">If the button doesn't work, copy and paste this link in your browser:</p>
            <p style="color: #007bff; font-size: 12px; word-break: break-all;">${context.verificationUrl}</p>
          </div>
        </div>
      `,
      passwordReset: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; text-align: center; margin-bottom: 30px;">Password Reset Request</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">Hello ${context.name},</p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">You requested a password reset. Click the button below to reset your password:</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${context.resetUrl}" style="background: #dc3545; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #999; font-size: 14px;">This link will expire in 1 hour.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, please ignore this email.</p>
          </div>
        </div>
      `,
      passwordResetOTP: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; text-align: center; margin-bottom: 30px;">Password Reset OTP</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">Hello ${context.name},</p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">You requested a password reset. Please use the OTP below to verify your identity:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <div style="background: #f8f9fa; border: 2px dashed #007bff; padding: 20px; border-radius: 10px; display: inline-block;">
                <p style="margin: 0; color: #999; font-size: 14px; margin-bottom: 10px;">Your OTP Code</p>
                <h1 style="margin: 0; color: #007bff; font-size: 32px; font-weight: bold; letter-spacing: 3px;">${context.otp}</h1>
              </div>
            </div>
            
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>⚠️ Important:</strong> This OTP will expire in 15 minutes. Do not share this code with anyone.
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">If you didn't request this password reset, please ignore this email or contact our support team.</p>
            
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">This email was sent from a secure, automated system. Please do not reply to this email.</p>
          </div>
        </div>
      `,
      orderConfirmation: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; text-align: center; margin-bottom: 30px;">Order Confirmation</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">Hello ${context.name},</p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">Thank you for your order! Your order number is: <strong>${context.orderNumber}</strong></p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">Order Total: ${context.total}</p>
            <p style="color: #666; font-size: 16px; line-height: 1.6;">We'll send you tracking information once your order ships.</p>
          </div>
        </div>
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