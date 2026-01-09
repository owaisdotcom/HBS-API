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
      console.log('✓ Default admin already exists');
      process.exit(0);
    }

    // Create default admin
    const admin = await Admin.create({
      username: 'admin',
      password: 'admin123',
      name: 'Super Admin',
      email: 'admin@hijabsbyshiza.com',
      role: 'super_admin',
      permissions: ['products', 'categories', 'orders', 'users', 'coupons', 'reviews', 'homepage', 'settings']
    });

    console.log('✓ Default admin created successfully');
    console.log('  Username: admin');
    console.log('  Password: admin123');
    console.log('  ⚠️  Please change this password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('✗ Error creating admin:', error.message);
    process.exit(1);
  }
};

createDefaultAdmin();

