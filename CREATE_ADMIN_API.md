# Create Admin API

## Endpoint

**POST** `/api/admin/register`

Creates a new admin user. Requires authentication (must be logged in as an admin).

---

## Authentication Required

Include the admin JWT token in the Authorization header:
```
Authorization: Bearer <admin_token>
```

---

## Request Body

```json
{
  "username": "newadmin",
  "email": "newadmin@hijabsbyshiza.com",
  "password": "SecurePass@123",
  "name": "New Admin User",
  "role": "admin",
  "permissions": ["products", "categories", "orders"]
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `username` | string | Yes | Unique username (3-30 chars, alphanumeric + underscore) |
| `email` | string | Yes | Unique email address |
| `password` | string | Yes | Password (min 6 characters) |
| `name` | string | Yes | Admin's full name (2-50 chars) |
| `role` | string | No | Either `admin` or `super_admin` (default: `admin`) |
| `permissions` | array | No | Array of permission strings (default: basic permissions) |

### Available Permissions
- `products` - Manage products
- `categories` - Manage categories
- `orders` - Manage orders
- `users` - Manage users
- `coupons` - Manage coupons
- `reviews` - Manage reviews
- `homepage` - Manage homepage
- `settings` - Manage settings

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
      "username": "newadmin",
      "email": "newadmin@hijabsbyshiza.com",
      "name": "New Admin User",
      "role": "admin",
      "permissions": ["products", "categories", "orders"]
    }
  },
  "message": "Admin created successfully"
}
```

### Error Responses

#### 400 - Validation Error
```json
{
  "success": false,
  "message": "Username is required"
}
```

#### 400 - Admin Already Exists
```json
{
  "success": false,
  "message": "Admin with this email or username already exists"
}
```

#### 401 - Unauthorized
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

---

## cURL Example

```bash
curl -X POST http://localhost:5000/api/admin/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -d '{
    "username": "manager",
    "email": "manager@hijabsbyshiza.com",
    "password": "Manager@123",
    "name": "Store Manager",
    "role": "admin",
    "permissions": ["products", "categories", "orders", "coupons"]
  }'
```

---

## JavaScript/Axios Example

```javascript
import axios from 'axios';

const createAdmin = async (adminData, token) => {
  try {
    const response = await axios.post(
      'http://localhost:5000/api/admin/register',
      {
        username: adminData.username,
        email: adminData.email,
        password: adminData.password,
        name: adminData.name,
        role: adminData.role || 'admin',
        permissions: adminData.permissions || ['products', 'orders']
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Admin created:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error creating admin:', error.response?.data);
    throw error;
  }
};

// Usage
const token = localStorage.getItem('adminToken');
createAdmin({
  username: 'manager',
  email: 'manager@hijabsbyshiza.com',
  password: 'Manager@123',
  name: 'Store Manager',
  role: 'admin',
  permissions: ['products', 'categories', 'orders']
}, token);
```

---

## Testing Steps

### 1. First, login as admin to get token

```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hijabsbyshiza.com",
    "password": "Admin@123"
  }'
```

Copy the `token` from the response.

### 2. Create new admin using the token

```bash
curl -X POST http://localhost:5000/api/admin/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <paste_token_here>" \
  -d '{
    "username": "testadmin",
    "email": "test@hijabsbyshiza.com",
    "password": "Test@123",
    "name": "Test Admin"
  }'
```

---

## Frontend Integration

### Update adminService.js

Add this method to your `src/services/adminService.js`:

```javascript
/**
 * Create New Admin
 * @param {object} adminData
 * @returns {Promise<{admin: object}>}
 */
async createNewAdmin(adminData) {
  const response = await adminApi.post('/admin/register', adminData);
  return response.data;
}
```

### Usage in Admin Panel

```javascript
import { adminService } from '../../services';
import toast from 'react-hot-toast';

const handleCreateAdmin = async (formData) => {
  try {
    const { admin } = await adminService.createNewAdmin({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      name: formData.name,
      role: formData.role,
      permissions: formData.permissions
    });
    
    toast.success('Admin created successfully!');
    console.log('New admin:', admin);
  } catch (error) {
    toast.error(error.message || 'Failed to create admin');
  }
};
```

---

## Security Notes

1. **Authentication Required**: Must be logged in as admin
2. **Token-based**: Uses JWT for authentication
3. **Password Hashing**: Passwords are automatically hashed with bcrypt (12 rounds)
4. **Unique Constraints**: Email and username must be unique
5. **Role-based Access**: Consider adding super_admin check for production

---

## Related Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/profile` | Get admin profile |
| PUT | `/api/admin/password` | Change password |

---

**Created:** January 10, 2026  
**Status:** Ready to use  
**Authentication:** Required (Bearer Token)


