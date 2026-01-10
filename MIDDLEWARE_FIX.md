# Middleware Order Fix

## Issue

Error when calling `/api/admin/login`:
```
Cannot set property query of #<IncomingMessage> which has only a getter
```

**Cause:** `express-mongo-sanitize` middleware was placed BEFORE body parsing middleware, causing it to try to modify read-only request properties.

---

## Solution

### 1. Reordered Middleware

**Before:**
```javascript
app.use(cors(...));
app.use(mongoSanitize());
app.use(express.json());
```

**After:**
```javascript
app.use(cors(...));
app.use(express.json());           // Body parsing FIRST
app.use(express.urlencoded(...));  // Body parsing FIRST
app.use(mongoSanitize({...}));     // Sanitization AFTER
```

### 2. Added Configuration

```javascript
app.use(mongoSanitize({
  replaceWith: '_',               // Replace $ and . with _
  onSanitize: ({ req, key }) => {
    console.warn(`Sanitized key: ${key} in request`);
  }
}));
```

---

## Why This Order Matters

1. **CORS** - Must be first to handle preflight requests
2. **Body Parsing** - Must parse request body into `req.body`
3. **Sanitization** - Can only sanitize AFTER body is parsed
4. **Rate Limiting** - After sanitization, before routes
5. **Routes** - Handle actual requests
6. **Error Handler** - Must be last

---

## Correct Middleware Order

```javascript
// 1. CORS
app.use(cors());

// 2. Body Parsing
app.use(express.json());
app.use(express.urlencoded());

// 3. Security (sanitization)
app.use(mongoSanitize());
app.use(xssClean());

// 4. Compression
app.use(compression());

// 5. Logging
app.use(morgan());

// 6. Rate Limiting
app.use(limiter);

// 7. Routes
app.use('/api', routes);

// 8. Error Handler (LAST)
app.use(errorHandler);
```

---

## What mongoSanitize Does

Prevents NoSQL injection by sanitizing user input:

**Attack Example:**
```javascript
// Malicious input
{
  "email": { "$gt": "" },
  "password": { "$gt": "" }
}

// After sanitization (with replaceWith: '_')
{
  "email": { "_gt": "" },
  "password": { "_gt": "" }
}
```

This prevents MongoDB operators (`$gt`, `$ne`, `$where`, etc.) from being injected.

---

## Testing

Test the admin login:

```bash
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@hijabsbyshiza.com",
    "password": "Admin@123"
  }'
```

Expected: 200 OK with token
```json
{
  "success": true,
  "data": {
    "token": "eyJhbG...",
    "admin": { ... }
  }
}
```

---

## Status

✅ Fixed  
✅ Middleware reordered  
✅ Configuration updated  
✅ Ready to test

---

**Date:** January 10, 2026  
**Issue:** Middleware order causing read-only property error  
**Resolution:** Reordered middleware, placed body parsing before sanitization


