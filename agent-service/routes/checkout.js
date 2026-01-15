/**
 * Checkout Route
 * 
 * Manages ACP checkout sessions with the merchant backend
 */

import express from 'express';
import { loggedACPFetch } from '../lib/acp-call-logger.js';

const router = express.Router();

const MERCHANT_API_URL = process.env.MERCHANT_API_URL || 'http://localhost:4000';

/**
 * POST /api/checkout/create
 * Create a new checkout session via ACP
 */
router.post('/create', async (req, res) => {
  try {
    const { items, buyer, fulfillmentAddress } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array required' });
    }
    
    console.log('🛒 Creating checkout via ACP:', items);
    
    const body = { items };
    if (buyer) body.buyer = buyer;
    if (fulfillmentAddress) body.fulfillment_address = fulfillmentAddress;
    
    const response = await loggedACPFetch(`${MERCHANT_API_URL}/checkouts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, { endpoint: 'POST /checkouts', flow: 'Agent → Merchant' });
    
    const checkout = await response.json();
    
    if (!response.ok) {
      console.error('ACP create error:', checkout);
      return res.status(response.status).json(checkout);
    }
    
    console.log('✅ Checkout created:', checkout.id);
    
    const { getPendingLogs } = await import('../lib/acp-call-logger.js');
    res.json({ ...checkout, acpLogs: getPendingLogs() });
    
  } catch (error) {
    console.error('Create checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/checkout/:id
 * Get checkout status via ACP
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('📋 Getting checkout:', id);
    
    const response = await loggedACPFetch(
      `${MERCHANT_API_URL}/checkouts/${id}`,
      {},
      { endpoint: 'GET /checkouts/:id', flow: 'Agent → Merchant' }
    );
    const checkout = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(checkout);
    }
    
    const { getPendingLogs } = await import('../lib/acp-call-logger.js');
    res.json({ ...checkout, acpLogs: getPendingLogs() });
    
  } catch (error) {
    console.error('Get checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/checkout/:id
 * Update checkout via ACP (shipping address, fulfillment option)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { items, buyer, fulfillmentAddress, fulfillmentOptionId } = req.body;
    
    console.log('✏️ Updating checkout:', id);
    
    const updates = {};
    if (items) updates.items = items;
    if (buyer) updates.buyer = buyer;
    if (fulfillmentAddress) updates.fulfillment_address = fulfillmentAddress;
    if (fulfillmentOptionId) updates.fulfillment_option_id = fulfillmentOptionId;
    
    const response = await loggedACPFetch(`${MERCHANT_API_URL}/checkouts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }, { endpoint: 'PUT /checkouts/:id', flow: 'Agent → Merchant' });
    
    const checkout = await response.json();
    
    if (!response.ok) {
      console.error('ACP update error:', checkout);
      return res.status(response.status).json(checkout);
    }
    
    console.log('✅ Checkout updated, status:', checkout.status);
    
    // Return logs with the response
    const { getPendingLogs } = await import('../lib/acp-call-logger.js');
    res.json({ ...checkout, acpLogs: getPendingLogs() });
    
  } catch (error) {
    console.error('Update checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/checkout/:id/complete
 * Complete checkout with SPT via ACP
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentToken, buyer } = req.body;
    
    if (!paymentToken) {
      return res.status(400).json({ error: 'Payment token (SPT) required' });
    }
    
    console.log('💳 Completing checkout:', id, 'with SPT');
    
    const body = {
      payment_data: {
        token: paymentToken,
        provider: 'stripe',
      },
    };
    if (buyer) body.buyer = buyer;
    
    const response = await loggedACPFetch(`${MERCHANT_API_URL}/checkouts/${id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, { endpoint: 'POST /checkouts/:id/complete', flow: 'Agent → Merchant' });
    
    const checkout = await response.json();
    
    if (!response.ok) {
      console.error('ACP complete error:', checkout);
      return res.status(response.status).json(checkout);
    }
    
    console.log('✅ Checkout completed!');
    
    const { getPendingLogs } = await import('../lib/acp-call-logger.js');
    res.json({ ...checkout, acpLogs: getPendingLogs() });
    
  } catch (error) {
    console.error('Complete checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/checkout/:id/cancel
 * Cancel checkout via ACP
 */
router.post('/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    console.log('❌ Cancelling checkout:', id);
    
    const response = await loggedACPFetch(`${MERCHANT_API_URL}/checkouts/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }, { endpoint: 'POST /checkouts/:id/cancel', flow: 'Agent → Merchant' });
    
    const checkout = await response.json();
    
    if (!response.ok) {
      console.error('ACP cancel error:', checkout);
      return res.status(response.status).json(checkout);
    }
    
    console.log('✅ Checkout cancelled');
    
    const { getPendingLogs } = await import('../lib/acp-call-logger.js');
    res.json({ ...checkout, acpLogs: getPendingLogs() });
    
  } catch (error) {
    console.error('Cancel checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Exported Functions for use by chat.js (AI function calling)
// ============================================================================

/**
 * Create a new checkout session
 */
export async function createCheckout(items, buyer) {
  const body = { items };
  if (buyer) body.buyer = buyer;
  
  const response = await loggedACPFetch(`${MERCHANT_API_URL}/checkouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { endpoint: 'POST /checkouts', flow: 'Agent → Merchant' });
  
  const checkout = await response.json();
  
  if (!response.ok) {
    throw new Error(checkout.error || 'Failed to create checkout');
  }
  
  return checkout;
}

/**
 * Get checkout by ID
 */
export async function getCheckout(checkoutId) {
  const response = await loggedACPFetch(
    `${MERCHANT_API_URL}/checkouts/${checkoutId}`,
    {},
    { endpoint: 'GET /checkouts/:id', flow: 'Agent → Merchant' }
  );
  const checkout = await response.json();
  
  if (!response.ok) {
    throw new Error(checkout.error || 'Failed to get checkout');
  }
  
  return checkout;
}

/**
 * Update checkout with shipping address or fulfillment option
 */
export async function updateCheckout(checkoutId, updates) {
  const body = {};
  if (updates.items) body.items = updates.items;
  if (updates.buyer) body.buyer = updates.buyer;
  if (updates.fulfillmentAddress) body.fulfillment_address = updates.fulfillmentAddress;
  if (updates.fulfillmentOptionId) body.fulfillment_option_id = updates.fulfillmentOptionId;
  
  const response = await loggedACPFetch(`${MERCHANT_API_URL}/checkouts/${checkoutId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { endpoint: 'PUT /checkouts/:id', flow: 'Agent → Merchant' });
  
  const checkout = await response.json();
  
  if (!response.ok) {
    throw new Error(checkout.error || 'Failed to update checkout');
  }
  
  return checkout;
}

/**
 * Complete checkout with SPT payment token
 */
export async function completeCheckout(checkoutId, paymentToken) {
  const response = await loggedACPFetch(`${MERCHANT_API_URL}/checkouts/${checkoutId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payment_data: {
        token: paymentToken,
        provider: 'stripe',
      },
    }),
  }, { endpoint: 'POST /checkouts/:id/complete', flow: 'Agent → Merchant' });
  
  const checkout = await response.json();
  
  if (!response.ok) {
    throw new Error(checkout.error || 'Failed to complete checkout');
  }
  
  return checkout;
}

/**
 * Cancel a checkout
 */
export async function cancelCheckout(checkoutId, reason) {
  const response = await loggedACPFetch(`${MERCHANT_API_URL}/checkouts/${checkoutId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  }, { endpoint: 'POST /checkouts/:id/cancel', flow: 'Agent → Merchant' });
  
  const checkout = await response.json();
  
  if (!response.ok) {
    throw new Error(checkout.error || 'Failed to cancel checkout');
  }
  
  return checkout;
}

export default router;

