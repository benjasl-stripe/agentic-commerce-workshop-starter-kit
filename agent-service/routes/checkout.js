/**
 * Checkout Route
 * 
 * Manages ACP checkout sessions with the merchant backend
 * 
 * TODO: Implement the ACP checkout functions to communicate with the Merchant
 */

import express from 'express';
import { loggedACPFetch } from '../lib/acp-call-logger.js';

const router = express.Router();

// Read default merchant URL dynamically (after dotenv has loaded)
function getDefaultMerchantUrl() {
  return process.env.MERCHANT_API_URL || null;
}

/**
 * Get merchant URL from request or use default
 */
function getMerchantUrl(req) {
  // Check header first (for workshop mode)
  const headerUrl = req.headers['x-merchant-url'];
  if (headerUrl) return headerUrl;
  
  // Check body for merchantUrl
  if (req.body?.merchantUrl) return req.body.merchantUrl;
  
  // Check query param
  if (req.query?.merchantUrl) return req.query.merchantUrl;
  
  return getDefaultMerchantUrl();
}

/**
 * POST /api/checkout/create
 * Create a new checkout session via ACP
 */
router.post('/create', async (req, res) => {
  try {
    const { items, buyer, fulfillmentAddress } = req.body;
    const merchantUrl = getMerchantUrl(req);
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items array required' });
    }
    
    console.log('🛒 Creating checkout via ACP:', items);
    console.log('   Merchant URL:', merchantUrl);
    
    // Call the exported function
    const checkout = await createCheckout(items, buyer, merchantUrl);
    
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
    const merchantUrl = getMerchantUrl(req);
    
    console.log('📋 Getting checkout:', id);
    
    const checkout = await getCheckout(id, merchantUrl);
    
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
    const merchantUrl = getMerchantUrl(req);
    
    console.log('✏️ Updating checkout:', id);
    
    const updates = {};
    if (items) updates.items = items;
    if (buyer) updates.buyer = buyer;
    if (fulfillmentAddress) updates.fulfillmentAddress = fulfillmentAddress;
    if (fulfillmentOptionId) updates.fulfillmentOptionId = fulfillmentOptionId;
    
    const checkout = await updateCheckout(id, updates, merchantUrl);
    
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
    const merchantUrl = getMerchantUrl(req);
    
    if (!paymentToken) {
      return res.status(400).json({ error: 'Payment token (SPT) required' });
    }
    
    console.log('💳 Completing checkout:', id, 'with SPT');
    
    const checkout = await completeCheckout(id, paymentToken, merchantUrl);
    
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
    const merchantUrl = getMerchantUrl(req);
    
    console.log('❌ Cancelling checkout:', id);
    
    const checkout = await cancelCheckout(id, reason, merchantUrl);
    
    const { getPendingLogs } = await import('../lib/acp-call-logger.js');
    res.json({ ...checkout, acpLogs: getPendingLogs() });
    
  } catch (error) {
    console.error('Cancel checkout error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// Exported Functions for use by chat.js (AI function calling)
// TODO: Implement these functions to call the Merchant's ACP endpoints
// ============================================================================

/**
 * Create a new checkout session
 * 
 * TODO: Call POST /checkouts on the Merchant service
 * - Send items array and optional buyer info
 * - Return the checkout object from the Merchant
 */
export async function createCheckout(items, buyer, merchantUrl, catalog = null) {
  const body = { items };
  if (buyer) body.buyer = buyer;
  if (catalog) body.catalog = catalog; // Tell merchant which catalog to use
  
  const response = await loggedACPFetch(`${merchantUrl}/checkouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { endpoint: 'POST /checkouts', flow: 'Agent → Merchant' });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to create checkout');
  }
  
  return await response.json();
}


/**
 * Get checkout by ID
 * 
 * TODO: Call GET /checkouts/:id on the Merchant service
 */
export async function getCheckout(checkoutId, merchantUrl) {
  const response = await loggedACPFetch(`${merchantUrl}/checkouts/${checkoutId}`, {
    method: 'GET',
  }, { endpoint: 'GET /checkouts/:id', flow: 'Agent → Merchant' });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get checkout');
  }
  
  return await response.json();
}


/**
 * Update checkout with shipping address or fulfillment option
 * 
 * TODO: Call PUT /checkouts/:id on the Merchant service
 */
export async function updateCheckout(checkoutId, updates, merchantUrl) {
  // Convert camelCase to snake_case for ACP protocol
  const body = {};
  if (updates.items) body.items = updates.items;
  if (updates.buyer) body.buyer = updates.buyer;
  if (updates.fulfillmentAddress) body.fulfillment_address = updates.fulfillmentAddress;
  if (updates.fulfillmentOptionId) body.fulfillment_option_id = updates.fulfillmentOptionId;
  
  const response = await loggedACPFetch(`${merchantUrl}/checkouts/${checkoutId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { endpoint: 'PUT /checkouts/:id', flow: 'Agent → Merchant' });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update checkout');
  }
  
  return await response.json();
}


/**
 * Complete checkout with SPT payment token
 * 
 * TODO: Call POST /checkouts/:id/complete on the Merchant service
 * - Send payment_data with the SPT token
 */
export async function completeCheckout(checkoutId, paymentToken, merchantUrl) {
  const body = {
    payment_data: {
      token: paymentToken,
      provider: 'stripe'
    }
  };
  
  const response = await loggedACPFetch(`${merchantUrl}/checkouts/${checkoutId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, { endpoint: 'POST /checkouts/:id/complete', flow: 'Agent → Merchant' });
  
  if (!response.ok) {
    const errorData = await response.json();
    
    // Check for error messages in the checkout response (payment declined, fraud, etc.)
    if (errorData.messages && Array.isArray(errorData.messages)) {
      const errorMessage = errorData.messages.find(m => m.type === 'error');
      if (errorMessage) {
        // Include the specific error code and content for better AI response
        const reason = errorMessage.content || errorMessage.code || 'Payment failed';
        throw new Error(`Payment declined: ${reason}`);
      }
    }
    
    // Fallback to standard error format
    throw new Error(errorData.message || 'Failed to complete checkout');
  }
  
  return await response.json();
}


/**
 * Cancel a checkout
 * 
 * TODO: Call POST /checkouts/:id/cancel on the Merchant service
 */
export async function cancelCheckout(checkoutId, reason, merchantUrl) {
  const response = await loggedACPFetch(`${merchantUrl}/checkouts/${checkoutId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  }, { endpoint: 'POST /checkouts/:id/cancel', flow: 'Agent → Merchant' });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to cancel checkout');
  }
  
  return await response.json();
}


export default router;
