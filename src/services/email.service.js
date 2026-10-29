import pkg from 'nodemailer';
const { createTransport } = pkg;

const SENDER_NAME = 'Hijabs by Shiza';
const getSenderEmail = () => (process.env.EMAIL_USER || process.env.EMAIL_FROM || 'hbs.queries@gmail.com').trim();
const getReplyToEmail = () => (process.env.EMAIL_USER || process.env.EMAIL_FROM || 'hbs.queries@gmail.com').trim();
const getFrontendUrl = () => (process.env.FRONTEND_URL || 'https://www.hijabsbyshiza.com').replace(/\/+$/, '');

/**
 * Singleton pooled nodemailer transporter
 * Using connection pooling reduces socket handshake overhead and helps prevent Gmail rate spikes
 */
let cachedTransporter = null;

export const setTransporterForTesting = (transporter) => {
  cachedTransporter = transporter;
};

const getTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const isSecure = port === 465;

  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const cleanPassword = (process.env.EMAIL_PASSWORD || '').replace(/\s+/g, '').trim();

  cachedTransporter = createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port,
    secure: isSecure,
    pool: !isServerless,
    ...(!isServerless && {
      maxConnections: 3,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 3
    }),
    auth: {
      user: getSenderEmail(),
      pass: cleanPassword
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
 * Sends pure plain text only — no HTML, CSS, tables, buttons, or decorative elements
 */
const sendMailWithRetry = async (mailOptions, { emailType = 'transactional', maxRetries = 1 } = {}) => {
  const recipient = typeof mailOptions.to === 'string' ? mailOptions.to.trim() : '';
  if (!recipient) {
    console.warn(`[Email Service] Cannot send email of type ${emailType}: recipient email is missing or empty`);
    return null;
  }

  const transporter = getTransporter();
  let attempt = 0;

  const senderEmail = getSenderEmail();
  const replyToEmail = getReplyToEmail();

  const finalMailOptions = {
    to: recipient,
    subject: mailOptions.subject,
    text: mailOptions.text,
    from: `"${SENDER_NAME}" <${senderEmail}>`,
    replyTo: `"${SENDER_NAME}" <${replyToEmail}>`
  };

  while (attempt <= maxRetries) {
    try {
      attempt++;
      const info = await transporter.sendMail(finalMailOptions);
      logEmailEvent(emailType, recipient, 'SUCCESS', { messageId: info.messageId });
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

  const text = `Hello ${cleanName},

Your verification code is: ${otp}

This code is valid for 10 minutes. For your security, do not share this code with anyone.

If you did not request this code, you can safely ignore this email.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text
  }, { emailType: 'verification-otp' });
};

/**
 * 3. Send Guest Checkout Email Verification OTP
 */
export const sendGuestVerificationOTP = async (email, otp, fullName = 'Valued Customer') => {
  const subject = 'Order Verification Code - Hijabs by Shiza';
  const cleanName = fullName || 'Valued Customer';

  const text = `Hello ${cleanName},

Your order verification code is: ${otp}

This code is valid for 10 minutes to verify your order details.

If you did not place an order, you can safely ignore this email.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text
  }, { emailType: 'guest-otp' });
};

/**
 * 4. Send email verification link
 */
export const sendVerificationEmail = async (email, verificationToken) => {
  const subject = 'Verify Your Email Address - Hijabs by Shiza';
  const verificationUrl = `${getFrontendUrl()}/verify-email?token=${verificationToken}`;

  const text = `Hello,

Please verify your email address by visiting the following link:
${verificationUrl}

This link expires in 24 hours.

If you did not create an account, you can safely ignore this email.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text
  }, { emailType: 'verification-link' });
};

/**
 * 5. Send password reset email
 */
export const sendPasswordResetEmail = async (email, resetToken) => {
  const subject = 'Password Reset Request - Hijabs by Shiza';
  const resetUrl = `${getFrontendUrl()}/reset-password?token=${resetToken}`;

  const text = `Hello,

We received a request to reset your password. You can choose a new password by visiting the following link:
${resetUrl}

This link expires in 1 hour.

If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text
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

  const text = `Hello ${fullName || 'there'},

An item from your wishlist is now back in stock:
${productName}${priceFormatted ? ` (${priceFormatted})` : ''}

View item:
${productUrl}

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text
  }, { emailType: 'wishlist-restock' });
};

/**
 * 7. Send welcome email after verification
 */
export const sendWelcomeEmail = async (email, fullName) => {
  const subject = 'Welcome to Hijabs by Shiza';
  const cleanName = fullName || 'there';

  const text = `Hello ${cleanName},

Your account has been successfully verified.

You can view your orders and manage your account details at:
${getFrontendUrl()}

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text
  }, { emailType: 'welcome' });
};

/**
 * Safely resolves and cleans the customer's email address from an order document or plain object.
 * Checks order.customer.email first, then falls back to populated order.userId.email or root order.email.
 * Works seamlessly for both guest users (who only have customer.email) and registered users.
 */
export const resolveCustomerEmail = (order) => {
  if (!order) return null;
  const rawEmail = order.customer?.email ||
    (typeof order.userId === 'object' && order.userId !== null ? order.userId.email : null) ||
    order.email;
  if (!rawEmail || typeof rawEmail !== 'string') return null;
  const cleaned = rawEmail.trim().toLowerCase();
  return /^\S+@\S+\.\S+$/.test(cleaned) ? cleaned : null;
};

/**
 * Safely resolves the customer's display name from an order document or plain object.
 * Works for both guest and registered users with a fallback to 'Valued Customer'.
 */
export const resolveCustomerName = (order) => {
  if (!order) return 'Valued Customer';
  const rawName = order.customer?.name ||
    (typeof order.userId === 'object' && order.userId !== null ? (order.userId.fullName || order.userId.name) : null) ||
    order.name;
  if (!rawName || typeof rawName !== 'string') return 'Valued Customer';
  const cleaned = rawName.trim();
  return cleaned.length > 0 ? cleaned : 'Valued Customer';
};

/**
 * Helper to render order items in clean plain text
 */
const renderOrderItemsText = (items = []) => {
  return items.map(item => {
    const customizations = [];
    if (item.selectedColor) customizations.push(`Color: ${item.selectedColor}`);
    if (item.selectedSize) customizations.push(`Size: ${item.selectedSize}`);
    if (item.selectedTieElastic) customizations.push(`Option: ${item.selectedTieElastic === 'tie' ? 'Tie' : 'Elastic'}`);
    if (item.selectedBridalLength === 'bridal') customizations.push(`Bridal Length (+Rs. ${item.bridalLengthPrice || 0})`);

    const qty = Number(item.quantity) || 1;
    const totalItemPrice = Number(item.price || 0) * qty;
    const details = customizations.length ? ` (${customizations.join(', ')})` : '';

    return `- ${item.productName || 'Product'}${details} x ${qty} - Rs. ${totalItemPrice.toLocaleString()}`;
  }).join('\n');
};

/**
 * 8. Send Order Received Email (Order Placed / Initial Confirmation)
 * Sent immediately after an order is placed (both guest and registered users).
 */
export const sendOrderReceivedEmail = async (order) => {
  const customerEmail = resolveCustomerEmail(order);
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = resolveCustomerName(order);
  const shipping = Number(order.shipping) || 0;
  const subtotal = Number(order.subtotal) || 0;
  const discount = Number(order.discount) || 0;
  const total = Number(order.total) || 0;
  const address = order.customer?.completeAddress || order.customer?.address || '';
  const city = order.customer?.city || '';
  const phone = order.customer?.phone || '';

  const subject = `Order Confirmation #${orderId} - Hijabs by Shiza`;

  const text = `Hello ${customerName},

Thank you for your order #${orderId} with ${SENDER_NAME}.

Order Summary:
${renderOrderItemsText(order.items)}

Subtotal: Rs. ${subtotal.toLocaleString()}
${discount > 0 ? `Discount: -Rs. ${discount.toLocaleString()}\n` : ''}Shipping (${order.deliveryOptionName || order.courier || 'Delivery'}): ${shipping === 0 ? 'Free' : `Rs. ${shipping.toLocaleString()}`}
Total Amount: Rs. ${total.toLocaleString()}

Delivery Details:
Courier Service: ${order.deliveryOptionName || order.courier || 'Standard Courier'}
Estimated Delivery: ${order.estimatedDeliveryTime || '3 to 6 working days'}
Address: ${address ? `${address}, ` : ''}${city}
Contact: ${phone}

We will notify you once your payment is verified and your package is dispatched.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text
  }, { emailType: 'order-received' });
};

/**
 * 9. Send Order Confirmed Email (Payment Verified)
 * Sent when payment receipt is verified and order is confirmed.
 */
export const sendOrderConfirmedEmail = async (order) => {
  const customerEmail = resolveCustomerEmail(order);
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = resolveCustomerName(order);
  const total = Number(order.total) || 0;

  const subject = `Order Confirmed #${orderId} - Hijabs by Shiza`;

  const text = `Hello ${customerName},

Your payment for order #${orderId} (Rs. ${total.toLocaleString()}) has been verified and your order is confirmed.

We are preparing your items for delivery and will provide tracking details once dispatched.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text
  }, { emailType: 'order-confirmed' });
};

/**
 * 10. Send Order Processing Email
 * Sent when order preparation and packing begins.
 */
export const sendOrderProcessingEmail = async (order) => {
  const customerEmail = resolveCustomerEmail(order);
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = resolveCustomerName(order);

  const subject = `Order Processing #${orderId} - Hijabs by Shiza`;

  const text = `Hello ${customerName},

Your order #${orderId} is now being processed and prepared for delivery.

We will send you another update with courier tracking information as soon as your parcel has been dispatched.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text
  }, { emailType: 'order-processing' });
};

/**
 * 11. Send Order Shipped Email
 * Sent when the package is dispatched with courier tracking information.
 */
export const sendOrderShippedEmail = async (order, trackingNumber = '', courier = '') => {
  const customerEmail = resolveCustomerEmail(order);
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = resolveCustomerName(order);
  const trackNum = trackingNumber || order.trackingNumber || 'Available shortly';
  const courierName = courier || order.courier || 'Standard Courier';

  const subject = `Order Shipped #${orderId} - Hijabs by Shiza`;

  const text = `Hello ${customerName},

Your order #${orderId} has been dispatched.

Shipping Details:
Courier: ${courierName}
Tracking Number: ${trackNum}
Estimated Delivery: 3 to 5 business days

Please ensure someone is available at the delivery address to receive the parcel.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text
  }, { emailType: 'order-shipped' });
};

/**
 * 12. Send Order Delivery Attempt / Remain Undelivered Email
 * Sent when delivery attempt could not be completed on first try.
 */
export const sendOrderRemainUndeliveredEmail = async (order, note = '') => {
  const customerEmail = resolveCustomerEmail(order);
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = resolveCustomerName(order);
  const deliveryNote = note || 'Delivery attempt could not be completed.';

  const subject = `Delivery Update #${orderId} - Hijabs by Shiza`;

  const text = `Hello ${customerName},

Our courier partner was unable to deliver your package for order #${orderId}.
Status Note: ${deliveryNote}

Please ensure someone is reachable at your contact number and available at the delivery address for the next attempt. If you need to provide updated delivery instructions, please reply to this email or contact us at ${getSenderEmail()}.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text
  }, { emailType: 'order-undelivered' });
};

/**
 * 13. Send Order Delivered Email
 * Sent when order is successfully delivered.
 */
export const sendOrderDeliveredEmail = async (order) => {
  const customerEmail = resolveCustomerEmail(order);
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = resolveCustomerName(order);

  const subject = `Order Delivered #${orderId} - Hijabs by Shiza`;

  const text = `Hello ${customerName},

Your order #${orderId} has been delivered.

Thank you for shopping with ${SENDER_NAME}. If you have any questions or concerns regarding your order, please reply to this email.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text
  }, { emailType: 'order-delivered' });
};

/**
 * 14. Send Order Cancelled Email
 * Sent when order is cancelled or payment rejected.
 */
export const sendOrderCancelledEmail = async (order, reason = '') => {
  const customerEmail = resolveCustomerEmail(order);
  if (!customerEmail) return;

  const orderId = order.orderId || order._id;
  const customerName = resolveCustomerName(order);
  const cancelReason = reason || 'Order request could not be completed.';

  const subject = `Order Cancelled #${orderId} - Hijabs by Shiza`;

  const text = `Hello ${customerName},

Your order #${orderId} has been cancelled.
Reason: ${cancelReason}

If you have any questions, please contact our support team at ${getSenderEmail()}.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: customerEmail,
    subject,
    text
  }, { emailType: 'order-cancelled' });
};

/**
 * 13. Send Contact Query Received Email (Confirmation)
 */
export const sendContactConfirmationEmail = async ({ name = '', email, subject: querySubject = '' } = {}) => {
  if (!email) return;

  const cleanName = name || 'there';
  const subject = 'Message Received - Hijabs by Shiza';

  const text = `Hello ${cleanName},

Thank you for contacting us. We have received your inquiry${querySubject ? ` regarding "${querySubject}"` : ''}.

Our customer support team will review your message and get back to you soon.

${SENDER_NAME}
Customer Support: ${getSenderEmail()}`;

  return sendMailWithRetry({
    to: email,
    subject,
    text
  }, { emailType: 'contact-received' });
};
