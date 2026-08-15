import dotenv from 'dotenv';
import app from './src/app.js';
import connectDB from './src/config/database.js';
import { logServerError } from './src/services/errorLog.service.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 8000;

// Connect to database
connectDB().catch((error) => {
  console.error('✗ Database connection failed. Shutting down...', error.message);
  process.exit(1);
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (err) => {
  console.error('✗ Unhandled Rejection:', err?.message || err);
  await logServerError({
    err,
    statusCode: 500,
    message: `Unhandled Rejection: ${err?.message || 'Unknown error'}`,
    severity: 'critical'
  });
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', async (err) => {
  console.error('✗ Uncaught Exception:', err?.message || err);
  await logServerError({
    err,
    statusCode: 500,
    message: `Uncaught Exception: ${err?.message || 'Unknown error'}`,
    severity: 'critical'
  });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated.');
  });
});
