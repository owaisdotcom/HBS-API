# HBS E-Commerce Backend API

Backend API for **Hijabs By Shiza (HBS)** e-commerce platform. Built with Node.js, Express, and MongoDB.

## Features

✅ User Authentication & Authorization (JWT)  
✅ Admin Panel with Role-Based Access  
✅ Product Management (CRUD, Search, Filters)  
✅ Category Management (Nested Hierarchy)  
✅ Order Management (Status Tracking, Payment Verification)  
✅ Coupon System  
✅ Wishlist & Reviews  
✅ Dynamic Homepage (Navigation, Hero Slider, Sections)  
✅ Site Settings Management  
✅ File Upload (Cloudinary Integration)  
✅ Email Notifications  
✅ Contact Form  
✅ RESTful API Design  

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose
- **Authentication**: JWT (jsonwebtoken)
- **File Upload**: Multer + Cloudinary
- **Validation**: express-validator
- **Security**: bcryptjs, helmet, cors, express-rate-limit

## Installation

### Prerequisites

- Node.js (v18 or higher)
- MongoDB (local or MongoDB Atlas)
- Cloudinary account (for image uploads)

### Setup

1. **Clone the repository**

```bash
git clone <repository-url>
cd HBS-API
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure environment variables**

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/hbs-ecommerce

# JWT
JWT_SECRET=your-secret-key-here
JWT_EXPIRE=7d
ADMIN_JWT_SECRET=your-admin-secret-key
ADMIN_JWT_EXPIRE=24h

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=hbs.queries@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=hbs.queries@gmail.com

# Frontend
FRONTEND_URL=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

4. **Run the server**

```bash
# Development
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:5000`

## API Endpoints

### Base URL: `/api`

### Authentication

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| POST | `/auth/signup` | Register new user | Public |
| POST | `/auth/login` | User login | Public |
| GET | `/auth/me` | Get current user | Private |
| PUT | `/auth/profile` | Update profile | Private |
| PUT | `/auth/password` | Change password | Private |
| POST | `/auth/address` | Add address | Private |
| PUT | `/auth/address/:id` | Update address | Private |
| DELETE | `/auth/address/:id` | Delete address | Private |

### Admin

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| POST | `/admin/login` | Admin login | Public |
| GET | `/admin/me` | Get admin profile | Admin |
| POST | `/admin/create` | Create admin | Super Admin |
| PUT | `/admin/password` | Change password | Admin |

### Products

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/products` | Get all products | Public |
| GET | `/products/featured` | Get featured products | Public |
| GET | `/products/new-arrivals` | Get new arrivals | Public |
| GET | `/products/:id` | Get single product | Public |
| GET | `/products/:id/related` | Get related products | Public |
| POST | `/products` | Create product | Admin |
| PUT | `/products/:id` | Update product | Admin |
| DELETE | `/products/:id` | Delete product | Admin |
| DELETE | `/products/:id/images/:imageId` | Delete product image | Admin |

### Categories

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/categories` | Get all categories (hierarchy) | Public |
| GET | `/categories/flat` | Get all categories (flat) | Public |
| GET | `/categories/:id` | Get single category | Public |
| GET | `/categories/:id/products` | Get category products | Public |
| GET | `/categories/:id/subcategories` | Get subcategories | Public |
| POST | `/categories` | Create category | Admin |
| PUT | `/categories/:id` | Update category | Admin |
| DELETE | `/categories/:id` | Delete category | Admin |

### Orders

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| POST | `/orders` | Create order | Public/Private |
| GET | `/orders` | Get orders | Private |
| GET | `/orders/:id` | Get single order | Private |
| POST | `/orders/:id/receipt` | Upload payment receipt | Public |
| PUT | `/orders/:id/status` | Update order status | Admin |
| PUT | `/orders/:id/verify-payment` | Verify payment | Admin |
| PUT | `/orders/:id/cancel` | Cancel order | Private |
| GET | `/orders/stats/summary` | Get order statistics | Admin |

### Coupons

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/coupons` | Get all coupons | Admin |
| GET | `/coupons/:id` | Get single coupon | Admin |
| GET | `/coupons/:code/validate` | Validate coupon | Public |
| POST | `/coupons` | Create coupon | Admin |
| PUT | `/coupons/:id` | Update coupon | Admin |
| DELETE | `/coupons/:id` | Delete coupon | Admin |

### Wishlist

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/wishlist` | Get user wishlist | Private |
| POST | `/wishlist/add` | Add to wishlist | Private |
| DELETE | `/wishlist/remove/:productId` | Remove from wishlist | Private |
| DELETE | `/wishlist/clear` | Clear wishlist | Private |
| GET | `/wishlist/check/:productId` | Check if in wishlist | Private |

### Reviews

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/reviews/product/:productId` | Get product reviews | Public |
| POST | `/reviews` | Create review | Private |
| PUT | `/reviews/:id` | Update review | Private |
| DELETE | `/reviews/:id` | Delete review | Private |
| GET | `/reviews/pending` | Get pending reviews | Admin |
| PUT | `/reviews/:id/moderate` | Moderate review | Admin |

### Homepage

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| GET | `/homepage/settings` | Get complete homepage config | Public |
| GET | `/homepage/navigation` | Get navigation menu | Public |
| PUT | `/homepage/navigation/:id` | Update navigation | Admin |
| GET | `/homepage/hero-slider` | Get hero slider | Public |
| PUT | `/homepage/hero-slider/:id` | Update hero slider | Admin |
| POST | `/homepage/hero-slider/:id/slides` | Add slide | Admin |
| DELETE | `/homepage/hero-slider/:id/slides/:slideId` | Delete slide | Admin |
| GET | `/homepage/sections` | Get homepage sections | Public |
| PUT | `/homepage/sections/:id` | Update sections | Admin |
| GET | `/homepage/site-settings` | Get site settings | Public |
| PUT | `/homepage/site-settings/:id` | Update site settings | Admin |

### Contact

| Method | Endpoint | Description | Access |
|--------|----------|-------------|---------|
| POST | `/contact` | Submit contact query | Public |
| GET | `/contact` | Get all queries | Admin |
| GET | `/contact/:id` | Get single query | Admin |
| PUT | `/contact/:id` | Update query | Admin |
| DELETE | `/contact/:id` | Delete query | Admin |

## Request Examples

### User Registration

```bash
POST /api/auth/signup
Content-Type: application/json

{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+923001234567",
  "password": "password123"
}
```

### Create Product (Admin)

```bash
POST /api/products
Authorization: Bearer <admin-token>
Content-Type: multipart/form-data

{
  "name": "Premium Crinkle Silk Hijab",
  "slug": "premium-crinkle-silk-hijab",
  "description": "Elegant hijab made from premium crinkle silk",
  "categoryId": "64f7...",
  "price": 1500,
  "originalPrice": 1800,
  "stock": 50,
  "colors": ["Black", "White", "Beige"],
  "sizes": ["Standard", "Large"],
  "isFeatured": true,
  "images": [file1, file2, file3]
}
```

### Create Order

```bash
POST /api/orders
Content-Type: application/json

{
  "customer": {
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+923001234567",
    "address": "123 Main St",
    "city": "Karachi",
    "postalCode": "75500"
  },
  "items": [
    {
      "productId": "64f7...",
      "quantity": 2,
      "selectedColor": "Black",
      "selectedSize": "Standard"
    }
  ],
  "couponCode": "WELCOME10",
  "paymentMethod": "bank_transfer"
}
```

## Error Handling

The API uses standard HTTP status codes:

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

Error Response Format:

```json
{
  "success": false,
  "message": "Error message here"
}
```

## Security Features

- Password hashing with bcrypt
- JWT authentication
- Rate limiting
- Input validation
- XSS protection
- MongoDB injection prevention
- CORS configuration
- Helmet security headers

## Database Models

- **User** - Customer accounts
- **Admin** - Admin accounts with permissions
- **Product** - Product catalog
- **Category** - Hierarchical categories
- **Order** - Customer orders with tracking
- **Coupon** - Discount coupons
- **Wishlist** - User wishlists
- **Review** - Product reviews
- **NavigationMenu** - Dynamic navigation
- **HeroSlider** - Homepage hero slider
- **HomepageSection** - Homepage sections
- **SiteSetting** - Global site settings
- **ContactQuery** - Contact form submissions
- **Testimonial** - Customer testimonials
- **AuditLog** - Admin action logs

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Format code (if using Prettier)
npm run format

# Lint code (if using ESLint)
npm run lint
```

## Deployment

### MongoDB Atlas Setup

1. Create a MongoDB Atlas account
2. Create a new cluster
3. Get connection string
4. Update `MONGODB_URI` in `.env`

### Cloudinary Setup

1. Create Cloudinary account
2. Get API credentials from dashboard
3. Update Cloudinary variables in `.env`

### Production Deployment

```bash
# Set NODE_ENV to production
NODE_ENV=production

# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name hbs-api
pm2 save
pm2 startup
```

## API Testing

Use Postman, Thunder Client, or curl to test endpoints:

```bash
# Health check
curl http://localhost:5000/health

# Get all products
curl http://localhost:5000/api/products

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password123"}'
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

ISC

## Support

For support, email support@hijabsbyshiza.com
