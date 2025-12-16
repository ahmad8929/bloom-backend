
# eCommerce Backend API

A comprehensive eCommerce backend built with Node.js, Express, and MongoDB.

## Features

- **Authentication & Authorization**
  - JWT-based authentication
  - Role-based access control (User, Admin, Super Admin)
  - Password reset & email verification
  - Account lockout protection

- **Product Management**
  - CRUD operations
  - Image uploads with Cloudinary
  - Inventory tracking
  - Categories & subcategories
  - Search & filtering

- **Shopping Cart & Wishlist**
  - Add/remove/update items
  - Coupon system
  - Real-time price calculations

- **Order Management**
  - Order placement & tracking
  - Payment integration (Stripe)
  - Order status updates
  - Email notifications

- **Admin Panel**
  - Dashboard with analytics
  - User management
  - Product & category management
  - Order management
  - Sales analytics

## Installation

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure
4. Seed sample data: `npm run seed`
5. Start development server: `npm run dev`

## API Endpoints

### Authentication
- POST `/api/auth/signup` - Register new user
- POST `/api/auth/login` - User login
- POST `/api/auth/logout` - User logout
- POST `/api/auth/forgot-password` - Request password reset
- POST `/api/auth/reset-password/:token` - Reset password

### Products
- GET `/api/products` - Get all products
- GET `/api/products/:id` - Get single product
- POST `/api/products` - Create product (Admin)
- PUT `/api/products/:id` - Update product (Admin)
- DELETE `/api/products/:id` - Delete product (Admin)

### Cart
- GET `/api/cart` - Get user's cart
- POST `/api/cart/add` - Add item to cart
- PUT `/api/cart/update/:itemId` - Update cart item
- DELETE `/api/cart/remove/:itemId` - Remove from cart

### Orders
- GET `/api/orders` - Get user's orders
- POST `/api/orders/create` - Create new order
- GET `/api/orders/:id` - Get order details
- POST `/api/orders/:id/cancel` - Cancel order

### Admin
- GET `/api/admin/dashboard` - Dashboard stats
- GET `/api/admin/users` - Manage users
- GET `/api/admin/orders/stats` - Order statistics

## Security Features

- Helmet for security headers
- Rate limiting
- Input sanitization
- XSS protection
- CORS configuration
- MongoDB injection prevention

## Technologies Used

- Node.js & Express
- MongoDB & Mongoose
- JWT for authentication
- Bcrypt for password hashing
- Multer & Cloudinary for file uploads
- Stripe for payments
- Nodemailer for emails
- Express-validator for validation

## Environment Variables

```
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/ecommerce
JWT_SECRET=your-jwt-secret
CLOUDINARY_NAME=your-cloudinary-name
STRIPE_SECRET_KEY=your-stripe-secret
SMTP_HOST=your-smtp-host
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
*/
