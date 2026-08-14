import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
// import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import errorHandler from './middleware/error.middleware.js';

const app = express();

const allowedOrigins = new Set(
  [
    'https://hbs-qa.vercel.app',
    'https://hijabsbyshiza.com',
    'https://www.hijabsbyshiza.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://hbs-api-three.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean)
);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// MongoDB sanitization - TEMPORARILY DISABLED DUE TO COMPATIBILITY ISSUE
// TODO: Fix or replace with custom sanitization
// app.use(mongoSanitize({
//   replaceWith: '_',
//   onSanitize: ({ req, key }) => {
//     console.warn(`Sanitized key: ${key} in request`);
//   }
// }));

// Rate limiting - REMOVED
// app.use('/api', limiter);

// Compression
app.use(compression());

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check route
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'HBS E-Commerce API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      admin: '/api/admin',
      products: '/api/products',
      categories: '/api/categories',
      orders: '/api/orders',
      coupons: '/api/coupons',
      wishlist: '/api/wishlist',
      reviews: '/api/reviews',
      contact: '/api/contact',
      homepage: '/api/homepage',
      navigation: '/api/navigation',
      settings: '/api/settings'
    }
  });
});

// Import routes
import routes from './routes/index.js';
import { getSitemap } from './controllers/seo.controller.js';

app.get('/sitemap.xml', getSitemap);
app.get('/api/sitemap.xml', getSitemap);
app.use('/api', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;

