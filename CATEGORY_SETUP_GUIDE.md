# Category CRUD - Quick Setup Guide

## ✅ Prerequisites

All required dependencies are already installed in `package.json`:
- ✅ `cloudinary` - Image storage
- ✅ `multer` - File upload handling
- ✅ `express-validator` - Input validation
- ✅ `mongoose` - MongoDB ODM

## 🚀 Setup Steps

### Step 1: Configure Cloudinary

1. **Create Cloudinary Account** (if you haven't already)
   - Go to [https://cloudinary.com](https://cloudinary.com)
   - Sign up for free account
   - Get your credentials from Dashboard

2. **Add Cloudinary Credentials to `.env`**
   ```env
   # Existing environment variables...
   
   # Cloudinary Configuration
   CLOUDINARY_CLOUD_NAME=your_cloud_name_here
   CLOUDINARY_API_KEY=123456789012345
   CLOUDINARY_API_SECRET=your_secret_here
   ```

   **⚠️ Important:** Replace with your actual Cloudinary credentials!

### Step 2: Verify Backend is Running

```bash
cd HBS-API
npm run dev
```

Expected output:
```
Server running on port 5000
Connected to MongoDB
```

### Step 3: Test Category Endpoints

#### Test 1: Get All Categories
```bash
curl http://localhost:5000/api/categories
```

Expected: `{ "success": true, "data": { "categories": [] } }`

#### Test 2: Create Category WITHOUT Image (JSON)
```bash
curl -X POST http://localhost:5000/api/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "name": "Test Category",
    "slug": "test-category",
    "description": "Test description",
    "status": "active"
  }'
```

#### Test 3: Create Category WITH Image (FormData)
```bash
curl -X POST http://localhost:5000/api/categories \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "name=Women's Hijabs" \
  -F "slug=womens-hijabs" \
  -F "description=Beautiful collection of women's hijabs" \
  -F "status=active" \
  -F "image=@/path/to/your/image.jpg"
```

Replace `/path/to/your/image.jpg` with actual image path.

### Step 4: Verify Frontend

```bash
cd HBS-UI
npm run dev
```

1. Navigate to `http://localhost:5173/admin/login`
2. Login with admin credentials:
   - Email: `admin@hijabsbyshiza.com`
   - Password: `Admin@123`
3. Go to **Categories** page
4. Click "Add Category"
5. Upload a cover image
6. Save and verify

## 🧪 Testing Checklist

### Backend Tests

- [ ] **GET** `/api/categories` - Returns empty array initially
- [ ] **POST** `/api/categories` (without image) - Creates category with JSON
- [ ] **POST** `/api/categories` (with image) - Uploads to Cloudinary and creates category
- [ ] **GET** `/api/categories/:id` - Returns single category with cover image URL
- [ ] **PUT** `/api/categories/:id` (with new image) - Updates category and replaces image
- [ ] **DELETE** `/api/categories/:id` - Deletes category

### Frontend Tests

- [ ] Categories page loads without errors
- [ ] "Add Category" modal opens
- [ ] Can select image file
- [ ] Image preview appears after selection
- [ ] Can remove selected image
- [ ] Form submits successfully with image
- [ ] New category appears in list with cover image thumbnail
- [ ] Can edit existing category
- [ ] Can replace category cover image
- [ ] Can delete category
- [ ] Toast notifications appear for all actions

## 🐛 Troubleshooting

### Error: "Must supply cloud_name"
```
❌ Issue: Cloudinary credentials not configured
✅ Fix: Add CLOUDINARY_* variables to .env file
```

### Error: "Only image files are allowed"
```
❌ Issue: Uploading non-image file
✅ Fix: Select a .jpg, .png, .gif, or .webp file
```

### Error: "File too large"
```
❌ Issue: Image exceeds 5MB limit
✅ Fix: Compress image before uploading
```

### Error: "Slug already exists"
```
❌ Issue: Category with that slug already exists
✅ Fix: Use a different name or edit the slug manually
```

### Images not uploading
```
✅ Check Cloudinary credentials in .env
✅ Verify internet connection
✅ Check browser console for errors
✅ Verify file is under 5MB
✅ Check file type is image/*
```

### Frontend not connecting to API
```
✅ Verify backend is running on port 5000
✅ Check VITE_API_BASE_URL in frontend .env
✅ Check admin token is valid
✅ Check browser Network tab for error details
```

## 📊 Database Verification

### Check Categories in MongoDB

```bash
# Connect to MongoDB
mongosh

# Switch to database
use hbs-ecommerce

# View categories
db.categories.find().pretty()
```

Expected output:
```javascript
{
  _id: ObjectId("..."),
  name: "Women's Hijabs",
  slug: "womens-hijabs",
  coverImage: "https://res.cloudinary.com/your-cloud/image/upload/...",
  status: "active",
  level: 0,
  path: [],
  createdAt: ISODate("..."),
  updatedAt: ISODate("...")
}
```

## 🎯 Quick Test Script

Create `test-category-upload.sh`:

```bash
#!/bin/bash

# Get admin token first
TOKEN="your_admin_token_here"

# Test 1: Create category without image
echo "Test 1: Creating category without image..."
curl -X POST http://localhost:5000/api/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Test 1","slug":"test-1","status":"active"}'

echo "\n\nTest 2: Creating category with image..."
curl -X POST http://localhost:5000/api/categories \
  -H "Authorization: Bearer $TOKEN" \
  -F "name=Test 2" \
  -F "slug=test-2" \
  -F "status=active" \
  -F "image=@./test-image.jpg"

echo "\n\nTest 3: Get all categories..."
curl http://localhost:5000/api/categories

echo "\n\nDone!"
```

Run:
```bash
chmod +x test-category-upload.sh
./test-category-upload.sh
```

## 📝 API Response Examples

### Successful Category Creation
```json
{
  "statusCode": 201,
  "success": true,
  "message": "Category created successfully",
  "data": {
    "category": {
      "_id": "67890",
      "name": "Women's Hijabs",
      "slug": "womens-hijabs",
      "description": "Beautiful collection",
      "coverImage": "https://res.cloudinary.com/hbs/image/upload/v1234567890/hbs-categories/xyz.jpg",
      "status": "active",
      "level": 0,
      "path": [],
      "createdAt": "2024-01-10T12:00:00.000Z",
      "updatedAt": "2024-01-10T12:00:00.000Z"
    }
  }
}
```

### Error Response
```json
{
  "statusCode": 400,
  "success": false,
  "message": "Slug already exists"
}
```

## 🎨 Frontend Usage Example

```javascript
// In your admin panel
const handleCreateCategory = async () => {
  const formData = new FormData();
  formData.append('name', 'Women\'s Collection');
  formData.append('slug', 'womens-collection');
  formData.append('status', 'active');
  formData.append('image', imageFile); // File from input

  try {
    const response = await adminService.createCategory(formData);
    toast.success('Category created successfully!');

  } catch (error) {
    toast.error(error.message);
  }
};
```

## ✅ Success Indicators

### Backend
- ✅ Server starts without errors
- ✅ Categories table exists in MongoDB
- ✅ Cloudinary folder `hbs-categories` appears in Media Library
- ✅ POST request returns Cloudinary URL in response
- ✅ Image appears in Cloudinary dashboard

### Frontend
- ✅ Categories page loads
- ✅ Can upload and preview images
- ✅ Form submits successfully
- ✅ Success toast appears
- ✅ New category appears in list with thumbnail
- ✅ Can edit/delete categories

## 📚 Additional Resources

- [Cloudinary Setup Guide](./CLOUDINARY_SETUP.md)
- [Complete Category CRUD Documentation](../HBS-UI/CATEGORY_CRUD_COMPLETE.md)
- [Cloudinary Dashboard](https://cloudinary.com/console)
- [MongoDB Compass](https://www.mongodb.com/products/compass)

## 🚀 You're All Set!

If all tests pass, your Category CRUD with image upload is fully functional! 🎉

**Next Steps:**
1. Create your first category with a cover image
2. Build the category hierarchy
3. Assign products to categories
4. Display categories on the customer-facing website

---

**Need Help?**
- Check [Troubleshooting](#-troubleshooting) section
- Review [CLOUDINARY_SETUP.md](./CLOUDINARY_SETUP.md)
- Check API logs: `npm run dev` (in HBS-API)
- Check browser console (F12)

