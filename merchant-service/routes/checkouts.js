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
import { getProductsForCheckout, hasStock, reserveStock, getProductById } from '../lib/productStore.js';

const router = express.Router();

// In-memory checkout store (replace with database in production)
const checkouts = new Map();

// Helper to generate unique IDs
const generateId = () => `checkout_${crypto.randomBytes(12).toString('hex')}`;

// Get products formatted for checkout (prices in cents, with current stock)
const getProducts = () => getProductsForCheckout();

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
const calculateLineItems = (items) => {
  const products = getProducts();
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
  // TODO: Implement checkout creation
  //
  // const { items, buyer, fulfillment_address } = req.body;
  //
  // 1. Validate items array exists and is not empty
  // 2. Check each product exists and has sufficient stock
  // 3. Calculate line items using calculateLineItems()
  // 4. Create checkout object with generated ID
  // 5. Store in checkouts Map
  // 6. Return formatted response
  
  res.status(501).json({
    type: 'not_implemented',
    code: 'todo',
    message: 'TODO: Implement POST /checkouts - Create a checkout session',
  });
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
  // TODO: Implement checkout retrieval
  //
  // const { id } = req.params;
  // const checkout = checkouts.get(id);
  // if (!checkout) return 404
  // return formatCheckoutResponse(checkout)
  
  res.status(501).json({
    type: 'not_implemented',
    code: 'todo',
    message: 'TODO: Implement GET /checkouts/:id - Retrieve checkout',
  });
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
  // TODO: Implement checkout update
  //
  // const { id } = req.params;
  // const { fulfillment_address, fulfillment_option_id, buyer } = req.body;
  //
  // 1. Look up checkout
  // 2. Validate it's not completed/canceled
  // 3. Apply updates
  // 4. Save and return
  
  res.status(501).json({
    type: 'not_implemented',
    code: 'todo',
    message: 'TODO: Implement PUT /checkouts/:id - Update checkout',
  });
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
  // TODO: Implement checkout completion
  //
  // const { id } = req.params;
  // const { payment_data } = req.body;
  //
  // 1. Validate checkout exists and is ready_for_payment
  // 2. Validate payment_data.token exists and starts with 'spt_'
  // 3. Create PaymentIntent with Stripe using the SPT
  // 4. Reserve stock for each item
  // 5. Mark as completed with order details
  
  res.status(501).json({
    type: 'not_implemented',
    code: 'todo',
    message: 'TODO: Implement POST /checkouts/:id/complete - Complete with payment',
  });
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
  // TODO: Implement checkout cancellation
  //
  // const { id } = req.params;
  // const { reason } = req.body;
  //
  // 1. Look up checkout
  // 2. Validate it's not already completed/canceled
  // 3. Set status to 'canceled'
  // 4. Return updated checkout
  
  res.status(501).json({
    type: 'not_implemented',
    code: 'todo',
    message: 'TODO: Implement POST /checkouts/:id/cancel - Cancel checkout',
  });
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
