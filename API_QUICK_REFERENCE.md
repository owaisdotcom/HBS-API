# HBS Backend API - Quick Reference

## 🚀 Base URL
```
http://localhost:5000/api
```

## 🔑 Authentication Headers

### User Endpoints
```
Authorization: Bearer <user_jwt_token>
```

### Admin Endpoints
```
Authorization: Bearer <admin_jwt_token>
```

---

## 📌 Quick Commands

### Start Server
```bash
npm run dev          # Development with auto-reload
npm start            # Production mode
npm run seed:admin   # Create default admin
```

### Default Admin Credentials
```
Username: admin
Password: admin123
```

---

## 🎯 Essential Endpoints

### 1. Authentication

#### User Signup
```http
POST /api/auth/signup
Content-Type: application/json

{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+923001234567",
  "password": "password123"
}
```

#### User Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "password123"
}
```

#### Admin Login
```http
POST /api/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

### 2. Products

#### Get All Products
```http
GET /api/products?page=1&limit=20&sort=-createdAt&minPrice=500&maxPrice=2000
```

#### Get Single Product
```http
GET /api/products/:id
# or
GET /api/products/:slug
```

#### Create Product (Admin)
```http
POST /api/products
Authorization: Bearer <admin_token>
Content-Type: multipart/form-data

{
  "name": "Premium Hijab",
  "slug": "premium-hijab",
  "categoryId": "64f...",
  "price": 1500,
  "stock": 50,
  "images": [file1, file2]
}
```

### 3. Categories

#### Get All Categories
```http
GET /api/categories
```

#### Get Category Products
```http
GET /api/categories/:id/products?page=1&limit=20
```

### 4. Orders

#### Create Order
```http
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
      "productId": "64f...",
      "quantity": 2,
      "selectedColor": "Black",
      "selectedSize": "Standard"
    }
  ],
  "couponCode": "WELCOME10"
}
```

#### Upload Payment Receipt
```http
POST /api/orders/:orderId/receipt
Content-Type: multipart/form-data

{
  "image": <receipt_file>
}
```

### 5. Wishlist

#### Get Wishlist
```http
GET /api/wishlist
Authorization: Bearer <user_token>
```

#### Add to Wishlist
```http
POST /api/wishlist/add
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "productId": "64f..."
}
```

### 6. Reviews

#### Get Product Reviews
```http
GET /api/reviews/product/:productId
```

#### Create Review
```http
POST /api/reviews
Authorization: Bearer <user_token>
Content-Type: application/json

{
  "productId": "64f...",
  "rating": 5,
  "title": "Amazing product!",
  "comment": "Great quality hijab"
}
```

### 7. Homepage Configuration

#### Get Complete Homepage
```http
GET /api/homepage/settings
```

#### Update Hero Slider (Admin)
```http
PUT /api/homepage/hero-slider/:id
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "slides": [...],
  "autoPlay": true,
  "autoPlaySpeed": 5000
}
```

### 8. Coupons

#### Validate Coupon
```http
GET /api/coupons/:code/validate?orderAmount=3000
```

---

## 🔍 Query Parameters

### Pagination
```
?page=1&limit=20
```

### Sorting
```
?sort=-createdAt    # Descending
?sort=price         # Ascending
?sort=-price,name   # Multiple fields
```

### Filtering
```
?status=active
?category=64f...
?minPrice=500&maxPrice=2000
?isFeatured=true
?inStock=true
```

### Search
```
?search=hijab
```

---

## 📦 Response Format

### Success Response
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Success message",
  "data": {
    ...
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error message"
}
```

### Paginated Response
```json
{
  "success": true,
  "data": {
    "items": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "pages": 8
    }
  }
}
```

---

## 🎨 Status Codes

- `200` - OK
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

## 🛠️ Common Tasks

### Create a Product
1. Login as admin → Get token
2. Upload product with images
3. Product appears in catalog

### Process an Order
1. Customer creates order
2. Upload payment receipt
3. Admin verifies payment
4. Update order status
5. Order fulfilled

### Manage Homepage
1. Login as admin
2. Update navigation menu
3. Add/edit hero slides
4. Configure homepage sections
5. Update site settings

---

## 🔒 Admin Permissions

- `products` - Manage products
- `categories` - Manage categories
- `orders` - Manage orders
- `users` - Manage users
- `coupons` - Manage coupons
- `reviews` - Moderate reviews
- `homepage` - Configure homepage
- `settings` - Manage settings

**Super Admin** has all permissions automatically.

---

## 💡 Tips

1. **Always include Authorization header** for protected routes
2. **Use multipart/form-data** for file uploads
3. **Validate coupon before** applying to order
4. **Check stock availability** before creating order
5. **Use pagination** for large datasets
6. **Handle errors gracefully** in frontend
7. **Store JWT tokens securely** (httpOnly cookies recommended)
8. **Refresh tokens** before expiry

---

## 🐛 Common Errors & Solutions

### 401 Unauthorized
- Check if token is included in headers
- Verify token hasn't expired
- Ensure correct token for user/admin

### 400 Bad Request
- Check request body format
- Validate required fields
- Check data types

### 404 Not Found
- Verify resource ID exists
- Check URL spelling
- Ensure resource hasn't been deleted

### 500 Internal Server Error
- Check server logs
- Verify database connection
- Check Cloudinary configuration

---

## 📚 Resources

- **Full Documentation**: [README.md](./README.md)
- **Setup Guide**: [SETUP.md](./SETUP.md)
- **Implementation Summary**: [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)

---

## 🚀 Ready to Build!

Your backend is ready. Start making API calls from your frontend!

**Happy Coding! 🎉**

