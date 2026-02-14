import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    const isDevelopment = process.env.NODE_ENV === 'development';
    const mongoUri = isDevelopment
      ? (process.env.MONGODB_URI_LOCAL )
      : (process.env.MONGODB_URI );
    const conn = await mongoose.connect(mongoUri, {
    // Disable retryable writes so standalone MongoDB works (no replica set required).
    // Remove or set to true if you use a replica set (e.g. Atlas).
    retryWrites: false,
  });

    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
    console.log(`✓ Database: ${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    console.error('✗ Database connection error:', error.message);
    throw error;
  }
};

export default connectDB;

