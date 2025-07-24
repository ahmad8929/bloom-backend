require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function updateUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Update all existing users with new default values
    const result = await User.updateMany(
      {},
      {
        $set: {
          isEmailVerified: false,
          isActive: true,
          loginAttempts: 0
        }
      }
    );

    console.log(`Updated ${result.modifiedCount} users`);
    process.exit(0);
  } catch (error) {
    console.error('Error updating users:', error);
    process.exit(1);
  }
}

updateUsers(); 