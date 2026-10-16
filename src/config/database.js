import mongoose from 'mongoose';

let cachedConnectionPromise = null;

const connectDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      return mongoose.connection;
    }

    if (!cachedConnectionPromise) {
      const isDevelopment = process.env.NODE_ENV === 'development';
      const mongoUri = isDevelopment
        ? (process.env.MONGODB_URI_LOCAL || process.env.MONGODB_URI)
        : (process.env.MONGODB_URI);

      cachedConnectionPromise = mongoose.connect(mongoUri, {
        retryWrites: false,
        maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000
      }).then((conn) => {
        return conn.connection;
      }).catch((err) => {
        cachedConnectionPromise = null;
        throw err;
      });
    }

    return await cachedConnectionPromise;
  } catch (error) {
    console.error('✗ Database connection error:', error.message);
    throw error;
  }
};

export default connectDB;

