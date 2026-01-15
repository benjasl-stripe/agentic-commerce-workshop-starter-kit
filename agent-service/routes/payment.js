/**
 * Payment Route
 * 
 * Manages Stripe payment methods and creates Shared Payment Tokens (SPT)
 * 
 * SPT Flow:
 * 1. User saves a payment method (card) → stored on Stripe Customer
 * 2. When completing checkout → Agent creates SPT from stored PaymentMethod
 * 3. SPT is sent to Merchant → Merchant uses it to charge the card
 */

import express from 'express';
import Stripe from 'stripe';
import { withStripeLogging } from '../lib/stripe-logger.js';

const router = express.Router();

// Initialize Stripe (lazy loading to handle missing key)
let stripe = null;
function getStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

// In-memory storage for demo (use database in production)
// Maps email → { customerId, paymentMethodId, last4, brand }
const userPaymentMethods = new Map();

/**
 * GET /api/payment/config
 * Get Stripe publishable key for frontend
 */
router.get('/config', (req, res) => {
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || null;
  res.json({
    publishableKey,
    configured: !!getStripe(),
  });
});

/**
 * POST /api/payment/setup-intent
 * Create a SetupIntent for collecting card details
 * 
 * SetupIntent is used with Stripe Elements to securely collect
 * card details and create a reusable PaymentMethod.
 * 
 * Also creates a CustomerSession to enable showing saved payment methods
 * in the Payment Element UI.
 */
router.post('/setup-intent', async (req, res) => {
  try {
    const stripeClient = getStripe();
    if (!stripeClient) {
      return res.status(500).json({ 
        error: 'Stripe not configured',
        message: 'Add STRIPE_SECRET_KEY to .env file'
      });
    }
    
    const { email } = req.body;
    
    console.log('🔧 Creating SetupIntent for:', email || 'anonymous');
    
    let customerId;
    let existing = userPaymentMethods.get(email);
    
    if (existing?.customerId) {
      // Reuse existing customer
      customerId = existing.customerId;
      console.log('Using existing customer:', customerId);
    } else if (email) {
      // Check if customer exists in Stripe (handles server restart)
      const customers = await stripeClient.customers.list({
        email: email,
        limit: 1,
      });
      
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        console.log('Found existing Stripe customer:', customerId);
        
        // Get their payment methods to update cache
        const paymentMethods = await stripeClient.paymentMethods.list({
          customer: customerId,
          type: 'card',
        });
        
        if (paymentMethods.data.length > 0) {
          const pm = paymentMethods.data[0];
          userPaymentMethods.set(email, {
            customerId,
            paymentMethodId: pm.id,
            last4: pm.card?.last4,
            brand: pm.card?.brand,
          });
        } else {
          userPaymentMethods.set(email, {
            customerId,
            paymentMethodId: null,
            last4: null,
            brand: null,
          });
        }
      } else {
        // Create new customer for this email
        const customer = await withStripeLogging(
          'customers.create',
          () => stripeClient.customers.create({
            email,
            metadata: { 
              source: 'acp-demo-agent',
              created: new Date().toISOString(),
            },
          }),
          { email }
        );
        customerId = customer.id;
        console.log('Created new customer:', customerId);
        
        // Store the association
        userPaymentMethods.set(email, { 
          customerId, 
          paymentMethodId: null,
          last4: null,
          brand: null,
        });
      }
    }
    
    // Create SetupIntent
    const setupIntentParams = {
      payment_method_types: ['card'],
      metadata: { source: 'acp-demo-agent' },
    };
    
    if (customerId) {
      setupIntentParams.customer = customerId;
    }
    
    const setupIntent = await withStripeLogging(
      'setupIntents.create',
      () => stripeClient.setupIntents.create(setupIntentParams),
      setupIntentParams
    );
    
    console.log('✅ SetupIntent created:', setupIntent.id);
    
    // NOTE: CustomerSession is disabled to prevent Link from showing saved cards
    // This ensures users always enter fresh card details for the demo
    // To re-enable saved cards, uncomment the CustomerSession creation below
    /*
    let customerSessionClientSecret = null;
    if (customerId) {
      try {
        const customerSession = await stripeClient.customerSessions.create({
          customer: customerId,
          components: {
            payment_element: {
              enabled: true,
              features: {
                payment_method_redisplay: 'enabled',
                payment_method_save: 'enabled',
                payment_method_remove: 'enabled',
              },
            },
          },
        });
        customerSessionClientSecret = customerSession.client_secret;
        console.log('✅ CustomerSession created for saved payment methods');
      } catch (csError) {
        console.log('⚠️ CustomerSession not available:', csError.message);
      }
    }
    */
    
    res.json({
      clientSecret: setupIntent.client_secret,
      customerId,
      customerSessionClientSecret: null, // Disabled - always show fresh card input
    });
    
  } catch (error) {
    console.error('Setup intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payment/save-method
 * Save a payment method for a user (attaches to Stripe Customer)
 * 
 * Note: When using SetupIntent with a customer, Stripe automatically attaches
 * the PaymentMethod to that customer. We just need to record the association.
 */
router.post('/save-method', async (req, res) => {
  try {
    const stripeClient = getStripe();
    if (!stripeClient) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    
    const { email, paymentMethodId } = req.body;
    
    if (!email || !paymentMethodId) {
      return res.status(400).json({ error: 'Email and paymentMethodId required' });
    }
    
    console.log('💳 Saving payment method for:', email);
    
    // Get the payment method to see if it's already attached to a customer
    const paymentMethod = await withStripeLogging(
      'paymentMethods.retrieve',
      () => stripeClient.paymentMethods.retrieve(paymentMethodId),
      { paymentMethodId }
    );
    
    let customerId;
    
    if (paymentMethod.customer) {
      // PaymentMethod is already attached to a customer (from SetupIntent)
      customerId = typeof paymentMethod.customer === 'string' 
        ? paymentMethod.customer 
        : paymentMethod.customer.id;
      console.log('   PM already attached to customer:', customerId);
      
      // Set as default payment method
      await withStripeLogging(
        'customers.update',
        () => stripeClient.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        }),
        { customerId, default_payment_method: paymentMethodId }
      );
    } else {
      // PaymentMethod not attached, need to attach it
      const existing = userPaymentMethods.get(email);
      
      if (existing?.customerId) {
        customerId = existing.customerId;
      } else {
        // Create customer if doesn't exist
        const customer = await withStripeLogging(
          'customers.create',
          () => stripeClient.customers.create({
            email,
            metadata: { source: 'acp-demo-agent' },
          }),
          { email }
        );
        customerId = customer.id;
      }
      
      // Attach payment method to customer
      await withStripeLogging(
        'paymentMethods.attach',
        () => stripeClient.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        }),
        { paymentMethodId, customer: customerId }
      );
      
      // Set as default payment method
      await withStripeLogging(
        'customers.update',
        () => stripeClient.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        }),
        { customerId, default_payment_method: paymentMethodId }
      );
    }
    
    // Store the association
    userPaymentMethods.set(email, { 
      customerId, 
      paymentMethodId,
      last4: paymentMethod.card?.last4,
      brand: paymentMethod.card?.brand,
    });
    
    console.log('✅ Payment method saved:', paymentMethod.card?.brand, '****', paymentMethod.card?.last4);
    
    res.json({
      success: true,
      customerId,
      paymentMethodId,
      cardBrand: paymentMethod.card?.brand,
      cardLast4: paymentMethod.card?.last4,
      message: 'Payment method saved successfully',
    });
    
  } catch (error) {
    console.error('Save payment method error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payment/methods
 * Get saved payment methods for a user
 */
router.get('/methods', async (req, res) => {
  try {
    const stripeClient = getStripe();
    if (!stripeClient) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({ error: 'Email query parameter required' });
    }
    
    console.log(`💳 Getting payment methods for: ${email}`);
    
    let userData = userPaymentMethods.get(email);
    
    // If not in cache, try to find customer in Stripe by email
    if (!userData?.customerId) {
      console.log('   📡 Not in cache, searching Stripe...');
      const customers = await stripeClient.customers.list({
        email: email,
        limit: 1,
      });
      
      if (customers.data.length > 0) {
        const customer = customers.data[0];
        console.log(`   ✅ Found customer in Stripe: ${customer.id}`);
        
        // Get their payment methods
        const paymentMethods = await stripeClient.paymentMethods.list({
          customer: customer.id,
          type: 'card',
        });
        
        if (paymentMethods.data.length > 0) {
          const pm = paymentMethods.data[0];
          // Cache for future use
          userData = {
            customerId: customer.id,
            paymentMethodId: pm.id,
            cardBrand: pm.card?.brand,
            cardLast4: pm.card?.last4,
          };
          userPaymentMethods.set(email, userData);
          console.log(`   💾 Cached: ${paymentMethods.data.length} payment method(s)`);
        } else {
          // Customer exists but no payment methods
          userData = { customerId: customer.id };
          userPaymentMethods.set(email, userData);
          console.log('   ⚠️ Customer has no payment methods');
        }
      } else {
        console.log('   ⚠️ No customer found in Stripe');
        return res.json({ paymentMethods: [] });
      }
    }
    
    if (!userData?.customerId) {
      return res.json({ paymentMethods: [] });
    }
    
    const paymentMethods = await stripeClient.paymentMethods.list({
      customer: userData.customerId,
      type: 'card',
    });
    
    console.log(`   📋 Returning ${paymentMethods.data.length} payment method(s)`);
    
    res.json({
      customerId: userData.customerId,
      paymentMethods: paymentMethods.data.map(pm => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
      })),
    });
    
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payment/create-spt
 * Create a Shared Payment Token from a saved payment method
 * 
 * This is the KEY ACP function:
 * - Agent has user's payment method stored
 * - Agent creates a token that can be shared with the merchant
 * - Merchant uses this token to charge the card
 * 
 * In production, Stripe provides a specific SPT API.
 * For this demo, we create a reference token that includes
 * the customer and payment method info.
 */
router.post('/create-spt', async (req, res) => {
  try {
    const stripeClient = getStripe();
    if (!stripeClient) {
      return res.status(500).json({ error: 'Stripe not configured' });
    }
    
    const { email, paymentMethodId } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }
    
    console.log('🔐 Creating SPT for:', email);
    
    // Get user's stored payment data
    const userData = userPaymentMethods.get(email);
    
    if (!userData?.customerId) {
      return res.status(400).json({ 
        error: 'No payment method on file',
        message: 'Please save a payment method first',
      });
    }
    
    const pmId = paymentMethodId || userData.paymentMethodId;
    
    if (!pmId) {
      return res.status(400).json({ error: 'No payment method available' });
    }
    
    // Verify the payment method exists and is valid
    const paymentMethod = await stripeClient.paymentMethods.retrieve(pmId);
    
    if (!paymentMethod) {
      return res.status(400).json({ error: 'Payment method not found' });
    }
    
    // Create SPT token
    // Format: spt_{customerId}_{paymentMethodId}_{timestamp}
    // 
    // In a real Stripe SPT implementation, Stripe generates this token
    // through their secure API. For demo purposes, we create a reference
    // that the merchant backend can parse and use.
    const timestamp = Date.now().toString(36);
    const sptToken = `spt_${userData.customerId}_${pmId}_${timestamp}`;
    
    console.log('✅ SPT created:', sptToken.substring(0, 40) + '...');
    console.log('   Card:', paymentMethod.card?.brand, '****', paymentMethod.card?.last4);
    
    res.json({
      token: sptToken,
      provider: 'stripe',
      customerId: userData.customerId,
      paymentMethodId: pmId,
      cardBrand: paymentMethod.card?.brand,
      cardLast4: paymentMethod.card?.last4,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 min expiry
      message: 'Shared Payment Token created successfully',
    });
    
  } catch (error) {
    console.error('Create SPT error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payment/has-method
 * Quick check if user has a saved payment method
 */
router.get('/has-method', (req, res) => {
  const { email } = req.query;
  
  if (!email) {
    return res.json({ hasMethod: false });
  }
  
  const userData = userPaymentMethods.get(email);
  
  res.json({
    hasMethod: !!(userData?.paymentMethodId),
    cardBrand: userData?.brand || null,
    cardLast4: userData?.last4 || null,
  });
});

// ============================================================================
// Exported Functions for use by other modules
// ============================================================================

/**
 * Get customer's saved payment methods
 * 
 * First checks in-memory cache, then falls back to searching Stripe by email.
 * This handles the case where the Agent Service was restarted after saving
 * a payment method (in-memory cache would be empty).
 */
export async function getCustomerPaymentMethods(email) {
  const stripeClient = getStripe();
  if (!stripeClient) {
    throw new Error('Stripe not configured');
  }
  
  let userData = userPaymentMethods.get(email);
  
  // If not in cache, search Stripe for customers with this email
  if (!userData?.customerId) {
    console.log(`   🔍 Searching Stripe for customer: ${email}`);
    const customers = await stripeClient.customers.list({
      email: email,
      limit: 1,
    });
    
    if (customers.data.length > 0) {
      const customer = customers.data[0];
      console.log(`   ✅ Found existing customer: ${customer.id}`);
      
      // Get their payment methods
      const paymentMethods = await stripeClient.paymentMethods.list({
        customer: customer.id,
        type: 'card',
      });
      
      if (paymentMethods.data.length > 0) {
        const pm = paymentMethods.data[0];
        // Re-populate the cache
        userPaymentMethods.set(email, {
          customerId: customer.id,
          paymentMethodId: pm.id,
          last4: pm.card?.last4,
          brand: pm.card?.brand,
        });
        console.log(`   ✅ Found payment method: ${pm.card?.brand} **** ${pm.card?.last4}`);
      } else {
        // Customer exists but no payment methods
        userPaymentMethods.set(email, {
          customerId: customer.id,
          paymentMethodId: null,
          last4: null,
          brand: null,
        });
      }
      
      return paymentMethods.data;
    }
    
    // No customer found
    return [];
  }
  
  const paymentMethods = await stripeClient.paymentMethods.list({
    customer: userData.customerId,
    type: 'card',
  });
  
  return paymentMethods.data;
}

/**
 * Create a Shared Payment Token from a saved payment method
 * 
 * Uses Stripe's SPT API to issue a token that can be used by the merchant.
 * The SPT includes usage limits (amount, currency, expiration) for security.
 * 
 * When SPT_SIMULATION_MODE=true, creates a simulated token for demos/workshops
 * where the real SPT API is not yet available (private preview).
 * 
 * @param {string} email - User's email
 * @param {number} amount - Maximum amount the SPT can be used for (in cents)
 * @param {string} currency - Currency for the transaction (e.g., 'usd')
 * @param {string} sellerId - Optional merchant identifier for scoping the SPT
 * @param {string} paymentMethodId - Optional specific payment method to use
 */
export async function createSPT(email, amount = 100000, currency = 'usd', sellerId = null, paymentMethodId = null) {
  const stripeClient = getStripe();
  if (!stripeClient) {
    throw new Error('Stripe not configured');
  }
  
  let userData = userPaymentMethods.get(email);
  
  // If not in cache, search Stripe for customers with this email
  if (!userData?.customerId) {
    console.log(`   🔍 SPT: Searching Stripe for customer: ${email}`);
    const customers = await stripeClient.customers.list({
      email: email,
      limit: 1,
    });
    
    if (customers.data.length > 0) {
      const customer = customers.data[0];
      console.log(`   ✅ SPT: Found existing customer: ${customer.id}`);
      
      // Get their payment methods
      const paymentMethods = await stripeClient.paymentMethods.list({
        customer: customer.id,
        type: 'card',
      });
      
      if (paymentMethods.data.length > 0) {
        const pm = paymentMethods.data[0];
        // Re-populate the cache
        userData = {
          customerId: customer.id,
          paymentMethodId: pm.id,
          last4: pm.card?.last4,
          brand: pm.card?.brand,
        };
        userPaymentMethods.set(email, userData);
        console.log(`   ✅ SPT: Found payment method: ${pm.card?.brand} **** ${pm.card?.last4}`);
      } else {
        throw new Error('Customer exists but has no payment methods');
      }
    } else {
      throw new Error('No payment method on file');
    }
  }
  
  const pmId = paymentMethodId || userData.paymentMethodId;
  
  if (!pmId) {
    throw new Error('No payment method available');
  }
  
  // Get payment method details for response
  const paymentMethod = await stripeClient.paymentMethods.retrieve(pmId);
  
  // Set expiration to 1 hour from now
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  
  // ============================================================================
  // SIMULATION MODE
  // When SPT API is not available (private preview), create a simulated token
  // that embeds the payment method info. Requires same Stripe account for both
  // Agent and Merchant.
  // ============================================================================
  if (process.env.SPT_SIMULATION_MODE === 'true') {
    console.log('⚠️  SPT Simulation Mode - creating simulated token');
    console.log('   (To use real SPT API, remove SPT_SIMULATION_MODE from .env)');
    
    // Format: spt_sim_{customerId}_{paymentMethodId}_{expiresAt}
    const simToken = `spt_sim_${userData.customerId}_${pmId}_${expiresAt}`;
    
    return {
      token: simToken,
      provider: 'stripe',
      customerId: userData.customerId,
      paymentMethodId: pmId,
      cardBrand: paymentMethod.card?.brand,
      cardLast4: paymentMethod.card?.last4,
      simulated: true,
      usageLimits: { currency, max_amount: amount, expires_at: expiresAt },
    };
  }
  
  // ============================================================================
  // PRODUCTION SPT IMPLEMENTATION
  // 
  // Agent issues SPT to merchant using: /v1/shared_payment/issued_tokens
  // Merchant uses SPT with: shared_payment_granted_token param on PaymentIntent
  // 
  // Environment variables:
  //   SPT_API_URL - Override the default SPT endpoint (optional)
  //   SPT_NETWORK_ID - Network identifier for seller scoping (default: 'acp_demo')
  // ============================================================================
  console.log('🔐 Agent issuing SPT via Stripe API');
  
  // Agent issues SPT to merchant
  const sptEndpoint = process.env.SPT_API_URL || 'https://api.stripe.com/v1/test_helpers/shared_payment/granted_tokens';
  
  console.log(`   📍 SPT Endpoint: ${sptEndpoint}`);
  console.log(`   💳 Payment Method: ${pmId}`);
  console.log(`   💰 Amount limit: ${amount} ${currency}`);
  
  const requestBody = new URLSearchParams({
    'payment_method': pmId,
    'usage_limits[currency]': currency,
    'usage_limits[max_amount]': amount.toString(),
    'usage_limits[expires_at]': expiresAt.toString(),
  });
  
  // Add seller details to scope the SPT to the merchant
  // When agent and merchant use the same Stripe account, use 'internal' for both
  const networkId = process.env.SPT_NETWORK_ID || 'internal';
  const externalId = process.env.SPT_MERCHANT_ID || 'internal';
  //requestBody.append('seller_details[network_id]', networkId);
  //requestBody.append('seller_details[external_id]', externalId);
  
  console.log(`   🏪 Seller: network_id=${networkId}, external_id=${externalId}`);
  
  const headers = {
    'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  
  // Add Stripe API version if specified (may be required for SPT beta)
  if (process.env.STRIPE_API_VERSION) {
    headers['Stripe-Version'] = process.env.STRIPE_API_VERSION;
  }
  
  const response = await fetch(sptEndpoint, {
    method: 'POST',
    headers,
    body: requestBody.toString(),
  });
  
  const sptResult = await response.json();
  
  if (sptResult.error) {
    console.error('SPT creation error:', sptResult.error);
    console.error('   Request URL:', sptEndpoint);
    console.error('   Response status:', response.status);
    throw new Error(sptResult.error.message || 'Failed to create SPT');
  }
  
  console.log('✅ SPT issued:', sptResult.id);
  console.log('   Token type:', sptResult.object);
  if (sptResult.usage_limits) {
    console.log(`   Limits: ${sptResult.usage_limits.max_amount} ${sptResult.usage_limits.currency}, expires: ${new Date(sptResult.usage_limits.expires_at * 1000).toISOString()}`);
  }
  
  return {
    token: sptResult.id, // Real SPT token like "spt_xxx"
    provider: 'stripe',
    customerId: userData.customerId,
    paymentMethodId: pmId,
    cardBrand: paymentMethod.card?.brand,
    cardLast4: paymentMethod.card?.last4,
    usageLimits: sptResult.usage_limits,
  };
}

export default router;
