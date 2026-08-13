import pkg from 'nodemailer';
const { createTransport, getTestMessageUrl } = pkg;

// Create reusable transporter
const createTransporter = () => {
  const config = {
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_PORT === '465', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  };

  // For Gmail and other services using port 587 with TLS
  if (config.port === 587) {
    config.requireTLS = true;
  }

  console.log('Email config:', {
    host: config.host,
    port: config.port,
    user: config.auth.user,
    secure: config.secure,
    requireTLS: config.requireTLS
  });

  return createTransport(config);
};

/**
 * Test email connection
 */
export const testEmailConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();

    return true;
  } catch (error) {
    console.error('❌ Email server connection failed:', error.message);
    return false;
  }
};

/**
 * Send email verification OTP
 */
export const sendVerificationOTP = async (email, otp, fullName) => {


  const transporter = createTransporter();

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_USER || process.env.EMAIL_FROM || 'noreply@hijabsbyshiza.com'}>`,
    to: email,
    subject: 'Verify Your Email - Hijabs By Shiza',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #AA2E48; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .otp-box { background-color: white; border: 2px dashed #AA2E48; padding: 20px; margin: 20px 0; text-align: center; border-radius: 8px; }
          .otp-code { font-size: 32px; font-weight: bold; color: #AA2E48; letter-spacing: 8px; font-family: 'Courier New', monospace; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .warning { background-color: #fff3cd; border-left: 4px solid #856404; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Hijabs By Shiza!</h1>
          </div>
          <div class="content">
            <h2>Hello ${fullName},</h2>
            <p>Thank you for signing up! To complete your registration, please verify your email address using the OTP below:</p>
            <div class="otp-box">
              <p style="margin: 0; font-size: 14px; color: #666;">Your Verification Code</p>
              <div class="otp-code">${otp}</div>
              <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">This code will expire in 10 minutes</p>
            </div>
            <p><strong>Important:</strong> Do not share this code with anyone. Our team will never ask for your verification code.</p>
            <div class="warning">
              <strong>Security Notice:</strong> If you didn't create an account with us, please ignore this email.
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {

    const info = await transporter.sendMail(mailOptions);

    if (getTestMessageUrl) {

    }
    return info;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error);
    throw error;
  }
};

/**
 * Send email verification email
 */
export const sendVerificationEmail = async (email, verificationToken) => {
  const transporter = createTransporter();

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_FROM || 'noreply@hijabsbyshiza.com'}>`,
    to: email,
    subject: 'Verify Your Email - Hijabs By Shiza',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #AA2E48; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 12px 30px; background-color: #AA2E48; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to Hijabs By Shiza!</h1>
          </div>
          <div class="content">
            <h2>Verify Your Email Address</h2>
            <p>Thank you for signing up! Please click the button below to verify your email address:</p>
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Email</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #AA2E48;">${verificationUrl}</p>
            <p><strong>This link will expire in 24 hours.</strong></p>
            <p>If you didn't create an account with us, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async (email, resetToken) => {
  const transporter = createTransporter();

  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_FROM || 'noreply@hijabsbyshiza.com'}>`,
    to: email,
    subject: 'Password Reset Request - Hijabs By Shiza',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #AA2E48; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 12px 30px; background-color: #AA2E48; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .warning { background-color: #fff3cd; border-left: 4px solid: #856404; padding: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Reset Your Password</h2>
            <p>You requested to reset your password. Click the button below to proceed:</p>
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #AA2E48;">${resetUrl}</p>
            <p><strong>This link will expire in 1 hour.</strong></p>
            <div class="warning">
              <strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Send wishlist restock notification email
 */
export const sendWishlistRestockEmail = async (email, fullName, product) => {
  const transporter = createTransporter();
  const productUrl = `${process.env.FRONTEND_URL}/product/${product.slug || product._id}`;
  const imageUrl = product.images?.[0]?.url || `${process.env.FRONTEND_URL}/brand1.jpg`;

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@hijabsbyshiza.com'}>`,
    to: email,
    subject: `${product.name} is back in stock`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #AA2E48; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .product-card { background-color: #fff; border-radius: 8px; padding: 16px; border: 1px solid #eee; }
          .product-image { width: 100%; border-radius: 6px; margin-bottom: 12px; }
          .button { display: inline-block; padding: 12px 24px; background-color: #AA2E48; color: white; text-decoration: none; border-radius: 5px; margin-top: 16px; }
          .footer { text-align: center; margin-top: 24px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Back in Stock</h1>
          </div>
          <div class="content">
            <p>Hi ${fullName || 'there'},</p>
            <p>The item you liked is available again. Grab it before it sells out!</p>
            <div class="product-card">
              <img class="product-image" src="${imageUrl}" alt="${product.name}" />
              <h3 style="margin: 0 0 6px;">${product.name}</h3>
              <p style="margin: 0; color: #555;">Rs. ${Number(product.price || 0).toLocaleString()}</p>
              <a style="color: #f9f9f9;" href="${productUrl}" class="button">View Product</a>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Send welcome email after verification
 */
export const sendWelcomeEmail = async (email, fullName) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_FROM || 'noreply@hijabsbyshiza.com'}>`,
    to: email,
    subject: 'Welcome to Hijabs By Shiza!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #AA2E48; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; padding: 12px 30px; background-color: #AA2E48; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome, ${fullName}!</h1>
          </div>
          <div class="content">
            <h2>Your Account is Ready!</h2>
            <p>Thank you for verifying your email. You can now enjoy all the benefits of being a member:</p>
            <ul>
              <li>Track your orders</li>
              <li>Save your favorite items</li>
              <li>Faster checkout process</li>
              <li>Exclusive offers and discounts</li>
            </ul>
            <div style="text-align: center;">
              <a href="${process.env.FRONTEND_URL}" class="button">Start Shopping</a>
            </div>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  await transporter.sendMail(mailOptions);
};

