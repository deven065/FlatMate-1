import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from parent directory (root of project)
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Razorpay server is running' });
});

// Create Razorpay order
app.post('/api/payment/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Amount should be in smallest currency unit (paise for INR)
    const amountInPaise = Math.round(amount * 100);

    const options = {
      amount: amountInPaise,
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes: notes || {},
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
      },
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      message: error.message,
    });
  }
});

// Verify Razorpay payment signature
app.post('/api/payment/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification parameters',
      });
    }

    // Create signature to verify
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {
      // Fetch payment details from Razorpay
      try {
        const payment = await razorpay.payments.fetch(razorpay_payment_id);
        
        res.json({
          success: true,
          verified: true,
          message: 'Payment verified successfully',
          payment: {
            id: payment.id,
            order_id: payment.order_id,
            amount: payment.amount / 100, // Convert back to rupees
            currency: payment.currency,
            status: payment.status,
            method: payment.method,
            email: payment.email,
            contact: payment.contact,
            created_at: payment.created_at,
          },
        });
      } catch (fetchError) {
        console.error('Error fetching payment details:', fetchError);
        res.json({
          success: true,
          verified: true,
          message: 'Payment verified successfully (details fetch failed)',
        });
      }
    } else {
      res.status(400).json({
        success: false,
        verified: false,
        error: 'Payment verification failed',
      });
    }
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      error: 'Payment verification error',
      message: error.message,
    });
  }
});

// Fetch payment details by payment ID
app.get('/api/payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await razorpay.payments.fetch(paymentId);

    res.json({
      success: true,
      payment: {
        id: payment.id,
        order_id: payment.order_id,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        email: payment.email,
        contact: payment.contact,
        created_at: payment.created_at,
      },
    });
  } catch (error) {
    console.error('Error fetching payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payment details',
      message: error.message,
    });
  }
});

// Handle Razorpay webhooks (optional but recommended for production)
app.post('/api/payment/webhook', (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (webhookSecret) {
      const body = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');

      if (webhookSignature !== expectedSignature) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }
    }

    const event = req.body.event;
    const paymentEntity = req.body.payload.payment.entity;

    console.log('Webhook received:', event);
    console.log('Payment ID:', paymentEntity.id);

    // Handle different webhook events
    switch (event) {
      case 'payment.authorized':
        console.log('Payment authorized:', paymentEntity.id);
        break;
      case 'payment.captured':
        console.log('Payment captured:', paymentEntity.id);
        break;
      case 'payment.failed':
        console.log('Payment failed:', paymentEntity.id);
        break;
      default:
        console.log('Unhandled event:', event);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Razorpay server running on http://localhost:${PORT}`);
  console.log(`📡 API endpoints:`);
  console.log(`   - POST /api/payment/create-order`);
  console.log(`   - POST /api/payment/verify`);
  console.log(`   - GET  /api/payment/:paymentId`);
  console.log(`   - POST /api/payment/webhook`);
});

export default app;
