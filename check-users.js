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


    const users = await User.find({}).select('fullName email isEmailVerified createdAt emailVerificationOTPExpire');





    if (users.length === 0) {


    } else {
      users.forEach((user, index) => {








      });
    }



    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();

