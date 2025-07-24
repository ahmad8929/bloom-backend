


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
    const electronics = new Category({
      name: 'Electronics',
      description: 'Electronic devices and gadgets'
    });
    await electronics.save();

    const clothing = new Category({
      name: 'Clothing',
      description: 'Fashion and apparel'
    });
    await clothing.save();

    // Create sample products
    const sampleProducts = [
      {
        name: 'Smartphone',
        description: 'Latest smartphone with advanced features',
        price: 699.99,
        category: electronics._id,
        sku: 'PHONE001',
        quantity: 50,
        images: [{
          url: 'https://via.placeholder.com/400x400',
          isPrimary: true
        }]
      },
      {
        name: 'T-Shirt',
        description: 'Comfortable cotton t-shirt',
        price: 29.99,
        category: clothing._id,
        sku: 'SHIRT001',
        quantity: 100,
        images: [{
          url: 'https://via.placeholder.com/400x400',
          isPrimary: true
        }]
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