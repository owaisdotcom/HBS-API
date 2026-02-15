import dotenv from 'dotenv';
import app from './src/app.js';
import connectDB from './src/config/database.js';

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
  console.log(`┌──────────────────────────────────────┐`);
  console.log(`│  🚀 HBS API Server Running           │`);
  console.log(`│  📍 Port: ${PORT}                       │`);
  console.log(`│  🌍 Mode: ${process.env.NODE_ENV}                │`);
  console.log(`│  🔗 URL: http://localhost:${PORT}       │`);
  console.log(`└──────────────────────────────────────┘`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('✗ Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('✗ Uncaught Exception:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✓ Process terminated');
  });
});
