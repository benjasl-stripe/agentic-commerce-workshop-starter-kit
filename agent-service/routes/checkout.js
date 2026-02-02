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
export async function createCheckout(items, buyer, merchantUrl) {
  // TODO: Implement this function
  // 
  // const body = { items };
  // if (buyer) body.buyer = buyer;
  // 
  // const response = await loggedACPFetch(`${merchantUrl}/checkouts`, {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify(body),
  // }, { endpoint: 'POST /checkouts', flow: 'Agent → Merchant' });
  // 
  // return await response.json();
  
  throw new Error('TODO: Implement createCheckout - call POST /checkouts on Merchant');
}

/**
 * Get checkout by ID
 * 
 * TODO: Call GET /checkouts/:id on the Merchant service
 */
export async function getCheckout(checkoutId, merchantUrl) {
  // TODO: Implement this function
  throw new Error('TODO: Implement getCheckout - call GET /checkouts/:id on Merchant');
}

/**
 * Update checkout with shipping address or fulfillment option
 * 
 * TODO: Call PUT /checkouts/:id on the Merchant service
 */
export async function updateCheckout(checkoutId, updates, merchantUrl) {
  // TODO: Implement this function
  throw new Error('TODO: Implement updateCheckout - call PUT /checkouts/:id on Merchant');
}

/**
 * Complete checkout with SPT payment token
 * 
 * TODO: Call POST /checkouts/:id/complete on the Merchant service
 * - Send payment_data with the SPT token
 */
export async function completeCheckout(checkoutId, paymentToken, merchantUrl) {
  // TODO: Implement this function
  throw new Error('TODO: Implement completeCheckout - call POST /checkouts/:id/complete on Merchant');
}

/**
 * Cancel a checkout
 * 
 * TODO: Call POST /checkouts/:id/cancel on the Merchant service
 */
export async function cancelCheckout(checkoutId, reason, merchantUrl) {
  // TODO: Implement this function
  throw new Error('TODO: Implement cancelCheckout - call POST /checkouts/:id/cancel on Merchant');
}

export default router;
