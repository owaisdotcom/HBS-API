import pkg from 'nodemailer';
const { createTransport } = pkg;

const SENDER_NAME = 'Hijabs by Shiza';
const getSenderEmail = () => (process.env.EMAIL_USER || process.env.EMAIL_FROM || 'hijabsbyshiza@gmail.com').trim();
const getReplyToEmail = () => (process.env.EMAIL_USER || process.env.EMAIL_FROM || 'hijabsbyshiza@gmail.com').trim();
const getFrontendUrl = () => (process.env.FRONTEND_URL || 'https://www.hijabsbyshiza.com').replace(/\/+$/, '');

/**
 * Singleton pooled nodemailer transporter
 * Using connection pooling reduces socket handshake overhead and helps prevent Gmail rate spikes
 */
let cachedTransporter = null;

const getTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const isSecure = port === 465;

  cachedTransporter = createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port,
    secure: isSecure,
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 3,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    },
    requireTLS: !isSecure,
    tls: {
      rejectUnauthorized: true
    }
  });

  return cachedTransporter;
};

/**
 * Safe logging helper that masks PII and never exposes OTPs, passwords, or tokens
 */
const maskEmail = (email) => {
  if (!email || typeof email !== 'string') return 'unknown';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  const maskedName = name.length > 2 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
  return `${maskedName}@${domain}`;
};

const logEmailEvent = (type, recipient, status, metadata = {}) => {
  const timestamp = new Date().toISOString();
  const maskedRecipient = maskEmail(recipient);
  const metaStr = Object.keys(metadata).length ? ` | Details: ${JSON.stringify(metadata)}` : '';
  console.log(`[Email Service] [${timestamp}] [${status}] Type: ${type} | To: ${maskedRecipient}${metaStr}`);
};

/**
 * Send email with transient retry handling
 */
const sendMailWithRetry = async (mailOptions, { emailType = 'transactional', maxRetries = 1 } = {}) => {
  const transporter = getTransporter();
  let attempt = 0;

  // Enforce consistent, legitimate Gmail headers
  const senderEmail = getSenderEmail();
  const replyToEmail = getReplyToEmail();

  const finalMailOptions = {
    ...mailOptions,
    from: `"${SENDER_NAME}" <${senderEmail}>`,
    replyTo: `"${SENDER_NAME}" <${replyToEmail}>`,
    headers: {
      'X-Entity-Ref-ID': `hbs-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      ...(mailOptions.headers || {})
    }
  };

  while (attempt <= maxRetries) {
    try {
      attempt++;
      const info = await transporter.sendMail(finalMailOptions);
      logEmailEvent(emailType, mailOptions.to, 'SUCCESS', { messageId: info.messageId });
      return info;
    } catch (error) {
      const isTransient = error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.responseCode === 421 || error.responseCode === 450;
      
      logEmailEvent(emailType, mailOptions.to, attempt <= maxRetries && isTransient ? 'RETRYING' : 'FAILED', {
        attempt,
        error: error.message,
        code: error.code || error.responseCode
      });

      if (attempt <= maxRetries && isTransient) {
        await new Promise(res => setTimeout(res, 1200));
        continue;
      }

      throw error;
    }
  }
};

/**
 * Reusable clean HTML email wrapper
 * Clean, lightweight table-based layout compatible with Gmail, Outlook, Yahoo, and mobile clients
 */
const wrapHtmlEmail = ({ title, preheader = '', contentHtml }) => {
  const year = new Date().getFullYear();
  const supportEmail = getSenderEmail();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f6f6f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; font-size: 15px; line-height: 1.6; color: #2d3748;">
  ${preheader ? `<span style="display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; line-height: 1px; max-height: 0; max-width: 0; opacity: 0; overflow: hidden;">${preheader}</span>` : ''}
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f6f6f7; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 580px; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td align="center" style="background-color: #AA2E48; padding: 24px 20px;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: 0.5px;">${SENDER_NAME}</h1>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px; background-color: #ffffff;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px; background-color: #f8fafc; border-top: 1px solid #edf2f7; text-align: center; font-size: 12px; color: #718096; line-height: 1.5;">
              <p style="margin: 0 0 6px 0;"><strong>${SENDER_NAME}</strong></p>
              <p style="margin: 0 0 8px 0;">Customer Support: <a href="mailto:${supportEmail}" style="color: #AA2E48; text-decoration: none;">${supportEmail}</a></p>
              <p style="margin: 0; font-size: 11px; color: #a0aec0;">&copy; ${year} ${SENDER_NAME}. This is a transactional notification regarding your account or order.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

/**
 * 1. Test email server connection
 */
export const testEmailConnection = async () => {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return true;
  } catch (error) {
    console.error('[Email Service] Connection verification failed:', error.message);
    return false;
  }
};

/**
 * 2. Send email verification OTP
 */
export const sendVerificationOTP = async (email, otp, fullName = 'Valued Customer') => {
  const subject = 'Your Verification Code - Hijabs by Shiza';
  const cleanName = fullName || 'there';

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Hello ${cleanName},</h2>
    <p style="margin: 0 0 20px 0; color: #4a5568;">Thank you for registering with ${SENDER_NAME}. Please enter the verification code below to verify your email address:</p>
    
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="center" style="background-color: #fdf2f4; border: 2px dashed #AA2E48; border-radius: 8px; padding: 20px;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #718096; margin-bottom: 6px;">One-Time Verification Code</div>
          <div style="font-size: 32px; font-weight: 700; color: #AA2E48; letter-spacing: 8px; font-family: 'Courier New', Courier, monospace;">${otp}</div>
          <div style="font-size: 12px; color: #a0aec0; margin-top: 6px;">Valid for 10 minutes</div>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 12px 0; color: #4a5568; font-size: 13px;">For your security, do not share this verification code with anyone. Our support team will never ask for your code.</p>
    <p style="margin: 0; color: #718096; font-size: 12px;">If you did not request this code, you can safely ignore this email.</p>
  `;

  const text = `Hello ${cleanName},

Thank you for registering with ${SENDER_NAME}.

Your verification code is: ${otp}

This code is valid for 10 minutes. Please do not share this code with anyone.

If you did not request this code, you can safely ignore this email.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: `Your verification code is ${otp}`,
      contentHtml
    })
  }, { emailType: 'verification-otp' });
};

/**
 * 3. Send Guest Checkout Email Verification OTP
 */
export const sendGuestVerificationOTP = async (email, otp, fullName = 'Valued Customer') => {
  const subject = 'Order Verification Code - Hijabs by Shiza';
  const cleanName = fullName || 'Valued Customer';

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Hello ${cleanName},</h2>
    <p style="margin: 0 0 20px 0; color: #4a5568;">Thank you for shopping with ${SENDER_NAME}. To confirm your order and complete guest checkout, please use the verification code below:</p>
    
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="center" style="background-color: #fdf2f4; border: 2px dashed #AA2E48; border-radius: 8px; padding: 20px;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #718096; margin-bottom: 6px;">Order Verification Code</div>
          <div style="font-size: 32px; font-weight: 700; color: #AA2E48; letter-spacing: 8px; font-family: 'Courier New', Courier, monospace;">${otp}</div>
          <div style="font-size: 12px; color: #a0aec0; margin-top: 6px;">Valid for 10 minutes</div>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 12px 0; color: #4a5568; font-size: 13px;">This verification code confirms your order details and delivery information.</p>
    <p style="margin: 0; color: #718096; font-size: 12px;">If you did not place an order on our website, please ignore this email.</p>
  `;

  const text = `Hello ${cleanName},

Thank you for shopping with ${SENDER_NAME}.

Your order verification code is: ${otp}

This code is valid for 10 minutes.

If you did not place an order, you can safely ignore this email.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: `Your order verification code is ${otp}`,
      contentHtml
    })
  }, { emailType: 'guest-otp' });
};

/**
 * 4. Send email verification link
 */
export const sendVerificationEmail = async (email, verificationToken) => {
  const subject = 'Verify Your Email Address - Hijabs by Shiza';
  const verificationUrl = `${getFrontendUrl()}/verify-email?token=${verificationToken}`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Welcome to ${SENDER_NAME}</h2>
    <p style="margin: 0 0 20px 0; color: #4a5568;">Please confirm your email address by clicking the button below:</p>
    
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="center">
          <a href="${verificationUrl}" target="_blank" style="display: inline-block; background-color: #AA2E48; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">Verify Email Address</a>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 12px 0; color: #718096; font-size: 13px;">If the button does not work, copy and paste this link into your browser:</p>
    <p style="margin: 0 0 20px 0; color: #AA2E48; font-size: 12px; word-break: break-all;">${verificationUrl}</p>
    <p style="margin: 0; color: #718096; font-size: 12px;">This link will expire in 24 hours. If you did not create an account, you can disregard this email.</p>
  `;

  const text = `Welcome to ${SENDER_NAME}

Please verify your email address by visiting the following link:
${verificationUrl}

This link will expire in 24 hours.

If you did not create an account, please ignore this email.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: 'Please verify your email address for Hijabs by Shiza',
      contentHtml
    })
  }, { emailType: 'verification-link' });
};

/**
 * 5. Send password reset email
 */
export const sendPasswordResetEmail = async (email, resetToken) => {
  const subject = 'Password Reset Request - Hijabs by Shiza';
  const resetUrl = `${getFrontendUrl()}/reset-password?token=${resetToken}`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Password Reset Request</h2>
    <p style="margin: 0 0 20px 0; color: #4a5568;">We received a request to reset the password for your ${SENDER_NAME} account. Click the button below to choose a new password:</p>
    
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td align="center">
          <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #AA2E48; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">Reset Password</a>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 8px 0; color: #718096; font-size: 13px;">Or copy and paste this link into your browser:</p>
    <p style="margin: 0 0 20px 0; color: #AA2E48; font-size: 12px; word-break: break-all;">${resetUrl}</p>
    <p style="margin: 0 0 12px 0; color: #4a5568; font-size: 13px;">This link will expire in 1 hour.</p>
    <p style="margin: 0; color: #718096; font-size: 12px;">If you did not request this password reset, your account is safe and no changes were made. You can safely ignore this email.</p>
  `;

  const text = `Password Reset Request - ${SENDER_NAME}

We received a request to reset your password. You can reset it using the link below:
${resetUrl}

This link is valid for 1 hour.

If you did not request this reset, please ignore this email. Your password will remain unchanged.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: 'Reset your password for Hijabs by Shiza',
      contentHtml
    })
  }, { emailType: 'password-reset' });
};

/**
 * 6. Send wishlist restock notification email
 */
export const sendWishlistRestockEmail = async (email, fullName, product) => {
  const productName = product?.name || 'An item from your wishlist';
  const subject = `${productName} is back in stock - Hijabs by Shiza`;
  const productUrl = `${getFrontendUrl()}/product/${product?.slug || product?._id || ''}`;
  const priceFormatted = product?.price ? `Rs. ${Number(product.price).toLocaleString()}` : '';

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Good news, ${fullName || 'there'}!</h2>
    <p style="margin: 0 0 20px 0; color: #4a5568;">An item from your wishlist is now back in stock:</p>
    
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <tr>
        <td>
          <h3 style="margin: 0 0 8px 0; color: #1a202c; font-size: 16px;">${productName}</h3>
          ${priceFormatted ? `<p style="margin: 0 0 12px 0; color: #AA2E48; font-weight: 700; font-size: 16px;">${priceFormatted}</p>` : ''}
          <a href="${productUrl}" target="_blank" style="display: inline-block; background-color: #AA2E48; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-size: 14px; font-weight: 600;">View Product</a>
        </td>
      </tr>
    </table>
  `;

  const text = `Hello ${fullName || 'there'},

Good news! An item from your wishlist is back in stock:
${productName} ${priceFormatted ? `(${priceFormatted})` : ''}

View it online at: ${productUrl}

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: `${productName} is back in stock at Hijabs by Shiza`,
      contentHtml
    })
  }, { emailType: 'wishlist-restock' });
};

/**
 * 7. Send welcome email after verification
 */
export const sendWelcomeEmail = async (email, fullName) => {
  const subject = 'Welcome to Hijabs by Shiza';
  const cleanName = fullName || 'there';

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Welcome, ${cleanName}!</h2>
    <p style="margin: 0 0 16px 0; color: #4a5568;">Your account has been verified. You can now:</p>
    <ul style="margin: 0 0 24px 0; padding-left: 20px; color: #4a5568; line-height: 1.8;">
      <li>Track your orders and order history</li>
      <li>Save your delivery address for faster checkout</li>
      <li>Save your favorite products to your wishlist</li>
    </ul>

    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
      <tr>
        <td align="center">
          <a href="${getFrontendUrl()}" target="_blank" style="display: inline-block; background-color: #AA2E48; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: 600; font-size: 15px;">Explore Collection</a>
        </td>
      </tr>
    </table>
  `;

  const text = `Welcome, ${cleanName}!

Your ${SENDER_NAME} account has been verified.

You can now track your orders, save delivery details, and shop our full collection online:
${getFrontendUrl()}

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: 'Your account is ready at Hijabs by Shiza',
      contentHtml
    })
  }, { emailType: 'welcome' });
};

/**
 * Helper to render order items in table format
 */
const renderOrderItemsHtml = (items = []) => {
  return items.map(item => {
    const customizations = [];
    if (item.selectedColor) customizations.push(`Color: ${item.selectedColor}`);
    if (item.selectedSize) customizations.push(`Size: ${item.selectedSize}`);
    if (item.selectedTieElastic) customizations.push(`Option: ${item.selectedTieElastic === 'tie' ? 'Tie' : 'Elastic'}`);
    if (item.selectedBridalLength === 'bridal') customizations.push(`Bridal Length (+Rs. ${item.bridalLengthPrice || 0})`);

    const qty = Number(item.quantity) || 1;
    const totalItemPrice = Number(item.price || 0) * qty;

    return `
      <tr>
        <td style="padding: 10px 8px; border-bottom: 1px solid #edf2f7; font-size: 14px; color: #2d3748;">
          <strong>${item.productName || 'Product'}</strong>
          ${customizations.length ? `<br><span style="font-size: 12px; color: #718096;">${customizations.join(' | ')}</span>` : ''}
        </td>
        <td align="center" style="padding: 10px 8px; border-bottom: 1px solid #edf2f7; font-size: 14px; color: #4a5568;">${qty}</td>
        <td align="right" style="padding: 10px 8px; border-bottom: 1px solid #edf2f7; font-size: 14px; color: #2d3748;">Rs. ${totalItemPrice.toLocaleString()}</td>
      </tr>
    `;
  }).join('');
};

const renderOrderItemsText = (items = []) => {
  return items.map(item => {
    const qty = Number(item.quantity) || 1;
    const totalItemPrice = Number(item.price || 0) * qty;
    return `- ${item.productName || 'Product'} (Qty: ${qty}) - Rs. ${totalItemPrice.toLocaleString()}`;
  }).join('\n');
};

/**
 * 8. Send Order Received Email (Order Placed)
 */
export const sendOrderReceivedEmail = async (order) => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = order.customer?.name || 'Valued Customer';
  const shipping = Number(order.shipping) || 0;
  const subtotal = Number(order.subtotal) || 0;
  const discount = Number(order.discount) || 0;
  const total = Number(order.total) || 0;
  const address = order.customer?.completeAddress || order.customer?.address || '';
  const city = order.customer?.city || '';
  const phone = order.customer?.phone || '';

  const subject = `Order Confirmation #${orderId} - Hijabs by Shiza`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Hello ${customerName},</h2>
    <p style="margin: 0 0 20px 0; color: #4a5568;">Thank you for your order! We have received your order <strong>#${orderId}</strong> and are reviewing your payment details.</p>

    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
      <thead>
        <tr style="background-color: #f7fafc;">
          <th align="left" style="padding: 10px 8px; font-size: 12px; color: #4a5568; text-transform: uppercase;">Item</th>
          <th align="center" style="padding: 10px 8px; font-size: 12px; color: #4a5568; text-transform: uppercase;">Qty</th>
          <th align="right" style="padding: 10px 8px; font-size: 12px; color: #4a5568; text-transform: uppercase;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${renderOrderItemsHtml(order.items)}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="2" align="right" style="padding: 8px; font-size: 13px; color: #718096; border-top: 1px solid #e2e8f0;">Subtotal:</td>
          <td align="right" style="padding: 8px; font-size: 13px; color: #2d3748; border-top: 1px solid #e2e8f0;">Rs. ${subtotal.toLocaleString()}</td>
        </tr>
        ${discount > 0 ? `
        <tr>
          <td colspan="2" align="right" style="padding: 8px; font-size: 13px; color: #38a169;">Discount:</td>
          <td align="right" style="padding: 8px; font-size: 13px; color: #38a169;">-Rs. ${discount.toLocaleString()}</td>
        </tr>` : ''}
        <tr>
          <td colspan="2" align="right" style="padding: 8px; font-size: 13px; color: #718096;">Shipping:</td>
          <td align="right" style="padding: 8px; font-size: 13px; color: #2d3748;">${shipping === 0 ? 'Free' : `Rs. ${shipping.toLocaleString()}`}</td>
        </tr>
        <tr>
          <td colspan="2" align="right" style="padding: 10px 8px; font-size: 15px; font-weight: 700; color: #AA2E48; border-top: 2px solid #AA2E48;">Total Amount:</td>
          <td align="right" style="padding: 10px 8px; font-size: 15px; font-weight: 700; color: #AA2E48; border-top: 2px solid #AA2E48;">Rs. ${total.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>

    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin-bottom: 20px;">
      <tr>
        <td style="font-size: 13px; color: #4a5568;">
          <strong style="color: #2d3748;">Delivery Address:</strong><br>
          ${address ? `${address}, ` : ''}${city}<br>
          ${phone ? `Contact: ${phone}` : ''}
        </td>
      </tr>
    </table>

    <p style="margin: 0; color: #718096; font-size: 13px;">We will notify you by email as soon as your payment is verified and your package is dispatched.</p>
  `;

  const text = `Hello ${customerName},

Thank you for your order #${orderId} with ${SENDER_NAME}.

Order Summary:
${renderOrderItemsText(order.items)}

Subtotal: Rs. ${subtotal.toLocaleString()}
${discount > 0 ? `Discount: -Rs. ${discount.toLocaleString()}\n` : ''}Shipping: ${shipping === 0 ? 'Free' : `Rs. ${shipping.toLocaleString()}`}
Total Amount: Rs. ${total.toLocaleString()}

Delivery Address:
${address ? `${address}, ` : ''}${city}
Contact: ${phone}

We will notify you once your payment is verified and your package is on its way.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: `Thank you for order #${orderId}. Total: Rs. ${total.toLocaleString()}`,
      contentHtml
    })
  }, { emailType: 'order-received' });
};

/**
 * 9. Send Order Confirmed Email (Payment Verified)
 */
export const sendOrderConfirmedEmail = async (order) => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = order.customer?.name || 'Valued Customer';
  const total = Number(order.total) || 0;

  const subject = `Order Confirmed #${orderId} - Hijabs by Shiza`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Hello ${customerName},</h2>
    
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-left: 4px solid #22c55e; border-radius: 4px; padding: 16px; margin: 20px 0;">
      <tr>
        <td style="color: #166534; font-size: 14px;">
          <strong style="font-size: 15px;">Payment Verified & Order Confirmed</strong><br>
          Your payment for <strong>Rs. ${total.toLocaleString()}</strong> has been verified. Our team is now preparing your order <strong>#${orderId}</strong> for shipment.
        </td>
      </tr>
    </table>

    <p style="margin: 0; color: #4a5568; font-size: 14px;">You will receive another update with courier tracking details as soon as your parcel is dispatched.</p>
  `;

  const text = `Hello ${customerName},

Great news! Your payment for order #${orderId} (Rs. ${total.toLocaleString()}) has been verified and your order is confirmed.

We are now preparing your items for delivery and will send tracking information once dispatched.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: `Payment verified and order #${orderId} confirmed`,
      contentHtml
    })
  }, { emailType: 'order-confirmed' });
};

/**
 * 10. Send Order Shipped Email
 */
export const sendOrderShippedEmail = async (order, trackingNumber = '', courier = '') => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = order.customer?.name || 'Valued Customer';
  const trackNum = trackingNumber || order.trackingNumber || 'Available shortly';
  const courierName = courier || order.courier || 'Standard Courier';

  const subject = `Your Order #${orderId} has shipped - Hijabs by Shiza`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Hello ${customerName},</h2>
    <p style="margin: 0 0 20px 0; color: #4a5568;">Your package for order <strong>#${orderId}</strong> has been dispatched and is on its way to you.</p>

    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f0f9ff; border-left: 4px solid #0284c7; border-radius: 4px; padding: 16px; margin: 20px 0;">
      <tr>
        <td style="color: #0c4a6e; font-size: 14px; line-height: 1.6;">
          <strong style="font-size: 15px;">Shipping Details</strong><br>
          Courier Service: <strong>${courierName}</strong><br>
          Tracking Number: <strong>${trackNum}</strong><br>
          Estimated Delivery: 3 to 5 business days
        </td>
      </tr>
    </table>

    <p style="margin: 0; color: #718096; font-size: 13px;">Please ensure someone is available at your delivery address to receive the parcel.</p>
  `;

  const text = `Hello ${customerName},

Your order #${orderId} has been shipped!

Shipping Details:
Courier: ${courierName}
Tracking Number: ${trackNum}
Estimated Delivery: 3 to 5 business days

Please ensure someone is available at your delivery address to receive the parcel.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: `Your order #${orderId} has shipped with ${courierName}`,
      contentHtml
    })
  }, { emailType: 'order-shipped' });
};

/**
 * 11. Send Order Delivered Email
 */
export const sendOrderDeliveredEmail = async (order) => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = order.customer?.name || 'Valued Customer';

  const subject = `Order Delivered #${orderId} - Hijabs by Shiza`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Hello ${customerName},</h2>
    
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 4px; padding: 16px; margin: 20px 0;">
      <tr>
        <td style="color: #14532d; font-size: 14px;">
          <strong style="font-size: 15px;">Package Delivered</strong><br>
          Your order <strong>#${orderId}</strong> has been marked as delivered. We hope you love your new pieces!
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 12px 0; color: #4a5568; font-size: 14px;">Thank you for choosing ${SENDER_NAME}. If you have any feedback or queries about your order, our team is always here to assist.</p>
  `;

  const text = `Hello ${customerName},

Your order #${orderId} has been successfully delivered.

Thank you for choosing ${SENDER_NAME}. If you have any questions or feedback, please reach out to our team.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: `Your order #${orderId} has been delivered`,
      contentHtml
    })
  }, { emailType: 'order-delivered' });
};

/**
 * 12. Send Order Cancelled Email
 */
export const sendOrderCancelledEmail = async (order, reason = '') => {
  const customerEmail = order.customer?.email;
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = order.customer?.name || 'Valued Customer';
  const cancelReason = reason || 'Order request could not be completed.';

  const subject = `Order Update #${orderId} - Hijabs by Shiza`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #1a202c; font-size: 18px; font-weight: 600;">Hello ${customerName},</h2>
    
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px; padding: 16px; margin: 20px 0;">
      <tr>
        <td style="color: #991b1b; font-size: 14px;">
          <strong style="font-size: 15px;">Order Cancelled</strong><br>
          Your order <strong>#${orderId}</strong> has been cancelled.<br>
          Reason: ${cancelReason}
        </td>
      </tr>
    </table>

    <p style="margin: 0; color: #4a5568; font-size: 14px;">If you have any questions or feel this was done in error, please contact our support team at <a href="mailto:${getSenderEmail()}" style="color: #AA2E48;">${getSenderEmail()}</a>.</p>
  `;

  const text = `Hello ${customerName},

Your order #${orderId} has been cancelled.
Reason: ${cancelReason}

If you have any questions, please contact our support team at ${getSenderEmail()}.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text,
    html: wrapHtmlEmail({
      title: subject,
      preheader: `Order update for #${orderId}`,
      contentHtml
    })
  }, { emailType: 'order-cancelled' });
};
