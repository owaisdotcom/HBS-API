import app from '../src/app.js';
import connectDB from '../src/config/database.js';

let isConnected = false;

const ensureDb = async () => {
  if (isConnected) {
    return;
  }
  await connectDB();
  isConnected = true;
};

export default async function handler(req, res) {
  try {
    await ensureDb();
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed'
    });
  }

  return app(req, res);
}

