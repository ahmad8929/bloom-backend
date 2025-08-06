// scripts/checkUsers.js - Run this script to debug your database
const mongoose = require('mongoose');
const User = require('../models/User');

async function checkUsers() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your-db-name');
    
    console.log('Connected to database');
    
    // Get all users
    const allUsers = await User.find({}).select('-password');
    
    console.log('\n=== ALL USERS IN DATABASE ===');
    console.log(`Total users: ${allUsers.length}\n`);
    
    allUsers.forEach((user, index) => {
      console.log(`${index + 1}. User Details:`);
      console.log(`   ID: ${user._id}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Email Verified: ${user.isEmailVerified}`);
      console.log(`   Active: ${user.isActive}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log(`   Last Login: ${user.lastLogin || 'Never'}`);
      console.log('   ---');
    });
    
    // Check specific filters
    console.log('\n=== FILTER TESTS ===');
    
    const userRoleOnly = await User.find({ role: 'user' });
    console.log(`Users with role 'user': ${userRoleOnly.length}`);
    
    const adminRoleOnly = await User.find({ role: 'admin' });
    console.log(`Users with role 'admin': ${adminRoleOnly.length}`);
    
    const verifiedUsers = await User.find({ isEmailVerified: true });
    console.log(`Verified users: ${verifiedUsers.length}`);
    
    const unverifiedUsers = await User.find({ isEmailVerified: false });
    console.log(`Unverified users: ${unverifiedUsers.length}`);
    
    const activeUsers = await User.find({ isActive: true });
    console.log(`Active users: ${activeUsers.length}`);
    
    const inactiveUsers = await User.find({ isActive: false });
    console.log(`Inactive users: ${inactiveUsers.length}`);
    
    // Test the exact same query as the controller
    console.log('\n=== CONTROLLER QUERY TEST ===');
    const filter = {}; // No role filter
    const customers = await User.find(filter)
      .select('-password -resetPasswordToken -resetPasswordOTP -emailVerificationToken')
      .sort('-createdAt')
      .limit(20)
      .lean();
      
    console.log(`Controller query returned: ${customers.length} users`);
    customers.forEach((customer, index) => {
      console.log(`${index + 1}. ${customer.firstName} ${customer.lastName} (${customer.role})`);
    });
    
  } catch (error) {
    console.error('Error checking users:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from database');
  }
}

// Run the check
checkUsers();

// Usage: node scripts/checkUsers.js