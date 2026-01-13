import express from 'express';
import { testEmailConnection, sendVerificationOTP } from '../services/email.service.js';
import User from '../models/User.js';

const router = express.Router();

// Test email connection
router.get('/test-connection', async (req, res) => {
  try {
    const isConnected = await testEmailConnection();
    res.json({
      success: isConnected,
      message: isConnected ? 'Email server connection successful' : 'Email server connection failed',
      config: {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        user: process.env.EMAIL_USER,
        from: process.env.EMAIL_FROM
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error testing email connection',
      error: error.message
    });
  }
});

// Test send email
router.post('/send-test-otp', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address'
      });
    }

    const testOTP = '123456';
    await sendVerificationOTP(email, testOTP, 'Test User');
    
    res.json({
      success: true,
      message: `Test OTP sent to ${email}`,
      otp: testOTP
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  }
});

// Check OTP status for an email
router.get('/check-otp/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        email: user.email,
        isEmailVerified: user.isEmailVerified,
        hasOTP: !!user.emailVerificationOTP,
        otpExpires: user.emailVerificationOTPExpire ? new Date(user.emailVerificationOTPExpire) : null,
        isExpired: user.emailVerificationOTPExpire ? user.emailVerificationOTPExpire < Date.now() : null,
        timeRemaining: user.emailVerificationOTPExpire ? Math.max(0, Math.floor((user.emailVerificationOTPExpire - Date.now()) / 1000)) : 0,
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to check OTP status',
      error: error.message
    });
  }
});

export default router;

