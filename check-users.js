// Script to check what users exist in the database
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './src/models/User.js';

dotenv.config();

async function checkUsers() {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('❌ MongoDB URI not found in environment variables');
      console.error('Please set MONGODB_URI in your .env file');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    const users = await User.find({}).select('fullName email isEmailVerified createdAt emailVerificationOTPExpire');
    
    console.log('\n=================================');
    console.log('USERS IN DATABASE:', users.length);
    console.log('=================================\n');
    
    if (users.length === 0) {
      console.log('❌ No users found in database!');
      console.log('You need to complete the signup first.\n');
    } else {
      users.forEach((user, index) => {
        console.log(`User ${index + 1}:`);
        console.log('  Name:', user.fullName);
        console.log('  Email:', user.email);
        console.log('  Verified:', user.isEmailVerified ? '✅ Yes' : '❌ No');
        console.log('  Created:', user.createdAt);
        console.log('  OTP Expires:', user.emailVerificationOTPExpire ? new Date(user.emailVerificationOTPExpire) : 'N/A');
        console.log('  OTP Valid:', user.emailVerificationOTPExpire && user.emailVerificationOTPExpire > Date.now() ? '✅ Yes' : '❌ No');
        console.log('---');
      });
    }
    
    console.log('\n=================================');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();

