


// scripts/seedData.js - Sample data seeder
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await User.deleteMany({});
    await Category.deleteMany({});
    await Product.deleteMany({});

    // Create admin user
    const adminUser = new User({
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      password: 'admin123',
      role: 'admin',
      isEmailVerified: true
    });
    await adminUser.save();

    // Create sample categories
    const categories = [
      { name: 'Saree', description: 'Traditional Indian attire' },
      { name: 'Kurti', description: 'Comfortable and stylish kurtis' },
      { name: 'Western Dress', description: 'Modern and trendy western dresses' },
      { name: 'Jeans', description: 'Durable and fashionable jeans' },
      { name: 'Top', description: 'Variety of tops for every occasion' },
      { name: 'Skirts', description: 'Elegant and casual skirts' },
      { name: 'Others', description: 'Other miscellaneous items' }
    ];

    const createdCategories = await Category.insertMany(categories);
    console.log('Categories seeded');

    // Create sample products
    const sampleProducts = [
      {
        name: 'Classic Saree',
        description: 'A beautiful classic saree.',
        price: 1999.99,
        category: createdCategories.find(c => c.name === 'Saree')._id,
        sizes: [{ size: 'M', quantity: 10 }],
        images: [{ url: 'https://via.placeholder.com/400x400', isPrimary: true }]
      },
      {
        name: 'Designer Kurti',
        description: 'A stylish designer kurti.',
        price: 799.99,
        category: createdCategories.find(c => c.name === 'Kurti')._id,
        sizes: [{ size: 'L', quantity: 20 }],
        images: [{ url: 'https://via.placeholder.com/400x400', isPrimary: true }]
      }
    ];

    await Product.insertMany(sampleProducts);

    console.log('Sample data seeded successfully!');
    console.log('Admin login: admin@example.com / admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('Seed data error:', error);
    process.exit(1);
  }
};

seedData();
