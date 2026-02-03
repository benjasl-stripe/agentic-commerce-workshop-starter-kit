/**
 * Checkout Routes - ACP Implementation
 * 
 * TODO: Implement the Agentic Commerce Protocol checkout endpoints:
 * - POST /checkouts - Create a Checkout Session
 * - GET /checkouts/:id - Retrieve a Checkout object
 * - PUT /checkouts/:id - Update a Checkout Session
 * - POST /checkouts/:id/complete - Complete a Checkout (with SPT)
 * - POST /checkouts/:id/cancel - Cancel a Checkout
 */

import express from 'express';
import crypto from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getProductsForCheckout as getDefaultProducts, hasStock as hasDefaultStock, getProductById as getDefaultProductById } from '../lib/productStore.js';

const router = express.Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// In-memory checkout store (replace with database in production)
// In-memory checkout storage (exported for webhook handler)
export const checkouts = new Map();

// Helper to generate unique IDs
const generateId = () => `checkout_${crypto.randomBytes(12).toString('hex')}`;

// Cache for loaded catalogs (keyed by catalog name)
const catalogCaches = new Map();
const CACHE_TTL = 5000; // 5 seconds

// Load products from a specific catalog or all catalogs
const getProducts = (catalogName = null) => {
  const cacheKey = catalogName || '_all';
  const cached = catalogCaches.get(cacheKey);
  const now = Date.now();
  
  if (cached && (now - cached.time) < CACHE_TTL) {
    return cached.products;
  }
  
  const libPath = join(__dirname, '..', 'lib');
  
  // If a specific catalog is requested, try to load just that one
  if (catalogName) {
    const filePath = join(libPath, `${catalogName}.json`);
    if (existsSync(filePath)) {
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf8'));
        if (Array.isArray(data)) {
          console.log(`📦 Loading catalog: ${catalogName}.json (${data.length} products)`);
          const products = data.map(p => ({
            ...p,
            price: p.price * 100, // Convert dollars to cents
            _source: `${catalogName}.json`
          }));
          catalogCaches.set(cacheKey, { products, time: now });
          return products;
        }
      } catch (err) {
        console.error(`Error loading ${catalogName}.json:`, err.message);
      }
    }
  }
  
  // Fall back: Load all catalogs
  const allProducts = [];
  const seenIds = new Set();
  const jsonFiles = ['skis.json', 'products.json', 'catalog.json', 'tv.json']; // Common catalog names
  
  for (const file of jsonFiles) {
    const filePath = join(libPath, file);
    if (existsSync(filePath)) {
      try {
        const data = JSON.parse(readFileSync(filePath, 'utf8'));
        if (Array.isArray(data)) {
          console.log(`📦 Loading catalog: ${file} (${data.length} products)`);
          for (const p of data) {
            if (p.id && !seenIds.has(p.id)) {
              seenIds.add(p.id);
              // JSON catalogs have prices in DOLLARS, always convert to CENTS
              allProducts.push({
                ...p,
                price: p.price * 100,
                _source: file
              });
            }
          }
        }
      } catch (err) {
        // Ignore invalid files
      }
    }
  }
  
  // If we found products in JSON files, use those
  if (allProducts.length > 0) {
    catalogCaches.set(cacheKey, { products: allProducts, time: now });
    return allProducts;
  }
  
  // Fall back to default product store
  const defaultProducts = getDefaultProducts();
  catalogCaches.set(cacheKey, { products: defaultProducts, time: now });
  return defaultProducts;
};

// Default fulfillment options
const defaultFulfillmentOptions = [
  {
    type: "shipping",
    id: "shipping_standard",
    title: "Standard Shipping",
    subtitle: "5-7 business days",
    carrier: "USPS",
    subtotal: 499,
    tax: 0,
    total: 499,
  },
  {
    type: "shipping",
    id: "shipping_express",
    title: "Express Shipping",
    subtitle: "2-3 business days",
    carrier: "UPS",
    subtotal: 999,
    tax: 0,
    total: 999,
  },
];

// ============================================================================
// Helper Functions (provided - you can use these in your implementations)
// ============================================================================

/**
 * Calculate line items from cart items
 * Maps product IDs to full line item objects with prices
 */
const calculateLineItems = (items, catalogName = null) => {
  const products = getProducts(catalogName);
  const lineItems = [];
  
  for (const item of items) {
    const product = products.find(p => p.id === item.id);
    if (!product) continue;
    
    const baseAmount = product.price * item.quantity;
    const subtotal = baseAmount;
    const tax = Math.round(subtotal * 0.1); // 10% tax
    const total = subtotal + tax;
    
    lineItems.push({
      id: item.id,
      title: product.title || product.name,
      quantity: item.quantity,
      item: { id: item.id, quantity: item.quantity },
      base_amount: baseAmount,
      subtotal,
      tax,
      total,
      discount: 0,
      // Include product image for order confirmation display
      image_url: product.thumbnail || product.image || product.image_url || null,
    });
  }
  
  return lineItems;
};

/**
 * Calculate order totals from line items and fulfillment
 */
const calculateTotals = (lineItems, fulfillmentOption) => {
  const itemsSubtotal = lineItems.reduce((sum, li) => sum + li.subtotal, 0);
  const itemsTax = lineItems.reduce((sum, li) => sum + li.tax, 0);
  const fulfillmentCost = fulfillmentOption ? fulfillmentOption.total : 0;
  
  return [
    { type: "subtotal", display_text: "Subtotal", amount: itemsSubtotal },
    ...(fulfillmentCost > 0 ? [{ type: "fulfillment", display_text: "Shipping", amount: fulfillmentCost }] : []),
    { type: "tax", display_text: "Tax", amount: itemsTax },
    { type: "total", display_text: "Total", amount: itemsSubtotal + itemsTax + fulfillmentCost },
  ];
};

/**
 * Determine checkout status based on its state
 */
const determineStatus = (checkout) => {
  if (checkout.status === 'completed' || checkout.status === 'canceled') {
    return checkout.status;
  }
  
  const hasItems = checkout.line_items && checkout.line_items.length > 0;
  const hasAddress = checkout.fulfillment_address?.line_one && checkout.fulfillment_address?.city;
  const hasShipping = checkout.fulfillment_option_id;
  
  if (hasItems && hasAddress && hasShipping) {
    return 'ready_for_payment';
  }
  
  return 'not_ready_for_payment';
};

/**
 * Format checkout for API response
 */
const formatCheckoutResponse = (checkout) => {
  const fulfillmentOption = checkout.fulfillment_option_id 
    ? defaultFulfillmentOptions.find(fo => fo.id === checkout.fulfillment_option_id)
    : null;
  
  const totals = calculateTotals(checkout.line_items || [], fulfillmentOption);
  
  return {
    id: checkout.id,
    status: determineStatus(checkout),
    currency: checkout.currency,
    line_items: checkout.line_items,
    fulfillment_options: defaultFulfillmentOptions,
    totals,
    messages: checkout.messages || [],
    links: checkout.links || [],
    ...(checkout.buyer && { buyer: checkout.buyer }),
    ...(checkout.fulfillment_address && { fulfillment_address: checkout.fulfillment_address }),
    ...(checkout.fulfillment_option_id && { fulfillment_option_id: checkout.fulfillment_option_id }),
    ...(checkout.order && { order: checkout.order }),
  };
};

// ============================================================================
// ACP Endpoints - TODO: Implement these
// ============================================================================

/**
 * POST /checkouts - Create a Checkout Session
 * 
 * TODO: Implement this endpoint
 * - Validate the items array
 * - Check product availability and stock
 * - Calculate line items and totals
 * - Store the checkout and return it
 */
router.post('/', (req, res) => {
  try {
    const { items, buyer, fulfillment_address, catalog } = req.body;
    
    // Validate items
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'missing_items',
        message: 'Items array is required and must not be empty'
      });
    }
    
    // Validate each item exists and has stock
    // Use specific catalog if provided (e.g., "tv" for tv.json, "skis" for skis.json)
    const products = getProducts(catalog);
    console.log(`📦 Using catalog: ${catalog || 'all'} (${products.length} products)`);
    console.log(`   Available IDs: ${products.map(p => p.id).join(', ')}`);
    for (const item of items) {
      if (!item.id || typeof item.quantity !== 'number' || item.quantity < 1) {
        return res.status(400).json({
          type: 'invalid_request',
          code: 'invalid_item',
          message: 'Each item must have an id and positive quantity'
        });
      }
      
      const product = products.find(p => p.id === item.id);
      if (!product) {
        return res.status(400).json({
          type: 'invalid_request',
          code: 'product_not_found',
          message: `Product not found: ${item.id}`
        });
      }
      
      if (!product.inStock || product.stock < item.quantity) {
        return res.status(400).json({
          type: 'invalid_request',
          code: 'insufficient_stock',
          message: `Insufficient stock for: ${product.title}`
        });
      }
    }
    
    // Create the checkout object
    const lineItems = calculateLineItems(items, catalog);
    const checkout = {
      id: generateId(),
      currency: 'usd',
      line_items: lineItems,
      catalog: catalog || null, // Store which catalog this checkout uses
      payment_provider: {
        provider: 'stripe',
        supported_payment_methods: ['card']
      },
      messages: [],
      links: [
        { type: 'terms_of_use', url: 'https://example.com/terms' },
        { type: 'privacy_policy', url: 'https://example.com/privacy' }
      ],
      created_at: new Date().toISOString()
    };
    
    if (buyer) checkout.buyer = buyer;
    if (fulfillment_address) checkout.fulfillment_address = fulfillment_address;
    
    // Store in our in-memory Map
    checkouts.set(checkout.id, checkout);
    
    console.log('🛒 Checkout created:', checkout.id);
    res.status(201).json(formatCheckoutResponse(checkout));
    
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'An error occurred while creating the checkout'
    });
  }
});


/**
 * GET /checkouts/:id - Retrieve a Checkout object
 * 
 * TODO: Implement this endpoint
 * - Look up checkout by ID
 * - Return 404 if not found
 * - Return formatted checkout response
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const checkout = checkouts.get(id);
    
    if (!checkout) {
      return res.status(404).json({
        type: 'invalid_request',
        code: 'checkout_not_found',
        message: `Checkout with id '${id}' not found`
      });
    }
    
    res.json(formatCheckoutResponse(checkout));
    
  } catch (error) {
    console.error('Get checkout error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'An error occurred while retrieving the checkout'
    });
  }
});


/**
 * PUT /checkouts/:id - Update a Checkout Session
 * 
 * TODO: Implement this endpoint
 * - Look up checkout by ID
 * - Update fulfillment address and/or option
 * - Recalculate status
 * - Return updated checkout
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { items, buyer, fulfillment_address, fulfillment_option_id } = req.body;
    
    const checkout = checkouts.get(id);
    
    if (!checkout) {
      return res.status(404).json({
        type: 'invalid_request',
        code: 'checkout_not_found',
        message: `Checkout with id '${id}' not found`
      });
    }
    
    // Can't modify completed/canceled checkouts
    if (checkout.status === 'completed') {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'checkout_completed',
        message: 'Cannot modify a completed checkout'
      });
    }
    
    if (checkout.status === 'canceled') {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'checkout_canceled',
        message: 'Cannot modify a canceled checkout'
      });
    }
    
    // Update items if provided
    if (items && Array.isArray(items)) {
      // Use the catalog stored with this checkout
      const products = getProducts(checkout.catalog);
      
      for (const item of items) {
        if (!item.id || typeof item.quantity !== 'number' || item.quantity < 1) {
          return res.status(400).json({
            type: 'invalid_request',
            code: 'invalid_item',
            message: 'Each item must have an id and positive quantity'
          });
        }
        
        if (!products.find(p => p.id === item.id)) {
          return res.status(400).json({
            type: 'invalid_request',
            code: 'product_not_found',
            message: `Product not found: ${item.id}`
          });
        }
      }
      
      checkout.line_items = calculateLineItems(items, checkout.catalog);
    }
    
    // Update buyer, address, and shipping option
    if (buyer) checkout.buyer = { ...checkout.buyer, ...buyer };
    if (fulfillment_address) checkout.fulfillment_address = { ...checkout.fulfillment_address, ...fulfillment_address };
    
    if (fulfillment_option_id) {
      const validOption = defaultFulfillmentOptions.find(fo => fo.id === fulfillment_option_id);
      if (!validOption) {
        return res.status(400).json({
          type: 'invalid_request',
          code: 'invalid_fulfillment_option',
          message: `Invalid fulfillment option: ${fulfillment_option_id}`
        });
      }
      checkout.fulfillment_option_id = fulfillment_option_id;
    }
    
    checkout.updated_at = new Date().toISOString();
    checkouts.set(id, checkout);
    
    console.log('✏️ Checkout updated:', id, '- Status:', determineStatus(checkout));
    res.json(formatCheckoutResponse(checkout));
    
  } catch (error) {
    console.error('Update checkout error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'An error occurred while updating the checkout'
    });
  }
});


/**
 * POST /checkouts/:id/complete - Complete a Checkout with SPT
 * 
 * TODO: Implement this endpoint
 * - Validate SPT token
 * - Process payment with Stripe
 * - Reserve stock
 * - Mark checkout as completed
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_data, buyer } = req.body;
    
    const checkout = checkouts.get(id);
    
    if (!checkout) {
      return res.status(404).json({
        type: 'invalid_request',
        code: 'checkout_not_found',
        message: `Checkout with id '${id}' not found`
      });
    }
    
    if (checkout.status === 'completed') {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'checkout_already_completed',
        message: 'Checkout has already been completed'
      });
    }
    
    if (checkout.status === 'canceled') {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'checkout_canceled',
        message: 'Cannot complete a canceled checkout'
      });
    }
    
    // Validate payment data
    if (!payment_data || !payment_data.token) {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'missing_payment_token',
        message: 'Payment token is required'
      });
    }
    
    // Validate SPT format
    if (!payment_data.token.startsWith('spt_')) {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'invalid_token',
        message: 'Invalid SPT token format. Token must start with spt_'
      });
    }
    
    if (buyer) checkout.buyer = { ...checkout.buyer, ...buyer };
    
    console.log('💳 Processing payment for checkout:', id);
    console.log('   Token:', payment_data.token.substring(0, 30) + '...');
    
    // Calculate total amount
    const fulfillmentOption = checkout.fulfillment_option_id
      ? defaultFulfillmentOptions.find(fo => fo.id === checkout.fulfillment_option_id)
      : null;
    const totals = calculateTotals(checkout.line_items, fulfillmentOption);
    const totalAmount = totals.find(t => t.type === 'total')?.amount || 0;
    
    // Process payment with Stripe using the SPT
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (stripeSecretKey && payment_data.provider === 'stripe') {
      try {
        // Create PaymentIntent with the SPT
        const params = new URLSearchParams({
          amount: totalAmount.toString(),
          currency: checkout.currency,
          shared_payment_granted_token: payment_data.token,
          'payment_method_types[0]': 'card',
          confirm: 'true'
        });
        
        const response = await fetch('https://api.stripe.com/v1/payment_intents', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeSecretKey}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params.toString()
        });
        
        const paymentIntent = await response.json();
        
        if (paymentIntent.error) {
          console.error('Payment error:', paymentIntent.error.message);
          checkout.messages.push({
            type: 'error',
            code: 'payment_declined',
            content: paymentIntent.error.message
          });
          checkouts.set(id, checkout);
          return res.status(400).json(formatCheckoutResponse(checkout));
        }
        
        if (paymentIntent.status !== 'succeeded') {
          checkout.messages.push({
            type: 'error',
            code: 'payment_failed',
            content: 'Payment could not be processed'
          });
          checkouts.set(id, checkout);
          return res.status(400).json(formatCheckoutResponse(checkout));
        }
        
        console.log('   ✅ Payment succeeded:', paymentIntent.id);
        checkout.payment_intent_id = paymentIntent.id;
        
      } catch (stripeError) {
        console.error('Stripe API error:', stripeError.message);
        return res.status(500).json({
          type: 'processing_error',
          code: 'payment_failed',
          message: 'Payment processing failed'
        });
      }
    } else {
      // Demo mode without Stripe key
      console.log('   ⚠️  Demo mode - simulating successful payment');
    }
    
    // NOTE: Stock reservation moved to webhook handler
    // Stock will be decremented when payment_intent.succeeded webhook is received
    // This ensures stock is only reserved after Stripe definitively confirms payment
    console.log('   ⏳ Stock will be reserved when webhook confirms payment');
    
    // Mark as completed
    checkout.status = 'completed';
    checkout.completed_at = new Date().toISOString();
    checkout.order = {
      id: `order_${crypto.randomBytes(12).toString('hex')}`,
      checkout_session_id: checkout.id,
      permalink_url: `https://example.com/orders/${checkout.id}`
    };
    
    checkout.messages.push({
      type: 'info',
      content: 'Order placed successfully! Thank you for your purchase.'
    });
    
    checkouts.set(id, checkout);
    
    console.log('🎉 Checkout completed:', id);
    res.json(formatCheckoutResponse(checkout));
    
  } catch (error) {
    console.error('Complete checkout error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'An error occurred while completing the checkout'
    });
  }
});

/**
 * POST /checkouts/:id/cancel - Cancel a Checkout
 * 
 * TODO: Implement this endpoint
 * - Validate checkout can be canceled
 * - Mark as canceled
 * - Return updated checkout
 */
router.post('/:id/cancel', (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const checkout = checkouts.get(id);
    
    if (!checkout) {
      return res.status(404).json({
        type: 'invalid_request',
        code: 'checkout_not_found',
        message: `Checkout with id '${id}' not found`
      });
    }
    
    if (checkout.status === 'completed') {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'checkout_completed',
        message: 'Cannot cancel a completed checkout'
      });
    }
    
    if (checkout.status === 'canceled') {
      return res.status(400).json({
        type: 'invalid_request',
        code: 'already_canceled',
        message: 'Checkout has already been canceled'
      });
    }
    
    checkout.status = 'canceled';
    checkout.canceled_at = new Date().toISOString();
    checkout.messages.push({
      type: 'info',
      content: reason ? `Checkout cancelled: ${reason}` : 'Checkout has been cancelled'
    });
    
    checkouts.set(id, checkout);
    
    console.log('❌ Checkout cancelled:', id);
    res.json(formatCheckoutResponse(checkout));
    
  } catch (error) {
    console.error('Cancel checkout error:', error);
    res.status(500).json({
      type: 'processing_error',
      code: 'internal_error',
      message: 'An error occurred while canceling the checkout'
    });
  }
});


// Debug endpoint - list all checkouts (keep this working)
router.get('/', (req, res) => {
  const allCheckouts = Array.from(checkouts.values()).map(formatCheckoutResponse);
  res.json({
    count: allCheckouts.length,
    checkouts: allCheckouts,
  });
});

export default router;
