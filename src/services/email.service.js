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
 * Send Guest Checkout Email Verification OTP
 */
export const sendGuestVerificationOTP = async (email, otp, fullName = 'Valued Customer') => {
  const transporter = createTransporter();

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_USER || process.env.EMAIL_FROM || 'noreply@hijabsbyshiza.com'}>`,
    to: email,
    subject: 'Confirm Your Order - Verification Code | Hijabs By Shiza',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #AA2E48 0%, #7A1C30 100%); color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 1px; }
          .content { background-color: #ffffff; padding: 30px; border: 1px solid #eeeeee; border-radius: 0 0 8px 8px; }
          .otp-box { background-color: #FAF5F6; border: 2px dashed #AA2E48; padding: 20px; margin: 25px 0; text-align: center; border-radius: 8px; }
          .otp-code { font-size: 34px; font-weight: bold; color: #AA2E48; letter-spacing: 8px; font-family: 'Courier New', monospace; margin: 10px 0; }
          .footer { text-align: center; margin-top: 30px; color: #777; font-size: 12px; }
          .notice { background-color: #fff8e6; border-left: 4px solid #f0b429; padding: 12px 15px; margin: 20px 0; font-size: 13px; color: #614700; border-radius: 4px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Hijabs By Shiza</h1>
          </div>
          <div class="content">
            <h2>Hello ${fullName},</h2>
            <p>Thank you for shopping with us! To complete your guest checkout and confirm your order, please enter the verification code below:</p>
            <div class="otp-box">
              <p style="margin: 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #666;">Your One-Time Order Verification Code</p>
              <div class="otp-code">${otp}</div>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #888;">This code is valid for 10 minutes</p>
            </div>
            <div class="notice">
              <strong>Security Notice:</strong> If you did not request this verification code, please ignore this email.
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
    return info;
  } catch (error) {
    console.error('❌ Failed to send Guest OTP email:', error);
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

/** Helper: format items table HTML for order emails */
const renderOrderItemsHtml = (items) => {
  return (items || []).map(item => {
    const customizations = [];
    if (item.selectedColor) customizations.push(`Color: ${item.selectedColor}`);
    if (item.selectedSize) customizations.push(`Size: ${item.selectedSize}`);
    if (item.selectedTieElastic) customizations.push(`Option: ${item.selectedTieElastic === 'tie' ? 'Tie' : 'Elastic'}`);
    if (item.selectedBridalLength === 'bridal') customizations.push(`Bridal Length (+Rs. ${item.bridalLengthPrice || 0})`);
    
    return `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">
          <strong>${item.productName || 'Product'}</strong>
          ${customizations.length ? `<br><small style="color: #666;">${customizations.join(' | ')}</small>` : ''}
        </td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">Rs. ${Number(item.price * item.quantity).toLocaleString()}</td>
      </tr>
    `;
  }).join('');
};

/**
 * 1. Send Order Received Email (Order Placed)
 */
export const sendOrderReceivedEmail = async (order) => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const transporter = createTransporter();
  const orderId = order.orderId || order._id;
  const itemsHtml = renderOrderItemsHtml(order.items);
  const customerName = order.customer?.name || 'Valued Customer';
  const shipping = Number(order.shipping) || 0;
  const subtotal = Number(order.subtotal) || 0;
  const discount = Number(order.discount) || 0;
  const total = Number(order.total) || 0;

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@hijabsbyshiza.com'}>`,
    to: customerEmail,
    subject: `Order Received #${orderId} - Hijabs By Shiza`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #AA2E48; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 25px; border-radius: 0 0 8px 8px; }
          .order-box { background-color: white; border-radius: 8px; padding: 20px; margin: 15px 0; border: 1px solid #e5e7eb; }
          .table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .summary-row { font-size: 14px; color: #555; }
          .total-row { font-size: 16px; font-weight: bold; color: #AA2E48; border-top: 2px solid #AA2E48; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">Order Placed Successfully!</h1>
            <p style="margin:5px 0 0; font-size: 14px;">Order #${orderId}</p>
          </div>
          <div class="content">
            <h2>Hello ${customerName},</h2>
            <p>Thank you for shopping with Hijabs By Shiza! We have received your order and payment receipt. Our team will verify your payment shortly.</p>
            
            <div class="order-box">
              <h3 style="margin-top:0; color: #AA2E48;">Order Summary</h3>
              <table class="table">
                <thead>
                  <tr style="background:#f3f4f6; text-align:left;">
                    <th style="padding:8px;">Item</th>
                    <th style="padding:8px; text-align:center;">Qty</th>
                    <th style="padding:8px; text-align:right;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
              <div style="margin-top:15px; border-top:1px solid #eee; padding-top:10px;">
                <div class="summary-row" style="display:flex; justify-between; padding: 3px 0;">
                  <span>Subtotal:</span>
                  <span style="float:right;">Rs. ${subtotal.toLocaleString()}</span>
                </div>
                ${discount > 0 ? `
                <div class="summary-row" style="color:#059669; padding: 3px 0;">
                  <span>Discount:</span>
                  <span style="float:right;">-Rs. ${discount.toLocaleString()}</span>
                </div>` : ''}
                <div class="summary-row" style="padding: 3px 0;">
                  <span>Shipping:</span>
                  <span style="float:right;">${shipping === 0 ? 'FREE' : `Rs. ${shipping.toLocaleString()}`}</span>
                </div>
                <div class="total-row" style="padding-top:8px; margin-top:5px;">
                  <span>Total Amount:</span>
                  <span style="float:right;">Rs. ${total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div class="order-box">
              <h4 style="margin:0 0 8px; color: #333;">Delivery Address</h4>
              <p style="margin:0; color:#555; font-size:14px;">
                ${order.customer?.completeAddress || order.customer?.address || ''}, ${order.customer?.city || ''}<br>
                Phone: ${order.customer?.phone || ''}
              </p>
            </div>

            <p style="text-align:center; font-size:13px; color:#666;">We will send you another update once your payment is verified and your order is confirmed.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  return transporter.sendMail(mailOptions);
};

/**
 * 2. Send Order Confirmed Email (Payment Verified / Status Confirmed)
 */
export const sendOrderConfirmedEmail = async (order) => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const transporter = createTransporter();
  const orderId = order.orderId || order._id;
  const customerName = order.customer?.name || 'Valued Customer';
  const total = Number(order.total) || 0;

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@hijabsbyshiza.com'}>`,
    to: customerEmail,
    subject: `Payment Verified & Order Confirmed #${orderId} - Hijabs By Shiza`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #AA2E48; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 25px; border-radius: 0 0 8px 8px; }
          .status-box { background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">Order Confirmed!</h1>
            <p style="margin:5px 0 0;">Order #${orderId}</p>
          </div>
          <div class="content">
            <h2>Great news, ${customerName}!</h2>
            <div class="status-box">
              <h3 style="margin:0; color:#065f46;">✓ Payment Verified & Order Confirmed</h3>
              <p style="margin:5px 0 0; color:#047857; font-size:14px;">Your payment for Rs. ${total.toLocaleString()} has been verified. We are preparing your order for shipment.</p>
            </div>
            <p>We will notify you as soon as your items are packed and handed over to the courier service.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  return transporter.sendMail(mailOptions);
};

/**
 * 3. Send Order Shipped Email
 */
export const sendOrderShippedEmail = async (order, trackingNumber = '', courier = '') => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const transporter = createTransporter();
  const orderId = order.orderId || order._id;
  const customerName = order.customer?.name || 'Valued Customer';
  const trackNum = trackingNumber || order.trackingNumber || 'N/A';
  const courierName = courier || order.courier || 'Courier';

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@hijabsbyshiza.com'}>`,
    to: customerEmail,
    subject: `Your Order #${orderId} Has Been Shipped! - Hijabs By Shiza`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #AA2E48; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 25px; border-radius: 0 0 8px 8px; }
          .shipping-box { background-color: #e0f2fe; border-left: 4px solid #0284c7; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">Order On Its Way!</h1>
            <p style="margin:5px 0 0;">Order #${orderId}</p>
          </div>
          <div class="content">
            <h2>Hello ${customerName},</h2>
            <p>Your package has been dispatched and is currently on its way to you!</p>
            <div class="shipping-box">
              <h3 style="margin:0; color:#0369a1;">🚚 Shipping Details</h3>
              <p style="margin:8px 0 0; color:#075985; font-size:14px;">
                <strong>Courier:</strong> ${courierName}<br>
                <strong>Tracking Number:</strong> ${trackNum}<br>
                <strong>Estimated Delivery:</strong> 3 - 5 Business Days
              </p>
            </div>
            <p>Please make sure someone is available at your address to receive the delivery.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  return transporter.sendMail(mailOptions);
};

/**
 * 4. Send Order Delivered Email
 */
export const sendOrderDeliveredEmail = async (order) => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const transporter = createTransporter();
  const orderId = order.orderId || order._id;
  const customerName = order.customer?.name || 'Valued Customer';

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@hijabsbyshiza.com'}>`,
    to: customerEmail,
    subject: `Order Delivered #${orderId} - Hijabs By Shiza`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #AA2E48; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 25px; border-radius: 0 0 8px 8px; }
          .delivered-box { background-color: #d1fae5; border-left: 4px solid #10b981; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">Order Delivered!</h1>
            <p style="margin:5px 0 0;">Order #${orderId}</p>
          </div>
          <div class="content">
            <h2>Dear ${customerName},</h2>
            <div class="delivered-box">
              <h3 style="margin:0; color:#065f46;">🎉 Package Delivered</h3>
              <p style="margin:5px 0 0; color:#047857; font-size:14px;">Your order #${orderId} has been successfully delivered. We hope you love your new purchase!</p>
            </div>
            <p>Thank you for choosing Hijabs By Shiza. We look forward to serving you again!</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  return transporter.sendMail(mailOptions);
};

/**
 * 5. Send Order Cancelled Email
 */
export const sendOrderCancelledEmail = async (order, reason = '') => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const transporter = createTransporter();
  const orderId = order.orderId || order._id;
  const customerName = order.customer?.name || 'Valued Customer';
  const cancelReason = reason || 'Order request could not be processed.';

  const mailOptions = {
    from: `"${process.env.EMAIL_FROM_NAME || 'Hijabs By Shiza'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@hijabsbyshiza.com'}>`,
    to: customerEmail,
    subject: `Order Update #${orderId} - Hijabs By Shiza`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background-color: #f9f9f9; padding: 25px; border-radius: 0 0 8px 8px; }
          .cancel-box { background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">Order Cancelled</h1>
            <p style="margin:5px 0 0;">Order #${orderId}</p>
          </div>
          <div class="content">
            <h2>Dear ${customerName},</h2>
            <div class="cancel-box">
              <h3 style="margin:0; color:#991b1b;">Order Cancelled</h3>
              <p style="margin:5px 0 0; color:#b91c1c; font-size:14px;"><strong>Reason:</strong> ${cancelReason}</p>
            </div>
            <p>If you have any questions or feel this was a mistake, please reach out to our customer support team.</p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Hijabs By Shiza. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  };

  return transporter.sendMail(mailOptions);
};

