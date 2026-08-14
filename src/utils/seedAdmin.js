import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Admin from '../models/Admin.js';

dotenv.config();

const STRONG_ADMIN_PASSWORD = process.env.NEW_ADMIN_PASSWORD || 'HBS#SecureAdmin2026!x9';
const PROD_MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hijabsbyshiza_db_user:Pyn5YNLw8bByOjmn@cluster0.zxhf3dj.mongodb.net/hbs-prod?retryWrites=true&w=majority';

const updateProductionAdminPassword = async () => {
  try {
    console.log('Connecting to Production MongoDB Database...');
    await mongoose.connect(PROD_MONGODB_URI, {
      retryWrites: true
    });
    console.log('Connected to Production Database successfully.');

    let admin = await Admin.findOne({ username: 'admin' });

    if (admin) {
      admin.password = STRONG_ADMIN_PASSWORD;
      admin.role = 'super_admin';
      admin.status = 'active';
      admin.permissions = ['products', 'categories', 'orders', 'users', 'coupons', 'reviews', 'homepage', 'settings'];
      await admin.save();
      console.log('✓ Production Admin user password updated successfully to strong password!');
    } else {
      admin = await Admin.create({
        username: 'admin',
        password: STRONG_ADMIN_PASSWORD,
        name: 'Admin User',
        email: 'admin@hijabsbyshiza.com',
        role: 'super_admin',
        status: 'active',
        permissions: ['products', 'categories', 'orders', 'users', 'coupons', 'reviews', 'homepage', 'settings']
      });
      console.log('✓ Production Super Admin created successfully with strong password!');
    }

    console.log(`-------------------------------------------`);
    console.log(` Production Admin Credentials:`);
    console.log(` Username: admin`);
    console.log(` Password: ${STRONG_ADMIN_PASSWORD}`);
    console.log(` Role: super_admin`);
    console.log(` Database: ${mongoose.connection.name}`);
    console.log(`-------------------------------------------`);

    process.exit(0);
  } catch (error) {
    console.error('✗ Error updating production admin:', error.message);
    process.exit(1);
  }
};

updateProductionAdminPassword();
