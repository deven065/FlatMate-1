// Razorpay API utilities
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

/**
 * Load Razorpay checkout script dynamically
 * @returns {Promise<boolean>}
 */
export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

/**
 * Create a Razorpay order
 * @param {Object} orderData - Order details
 * @param {number} orderData.amount - Amount in INR (rupees)
 * @param {string} orderData.currency - Currency code (default: INR)
 * @param {string} orderData.receipt - Receipt ID
 * @param {Object} orderData.notes - Additional notes
 * @returns {Promise<Object>}
 */
export const createRazorpayOrder = async (orderData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/payment/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Server response:', errorText);
      throw new Error(`Failed to create order: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.success || !data.order) {
      throw new Error(data.error || 'Invalid order response from server');
    }

    return data.order;
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    throw new Error(error.message || 'Failed to connect to payment server. Please ensure the backend server is running.');
  }
};

/**
 * Verify Razorpay payment signature
 * @param {Object} verificationData
 * @param {string} verificationData.razorpay_order_id
 * @param {string} verificationData.razorpay_payment_id
 * @param {string} verificationData.razorpay_signature
 * @returns {Promise<Object>}
 */
export const verifyRazorpayPayment = async (verificationData) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/payment/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verificationData),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Payment verification failed');
    }

    return data;
  } catch (error) {
    console.error('Error verifying payment:', error);
    throw error;
  }
};

/**
 * Fetch payment details
 * @param {string} paymentId - Razorpay payment ID
 * @returns {Promise<Object>}
 */
export const getPaymentDetails = async (paymentId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/payment/${paymentId}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to fetch payment details');
    }

    return data.payment;
  } catch (error) {
    console.error('Error fetching payment details:', error);
    throw error;
  }
};

/**
 * Open Razorpay checkout
 * @param {Object} options - Razorpay checkout options
 * @returns {Promise<Object>}
 */
export const openRazorpayCheckout = (options) => {
  return new Promise((resolve, reject) => {
    if (!window.Razorpay) {
      reject(new Error('Razorpay SDK not loaded'));
      return;
    }

    const razorpay = new window.Razorpay({
      ...options,
      handler: (response) => {
        resolve(response);
      },
      modal: {
        ondismiss: () => {
          reject(new Error('Payment cancelled by user'));
        },
      },
    });

    razorpay.on('payment.failed', (response) => {
      reject(new Error(response.error.description || 'Payment failed'));
    });

    razorpay.open();
  });
};

/**
 * Process complete Razorpay payment flow
 * @param {Object} paymentData - Payment details
 * @param {number} paymentData.amount - Amount in INR
 * @param {string} paymentData.name - Customer name
 * @param {string} paymentData.email - Customer email
 * @param {string} paymentData.contact - Customer contact number
 * @param {string} paymentData.description - Payment description
 * @returns {Promise<Object>}
 */
export const processRazorpayPayment = async (paymentData) => {
  try {
    const { amount, name, email, contact, description, notes } = paymentData;

    console.log('Step 1: Loading Razorpay script...');
    // Step 1: Load Razorpay script
    const isScriptLoaded = await loadRazorpayScript();
    if (!isScriptLoaded) {
      throw new Error('Failed to load Razorpay SDK');
    }
    console.log('Step 1: Razorpay script loaded successfully');

    console.log('Step 2: Creating order on backend...');
    // Step 2: Create order on backend
    const receiptId = `RCPT-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const order = await createRazorpayOrder({
      amount,
      currency: 'INR',
      receipt: receiptId,
      notes: notes || {},
    });
    console.log('Step 2: Order created:', order);

    console.log('Step 3: Opening Razorpay checkout...');
    // Step 3: Open Razorpay checkout
    const razorpayResponse = await openRazorpayCheckout({
      key: import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      order_id: order.id,
      name: 'FlatMate',
      description: description || 'Maintenance Payment',
      image: '/logo.png', // Add your logo path
      prefill: {
        name,
        email,
        contact,
      },
      theme: {
        color: '#2563eb', // Blue color matching your app theme
      },
    });
    console.log('Step 3: Payment completed, response:', razorpayResponse);

    console.log('Step 4: Verifying payment...');
    // Step 4: Verify payment on backend
    const verificationResult = await verifyRazorpayPayment({
      razorpay_order_id: razorpayResponse.razorpay_order_id,
      razorpay_payment_id: razorpayResponse.razorpay_payment_id,
      razorpay_signature: razorpayResponse.razorpay_signature,
    });
    console.log('Step 4: Payment verified:', verificationResult);

    const result = {
      success: true,
      receipt: receiptId,
      order_id: razorpayResponse.razorpay_order_id,
      payment_id: razorpayResponse.razorpay_payment_id,
      amount: amount,
      verification: verificationResult,
    };
    console.log('Payment processing complete. Result:', result);
    return result;
  } catch (error) {
    console.error('Razorpay payment processing error:', error);
    throw error;
  }
};
