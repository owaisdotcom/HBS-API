import dotenv from 'dotenv';
import Admin from '../models/Admin.js';
import connectDB from '../config/database.js';

dotenv.config();

const createDefaultAdmin = async () => {
  try {
    await connectDB();

    // Check if admin exists
    const existingAdmin = await Admin.findOne({ username: 'admin' });

    if (existingAdmin) {

      process.exit(0);
    }

    // Create default admin
    const admin = await Admin.create({
      username: 'admin',
      password: 'Admin@123',
      name: 'Admin User',
      email: 'admin@hijabsbyshiza.com',
      role: 'super_admin',
      permissions: ['products', 'categories', 'orders', 'users', 'coupons', 'reviews', 'homepage', 'settings']
    });






    process.exit(0);
  } catch (error) {
    console.error('✗ Error creating admin:', error.message);
    process.exit(1);
  }
};

createDefaultAdmin();

