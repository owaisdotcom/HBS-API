import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
// import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import errorHandler from './middleware/error.middleware.js';

import { performanceLogger } from './middleware/performance-logger.middleware.js';

const app = express();

// Trust proxy header for Vercel deployment (resolves ERR_ERL_UNEXPECTED_X_FORWARDED_FOR)
app.set('trust proxy', 1);

// Disable ETag generation to prevent 304 Not Modified responses across all storefront APIs
app.disable('etag');

// Performance logger middleware
app.use(performanceLogger);

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
const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host.endsWith('vercel.app') || host.endsWith('hijabsbyshiza.com') || host === 'localhost') {
      return true;
    }
  } catch (_) {}
  return false;
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'x-request-id']
}));

// Global anti-caching middleware for all /api GET and HEAD endpoints:
// Prevents conditional request caching (304 Not Modified) and enforces 200 OK with fresh data
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    delete req.headers['if-none-match'];
    delete req.headers['if-modified-since'];

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

// Preflight & CORS header middleware (dynamically allows all requested headers like if-none-match)
app.use((req, res, next) => {
  const requestHeaders = req.headers['access-control-request-headers'];
  if (requestHeaders) {
    res.setHeader('Access-Control-Allow-Headers', requestHeaders);
  }
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    if (isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    }
    return res.sendStatus(204);
  }
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request ID middleware for tracing and error logs
app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  res.setHeader('x-request-id', req.requestId);
  next();
});

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
import { generalLimiter } from './middleware/rateLimiter.middleware.js';

app.get('/sitemap.xml', getSitemap);
app.get('/api/sitemap.xml', getSitemap);

// Global distributed rate limiting on /api endpoints
app.use('/api', generalLimiter);

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

