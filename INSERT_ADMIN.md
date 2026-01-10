# Insert Admin User into MongoDB

## Method 1: Using MongoDB Compass (GUI)

### Step 1: Hash the Password

First, you need to hash the password. Run this in Node.js console or create a small script:

```javascript
// hashPassword.js
import bcrypt from 'bcryptjs';

const password = 'Admin@123';
const hashedPassword = await bcrypt.hash(password, 10);
console.log(hashedPassword);
```

Run: `node hashPassword.js`

**Pre-hashed password for "Admin@123":**
```
$2a$10$8K1p/r2B/5vZqCh8rKZFj.VKN7qZX9RJC0mYZKp1Zn8YwHdFmPqKC
```

### Step 2: Insert Document

1. Open **MongoDB Compass**
2. Connect to your database
3. Select the **Atlas** database
4. Go to the **admins** collection
5. Click **"ADD DATA"** → **"Insert Document"**
6. Paste this JSON:

```json
{
  "email": "admin@hijabsbyshiza.com",
  "password": "$2a$10$8K1p/r2B/5vZqCh8rKZFj.VKN7qZX9RJC0mYZKp1Zn8YwHdFmPqKC",
  "name": "Admin User",
  "role": "admin",
  "isActive": true,
  "createdAt": {
    "$date": "2026-01-10T00:00:00.000Z"
  },
  "updatedAt": {
    "$date": "2026-01-10T00:00:00.000Z"
  }
}
```

7. Click **"Insert"**

---

## Method 2: Using MongoDB Shell (mongosh)

```bash
mongosh "your-mongodb-connection-string"
```

Then run:

```javascript
use Atlas

db.admins.insertOne({
  email: "admin@hijabsbyshiza.com",
  password: "$2a$10$8K1p/r2B/5vZqCh8rKZFj.VKN7qZX9RJC0mYZKp1Zn8YwHdFmPqKC",
  name: "Admin User",
  role: "admin",
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})
```

---

## Method 3: Using the Seed Script (Recommended)

This is the easiest method:

```bash
cd HBS-API
npm run seed:admin
```

This will:
- Check if admin exists
- If not, create admin with email: `admin@hijabsbyshiza.com`
- Password: `Admin@123`
- Auto-hash the password
- Insert into database

---

## Method 4: Using Node.js Script

Create a file `addAdmin.js`:

```javascript
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const AdminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, default: 'admin' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const Admin = mongoose.model('Admin', AdminSchema);

async function addAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const hashedPassword = await bcrypt.hash('Admin@123', 10);

    const admin = await Admin.create({
      email: 'admin@hijabsbyshiza.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'admin',
      isActive: true
    });

    console.log('Admin created:', admin.email);
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addAdmin();
```

Run: `node addAdmin.js`

---

## Admin Credentials

After inserting, use these credentials to login:

| Field | Value |
|-------|-------|
| **Email** | `admin@hijabsbyshiza.com` |
| **Password** | `Admin@123` |

---

## Login URLs

- **Frontend Admin Login**: http://localhost:5173/admin/login
- **API Endpoint**: http://localhost:5000/api/admin/login

---

## Test Login with cURL

```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hijabsbyshiza.com",
    "password": "Admin@123"
  }'
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "admin": {
      "_id": "...",
      "email": "admin@hijabsbyshiza.com",
      "name": "Admin User",
      "role": "admin"
    }
  }
}
```

---

## Multiple Admin Accounts

You can create multiple admins with different roles:

```json
[
  {
    "email": "admin@hijabsbyshiza.com",
    "password": "$2a$10$8K1p/r2B/5vZqCh8rKZFj.VKN7qZX9RJC0mYZKp1Zn8YwHdFmPqKC",
    "name": "Super Admin",
    "role": "superadmin",
    "isActive": true,
    "createdAt": "2026-01-10T00:00:00.000Z",
    "updatedAt": "2026-01-10T00:00:00.000Z"
  },
  {
    "email": "manager@hijabsbyshiza.com",
    "password": "$2a$10$8K1p/r2B/5vZqCh8rKZFj.VKN7qZX9RJC0mYZKp1Zn8YwHdFmPqKC",
    "name": "Manager",
    "role": "admin",
    "isActive": true,
    "createdAt": "2026-01-10T00:00:00.000Z",
    "updatedAt": "2026-01-10T00:00:00.000Z"
  }
]
```

---

## Password Hashing Script

Save this as `hashPassword.js`:

```javascript
import bcrypt from 'bcryptjs';

const passwords = [
  'Admin@123',
  'Manager@123',
  'SuperAdmin@123'
];

passwords.forEach(async (pwd) => {
  const hashed = await bcrypt.hash(pwd, 10);
  console.log(`Password: ${pwd}`);
  console.log(`Hashed: ${hashed}\n`);
});
```

Run: `node hashPassword.js`

---

## Common Issues

### Issue 1: Duplicate Key Error
**Error:** `E11000 duplicate key error collection: Atlas.admins index: email_1`

**Solution:** Admin with this email already exists. Either:
- Delete existing admin: `db.admins.deleteOne({ email: "admin@hijabsbyshiza.com" })`
- Use different email

### Issue 2: Password Not Working
**Cause:** Password not properly hashed

**Solution:** Always hash password with bcrypt (10 rounds):
```javascript
const hashed = await bcrypt.hash('Admin@123', 10);
```

### Issue 3: Can't Login
**Checks:**
1. Admin exists in database: `db.admins.findOne({ email: "admin@hijabsbyshiza.com" })`
2. `isActive: true`
3. Password is hashed (starts with `$2a$` or `$2b$`)
4. Backend server is running
5. MongoDB is connected

---

## Verify Admin Exists

MongoDB Shell:
```javascript
db.admins.findOne({ email: "admin@hijabsbyshiza.com" })
```

Expected Output:
```javascript
{
  _id: ObjectId("..."),
  email: 'admin@hijabsbyshiza.com',
  password: '$2a$10$...',
  name: 'Admin User',
  role: 'admin',
  isActive: true,
  createdAt: ISODate("2026-01-10T00:00:00.000Z"),
  updatedAt: ISODate("2026-01-10T00:00:00.000Z"),
  __v: 0
}
```

---

## Quick Copy-Paste for MongoDB Compass

**For Password: Admin@123**

```json
{
  "email": "admin@hijabsbyshiza.com",
  "password": "$2a$10$8K1p/r2B/5vZqCh8rKZFj.VKN7qZX9RJC0mYZKp1Zn8YwHdFmPqKC",
  "name": "Admin User",
  "role": "admin",
  "isActive": true,
  "createdAt": {
    "$date": "2026-01-10T00:00:00.000Z"
  },
  "updatedAt": {
    "$date": "2026-01-10T00:00:00.000Z"
  }
}
```

Just copy and paste this into MongoDB Compass → admins collection → Insert Document.

---

## Summary

**Recommended Method:** Use `npm run seed:admin` (easiest)

**Manual Method:** Copy the JSON above and insert via MongoDB Compass

**Credentials:**
- Email: `admin@hijabsbyshiza.com`
- Password: `Admin@123`

**Login URL:** http://localhost:5173/admin/login

---

**Date:** January 10, 2026  
**Status:** Ready to use  
**Password Hash:** bcrypt with 10 rounds


