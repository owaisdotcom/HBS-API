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
    const conn = await mongoose.connect(mongoUri);

    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
    console.log(`✓ Database: ${conn.connection.name}`);
    return conn.connection;
  } catch (error) {
    console.error('✗ Database connection error:', error.message);
    throw error;
  }
};

export default connectDB;

