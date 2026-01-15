# Cashfree API Troubleshooting Guide

## Common Issues and Solutions

### 1. Check Backend Console Logs

When you run the curl command, check your backend server console. You should see detailed error logs showing:
- The exact Cashfree API error response
- Request URL and headers
- Request payload

### 2. Verify Environment Variables

Make sure these are set correctly in your `.env` file:

```env
CASHFREE_ENVIRONMENT=TEST
CASHFREE_APP_ID=your_app_id_here
CASHFREE_SECRET_KEY=your_secret_key_here
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:5000
```

**Important:** 
- Remove any quotes around values in `.env`
- No trailing spaces
- Use TEST credentials for TEST environment

### 3. Common API Errors

#### Error 401: Unauthorized
**Cause:** Invalid App ID or Secret Key
**Solution:**
- Double-check credentials in Cashfree dashboard
- Ensure TEST credentials are used for TEST environment
- Verify credentials are correct in `.env` file

#### Error 400: Bad Request
**Cause:** Invalid request format or missing required fields
**Solution:**
- Check backend logs for specific field errors
- Verify order_amount is a valid number
- Ensure customer_email is valid format
- Check order_id is unique

#### Error 500: Internal Server Error
**Cause:** Server-side issue
**Solution:**
- Check backend logs for detailed error
- Verify Cashfree service status
- Check network connectivity

### 4. Test Your Credentials

You can test your Cashfree credentials directly:

```bash
curl -X POST "https://sandbox.cashfree.com/pg/orders" \
  -H "x-client-id: YOUR_APP_ID" \
  -H "x-client-secret: YOUR_SECRET_KEY" \
  -H "x-api-version: 2023-08-01" \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "TEST_ORDER_123",
    "order_amount": 100.00,
    "order_currency": "INR",
    "customer_details": {
      "customer_id": "customer_123",
      "customer_name": "Test User",
      "customer_email": "test@example.com",
      "customer_phone": "9999999999"
    }
  }'
```

### 5. Check Request Format

The API expects:
- `order_amount`: Number (not string), minimum 1.00
- `order_id`: Unique string, alphanumeric
- `customer_email`: Valid email format
- `customer_phone`: 10 digits (numbers only)

### 6. Verify Cart Has Items

Make sure:
- User has items in cart
- Cart total is greater than 0
- All products are valid and in stock

### 7. Check Backend Server Status

Ensure:
- Backend server is running on port 5000
- MongoDB is connected
- No other errors in server logs

## Debugging Steps

1. **Check Backend Logs First**
   - Look for "Cashfree API error details" in console
   - Copy the full error response

2. **Verify Credentials**
   - Login to Cashfree dashboard
   - Go to Developers → API Keys
   - Copy App ID and Secret Key exactly

3. **Test with Minimal Request**
   - Use the curl command above with minimal data
   - See if credentials work at all

4. **Check Network**
   - Ensure backend can reach `sandbox.cashfree.com`
   - Check firewall settings

5. **Verify Order Amount**
   - Order amount must be >= 1.00
   - Must be a number, not string

## Getting Help

If you're still stuck:
1. Copy the full error from backend console
2. Check Cashfree dashboard → API Logs
3. Verify your Cashfree account is active
4. Contact Cashfree support if needed

