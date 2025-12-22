// controllers/profileController.js
const User = require('../models/User');
const { validationResult } = require('express-validator');

const profileController = {
  // ===========================
  // GET USER PROFILE
  // ===========================
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id)
        .select('-password -resetPasswordToken -resetPasswordExpire -resetPasswordOTP -resetPasswordOTPExpire -emailVerificationToken -emailVerificationExpire');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            age: user.age,
            gender: user.gender,
            role: user.role,
            avatar: user.avatar,
            bio: user.bio,
            dateOfBirth: user.dateOfBirth,
            lastLogin: user.lastLogin,
            addresses: user.addresses || [],
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }
        }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // ===========================
  // UPDATE USER PROFILE
  // ===========================
  async updateProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { firstName, lastName, phone, age, gender } = req.body;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      // Update allowed fields
      if (firstName !== undefined) user.firstName = firstName;
      if (lastName !== undefined) user.lastName = lastName;
      if (phone !== undefined) user.phone = phone;
      if (age !== undefined) user.age = age;
      if (gender !== undefined) user.gender = gender;

      await user.save();

      res.json({
        status: 'success',
        message: 'Profile updated successfully',
        data: {
          user: {
            id: user._id,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phone: user.phone,
            age: user.age,
            gender: user.gender,
            role: user.role,
            avatar: user.avatar,
            bio: user.bio,
            dateOfBirth: user.dateOfBirth,
            lastLogin: user.lastLogin,
            addresses: user.addresses || [],
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }
        }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // ===========================
  // GET ALL ADDRESSES
  // ===========================
  async getAddresses(req, res) {
    try {
      const user = await User.findById(req.user.id).select('addresses');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        data: {
          addresses: user.addresses || []
        }
      });
    } catch (error) {
      console.error('Get addresses error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // ===========================
  // ADD NEW ADDRESS
  // ===========================
  async addAddress(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { fullName, phone, street, city, state, zipCode, country, nearbyPlaces, isDefault, addressType } = req.body;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      // If this is set as default, unset all other defaults
      if (isDefault) {
        user.addresses.forEach(addr => {
          addr.isDefault = false;
        });
      }

      const newAddress = {
        fullName,
        phone,
        street,
        city,
        state,
        zipCode,
        country: country || 'India',
        nearbyPlaces: nearbyPlaces || '',
        isDefault: isDefault || false,
        addressType: addressType || 'home'
      };

      user.addresses.push(newAddress);
      await user.save();

      // Get the newly added address (last one in array)
      const addedAddress = user.addresses[user.addresses.length - 1];

      res.status(201).json({
        status: 'success',
        message: 'Address added successfully',
        data: {
          address: addedAddress
        }
      });
    } catch (error) {
      console.error('Add address error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // ===========================
  // UPDATE ADDRESS
  // ===========================
  async updateAddress(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { addressId } = req.params;
      const { fullName, phone, street, city, state, zipCode, country, nearbyPlaces, isDefault, addressType } = req.body;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      const address = user.addresses.id(addressId);
      if (!address) {
        return res.status(404).json({
          status: 'error',
          message: 'Address not found'
        });
      }

      // If setting as default, unset all other defaults
      if (isDefault) {
        user.addresses.forEach(addr => {
          if (addr._id.toString() !== addressId) {
            addr.isDefault = false;
          }
        });
      }

      // Update address fields
      if (fullName !== undefined) address.fullName = fullName;
      if (phone !== undefined) address.phone = phone;
      if (street !== undefined) address.street = street;
      if (city !== undefined) address.city = city;
      if (state !== undefined) address.state = state;
      if (zipCode !== undefined) address.zipCode = zipCode;
      if (country !== undefined) address.country = country;
      if (nearbyPlaces !== undefined) address.nearbyPlaces = nearbyPlaces;
      if (isDefault !== undefined) address.isDefault = isDefault;
      if (addressType !== undefined) address.addressType = addressType;

      await user.save();

      res.json({
        status: 'success',
        message: 'Address updated successfully',
        data: {
          address: address
        }
      });
    } catch (error) {
      console.error('Update address error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // ===========================
  // DELETE ADDRESS
  // ===========================
  async deleteAddress(req, res) {
    try {
      const { addressId } = req.params;
      const user = await User.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      const address = user.addresses.id(addressId);
      if (!address) {
        return res.status(404).json({
          status: 'error',
          message: 'Address not found'
        });
      }

      user.addresses.pull(addressId);
      await user.save();

      res.json({
        status: 'success',
        message: 'Address deleted successfully'
      });
    } catch (error) {
      console.error('Delete address error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: error.message
      });
    }
  }
};

module.exports = profileController;

