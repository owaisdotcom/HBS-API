# Setup Super Admin API

## Endpoint

**POST** `/api/admin/setup`

Creates the first super admin account. This endpoint is **PUBLIC** and only works when **NO admins exist** in the database.

---

## ⚠️ Important Security Notes

1. **One-Time Use**: This endpoint only works when the database has ZERO admins
2. **Public Access**: No authentication required for the first setup
3. **Auto-Disabled**: After first admin is created, this endpoint returns 403 error
4. **Super Admin**: Automatically creates with full permissions

---

## Request Body

```json
{
  "username": "admin",
  "email": "admin@hijabsbyshiza.com",
  "password": "Admin@123",
  "name": "Super Admin"
}
```

### Required Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | Unique username (3-30 chars, alphanumeric + underscore) |
| `email` | string | Yes | Valid email address |
| `password` | string | Yes | Password (min 6 characters) |
| `name` | string | Yes | Admin's full name (2-50 chars) |

**Note:** Role and permissions are automatically set to super_admin with full permissions.

---

## Response

### Success (201 Created)

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "admin": {
      "id": "6789abcd1234ef5678901234",
      "username": "admin",
      "email": "admin@hijabsbyshiza.com",
      "name": "Super Admin",
      "role": "super_admin",
      "permissions": [
        "products",
        "categories",
        "orders",
        "users",
        "coupons",
        "reviews",
        "homepage",
        "settings"
      ]
    }
  },
  "message": "Super admin created successfully"
}
```

### Error Responses

#### 403 - Setup Already Completed
```json
{
  "success": false,
  "message": "Setup already completed. Admins already exist. Use /admin/register with authentication."
}
```

This means at least one admin already exists in the database.

#### 400 - Validation Error
```json
{
  "success": false,
  "message": "Username is required"
}
```

---

## cURL Example

```bash
curl -X POST http://localhost:5000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@hijabsbyshiza.com",
    "password": "Admin@123",
    "name": "Super Admin"
  }'
```

---

## Postman/Thunder Client

### Request
- **Method:** POST
- **URL:** `http://localhost:5000/api/admin/setup`
- **Headers:**
  - `Content-Type: application/json`
- **Body (raw JSON):**
```json
{
  "username": "admin",
  "email": "admin@hijabsbyshiza.com",
  "password": "Admin@123",
  "name": "Super Admin"
}
```

---

## JavaScript/Fetch Example

```javascript
const setupSuperAdmin = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/admin/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'admin',
        email: 'admin@hijabsbyshiza.com',
        password: 'Admin@123',
        name: 'Super Admin'
      })
    });

    const data = await response.json();
    
    if (data.success) {



      
      // Save token for future use
      localStorage.setItem('adminToken', data.data.token);
    } else {
      console.error('Error:', data.message);
    }
  } catch (error) {
    console.error('Request failed:', error);
  }
};

setupSuperAdmin();
```

---

## Axios Example

```javascript
import axios from 'axios';

const setupSuperAdmin = async () => {
  try {
    const response = await axios.post('http://localhost:5000/api/admin/setup', {
      username: 'admin',
      email: 'admin@hijabsbyshiza.com',
      password: 'Admin@123',
      name: 'Super Admin'
    });


    return response.data;
  } catch (error) {
    if (error.response?.status === 403) {

    } else {
      console.error('Error:', error.response?.data || error.message);
    }
  }
};

setupSuperAdmin();
```

---

## Step-by-Step Setup Guide

### 1. Start Your Backend

```bash
cd HBS-API
npm run dev
```

### 2. Check if Setup is Needed

Try to login first. If no admin exists, you'll get an error.

### 3. Run Setup Command

**Option A: Using cURL**
```bash
curl -X POST http://localhost:5000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "email": "admin@hijabsbyshiza.com",
    "password": "Admin@123",
    "name": "Super Admin"
  }'
```

**Option B: Using Postman**
1. Create new POST request
2. URL: `http://localhost:5000/api/admin/setup`
3. Body → raw → JSON
4. Paste the JSON above
5. Click Send

**Option C: Using Node.js Script**

Create `setupAdmin.js`:
```javascript
import axios from 'axios';

const setup = async () => {
  try {
    const { data } = await axios.post('http://localhost:5000/api/admin/setup', {
      username: 'admin',
      email: 'admin@hijabsbyshiza.com',
      password: 'Admin@123',
      name: 'Super Admin'
    });
    


  } catch (error) {
    console.error('✗ Error:', error.response?.data?.message || error.message);
  }
};

setup();
```

Run: `node setupAdmin.js`

### 4. Verify Setup

Login at: `http://localhost:5173/admin/login`
- Email: `admin@hijabsbyshiza.com`
- Password: `Admin@123`

---

## What Happens Internally

1. **Check Admin Count**: `await Admin.countDocuments()`
2. **If count > 0**: Return 403 error
3. **If count === 0**: Create new admin with:
   - Role: `super_admin`
   - Permissions: ALL permissions
   - Status: `active`
4. **Hash Password**: Automatically with bcrypt (12 rounds)
5. **Generate JWT Token**: For immediate use
6. **Return**: Token + Admin data

---

## Security Features

✅ **One-Time Use**: Automatically disabled after first admin  
✅ **Password Hashing**: bcrypt with 12 rounds  
✅ **Email Validation**: Valid email format required  
✅ **Username Validation**: Alphanumeric + underscore only  
✅ **JWT Token**: Secure token generation  
✅ **Full Permissions**: All features accessible  

---

## Comparison: Setup vs Seed Script

| Feature | `/api/admin/setup` (API) | `npm run seed:admin` (Script) |
|---------|-------------------------|-------------------------------|
| **Method** | HTTP API Call | Command line |
| **Access** | Remote/Postman/Frontend | Local only |
| **Flexibility** | Custom data | Fixed data |
| **Authentication** | None needed | None needed |
| **Use Case** | Production setup | Development |

---

## Production Deployment

For production, consider:

1. **Disable After Setup**: Add feature flag to completely disable this endpoint
2. **Environment Variable**: Check `ALLOW_SETUP=true` before allowing
3. **IP Whitelist**: Only allow from specific IPs
4. **Delete Endpoint**: Remove route after first deploy

### Example Production Config

```javascript
// In admin.routes.js
if (process.env.ALLOW_SETUP === 'true') {
  router.post('/setup', setupSuperAdminValidator, validate, setupSuperAdmin);
}
```

Then in `.env`:
```env
ALLOW_SETUP=true  # Set to false after first admin is created
```

---

## Troubleshooting

### Issue 1: "Setup already completed"
**Solution:** An admin already exists. Use login or create new admins via `/api/admin/register`

To check:
```javascript
// In MongoDB shell or Compass
db.admins.countDocuments()
```

To reset (⚠️ DANGER - deletes all admins):
```javascript
db.admins.deleteMany({})
```

### Issue 2: "Username already exists"
**Solution:** This shouldn't happen on first setup. Check if admins collection has data.

### Issue 3: Endpoint returns 404
**Solution:** 
1. Ensure backend is running
2. Check route is correct: `/api/admin/setup` (not `/admin/setup`)
3. Verify routes are loaded in `src/routes/index.js`

---

## Related Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/admin/setup` | Create first super admin | No |
| POST | `/api/admin/login` | Admin login | No |
| POST | `/api/admin/register` | Create additional admins | Yes |
| GET | `/api/admin/profile` | Get admin profile | Yes |

---

## Quick Test

```bash
# 1. Setup super admin
curl -X POST http://localhost:5000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","email":"admin@hijabsbyshiza.com","password":"Admin@123","name":"Super Admin"}'

# 2. Try setup again (should fail)
curl -X POST http://localhost:5000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"username":"admin2","email":"admin2@hijabsbyshiza.com","password":"Admin@123","name":"Admin 2"}'

# 3. Login with created admin
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hijabsbyshiza.com","password":"Admin@123"}'
```

---

**Created:** January 10, 2026  
**Status:** Production Ready  
**Authentication:** Not Required (Public)  
**One-Time Use:** Yes (Disabled after first admin exists)


