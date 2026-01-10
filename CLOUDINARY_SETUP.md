# Cloudinary Setup Guide

## Overview
This project uses Cloudinary for image storage and management. Cloudinary provides reliable, cloud-based image hosting with automatic optimization and transformations.

## Required Environment Variables

Add these to your `.env` file:

```env
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Setup Steps

### 1. Create Cloudinary Account
1. Go to [https://cloudinary.com](https://cloudinary.com)
2. Click "Sign Up for Free"
3. Complete the registration process

### 2. Get Your Credentials
1. Log in to your Cloudinary dashboard
2. Go to **Dashboard** → **Account Details**
3. You'll find:
   - **Cloud Name** - Your unique cloud identifier
   - **API Key** - Your public API key
   - **API Secret** - Your private API secret (keep this secure!)

### 3. Configure Your `.env` File
Create a `.env` file in the `HBS-API` directory (if it doesn't exist):

```env
# Copy your credentials from Cloudinary dashboard
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=123456789012345
CLOUDINARY_API_SECRET=your_api_secret_here
```

**⚠️ Important:** Never commit your `.env` file to version control!

## Folder Structure on Cloudinary

The application automatically organizes uploaded images into folders:

- **`hbs-products/`** - Product images
- **`hbs-categories/`** - Category cover images
- **`hbs-orders/`** - Order-related images (receipts, etc.)

## Image Transformations

### Category Cover Images
- **Max dimensions:** 1000x1000px
- **Crop mode:** limit (maintains aspect ratio)
- **Quality:** auto:good (Cloudinary's smart compression)
- **Max file size:** 5MB

### Product Images
- **Max dimensions:** 1000x1000px
- **Crop mode:** limit
- **Quality:** auto:good
- **Max file size:** 5MB

## Usage in Code

### Upload Service
The `UploadService` (`src/services/upload.service.js`) handles all Cloudinary operations:

```javascript
import uploadService from '../services/upload.service.js';

// Upload single image
const imageUrl = await uploadService.uploadSingle(file, 'hbs-categories');

// Upload multiple images
const imageUrls = await uploadService.uploadMultiple(files, 'hbs-products');

// Delete image
const publicId = uploadService.getPublicIdFromUrl(imageUrl);
await uploadService.deleteImage(publicId);
```

### Category Controller Example
```javascript
// Handle image upload in category creation
let coverImage = null;
if (req.file) {
  coverImage = await uploadService.uploadSingle(req.file, 'hbs-categories');
}

const category = await Category.create({
  name,
  slug,
  coverImage, // Stores the Cloudinary URL
  // ... other fields
});
```

## API Endpoints with Image Upload

### Create Category with Cover Image
```bash
POST /api/categories
Content-Type: multipart/form-data
Authorization: Bearer <admin_token>

Form Data:
- name: "Summer Collection"
- slug: "summer-collection"
- description: "Beautiful summer dresses"
- status: "active"
- image: (file)
```

### Update Category with New Cover Image
```bash
PUT /api/categories/:id
Content-Type: multipart/form-data
Authorization: Bearer <admin_token>

Form Data:
- name: "Summer Collection 2024"
- image: (file)  # Optional - only include if changing image
```

## Testing Image Upload

### Using Postman
1. Select **POST** method
2. URL: `http://localhost:5000/api/categories`
3. **Headers:**
   - `Authorization: Bearer YOUR_ADMIN_TOKEN`
4. **Body:** Select `form-data`
5. Add fields:
   - `name` → Text → "Test Category"
   - `slug` → Text → "test-category"
   - `status` → Text → "active"
   - `image` → File → Select an image file
6. Click **Send**

### Using cURL
```bash
curl -X POST http://localhost:5000/api/categories \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -F "name=Test Category" \
  -F "slug=test-category" \
  -F "status=active" \
  -F "image=@/path/to/image.jpg"
```

## Frontend Integration

### React Example (with FormData)
```javascript
const handleSubmit = async (formData, imageFile) => {
  const data = new FormData();
  data.append('name', formData.name);
  data.append('slug', formData.slug);
  data.append('status', formData.status);
  
  if (imageFile) {
    data.append('image', imageFile);
  }
  
  const response = await adminService.createCategory(data);
};
```

## Troubleshooting

### Error: "Must supply cloud_name"
**Solution:** Check that `CLOUDINARY_CLOUD_NAME` is set in your `.env` file.

### Error: "Invalid API Key"
**Solution:** Verify your `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` are correct.

### Error: "File too large"
**Solution:** Image must be under 5MB. Compress the image before uploading.

### Error: "Invalid image format"
**Solution:** Only JPEG, PNG, GIF, and WebP formats are supported.

### Images not showing in frontend
**Solution:** 
1. Check the response from the API - it should return a Cloudinary URL
2. Verify CORS settings in Cloudinary dashboard
3. Check browser console for errors

## Cloudinary Dashboard Features

### View Uploaded Images
1. Go to **Media Library**
2. Browse by folders (`hbs-products`, `hbs-categories`)
3. View image details, transformations, and URLs

### Monitor Usage
1. Go to **Dashboard** → **Usage**
2. Check:
   - Storage usage
   - Bandwidth usage
   - Transformations count

### Free Tier Limits
- **Storage:** 25 GB
- **Bandwidth:** 25 GB/month
- **Transformations:** 25,000/month

## Security Best Practices

1. **Never expose API Secret**
   - Keep it in `.env` file only
   - Add `.env` to `.gitignore`

2. **Use Signed URLs** (Optional - for private images)
   - Configure in Cloudinary dashboard
   - Requires additional code implementation

3. **Restrict Upload Permissions**
   - Only admin users can upload (enforced by `protectAdmin` middleware)
   - Validate file types on backend

4. **Enable Auto-Moderation** (Optional)
   - Cloudinary offers AI-based content moderation
   - Configure in dashboard settings

## Production Recommendations

1. **Use Environment-Specific Folders**
   ```javascript
   const folder = process.env.NODE_ENV === 'production' 
     ? 'prod-hbs-categories' 
     : 'dev-hbs-categories';
   ```

2. **Enable Backup & Versioning**
   - Configure in Cloudinary dashboard
   - Prevents accidental deletions

3. **Set Up CDN**
   - Cloudinary provides automatic CDN delivery
   - No additional configuration needed

4. **Monitor Usage**
   - Set up usage alerts in dashboard
   - Upgrade plan if approaching limits

## Resources

- [Cloudinary Documentation](https://cloudinary.com/documentation)
- [Node.js SDK Guide](https://cloudinary.com/documentation/node_integration)
- [Image Transformations](https://cloudinary.com/documentation/image_transformations)
- [Upload API Reference](https://cloudinary.com/documentation/image_upload_api_reference)

---

**Need Help?**
- Cloudinary Support: support@cloudinary.com
- Community Forum: https://community.cloudinary.com/

