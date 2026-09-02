import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    const isDevelopment = process.env.NODE_ENV === 'development';
    const mongoUri = isDevelopment
      ? (process.env.MONGODB_URI_LOCAL)
      : (process.env.MONGODB_URI);
    const conn = await mongoose.connect(mongoUri, {
      retryWrites: false,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000
    });



    return conn.connection;
  } catch (error) {
    console.error('✗ Database connection error:', error.message);
    throw error;
  }
};

export default connectDB;

