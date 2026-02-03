/**
 * Webhook Routes
 * 
 * Handles incoming webhooks from Stripe.
 * Webhooks are the source of truth for payment events.
 * 
 * Endpoints:
 * - POST /webhooks/stripe - Receive Stripe webhook events
 */

import express from 'express';
import Stripe from 'stripe';
import { checkouts } from './checkouts.js';

const router = express.Router();

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * POST /webhooks/stripe - Handle Stripe webhook events
 * 
 * IMPORTANT: This route uses express.raw() middleware instead of express.json()
 * because Stripe needs the raw request body to verify the signature.
 */
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  // Check if webhook secret is configured
  if (!webhookSecret) {
    console.log('⚠️ STRIPE_WEBHOOK_SECRET not configured - skipping signature verification');
    // In production, you should NOT skip verification!
    // For the workshop, we'll still try to parse the event
    try {
      const event = JSON.parse(req.body.toString());
      console.log('📥 Webhook received (unverified):', event.type);
      
      // Still handle the event even if unverified (for demo purposes)
      await handleEvent(event);
      
      return res.json({ received: true, verified: false });
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
  }
  
  // TODO: Verify webhook signature
  // This ensures the request really came from Stripe
  // 
  // const sig = req.headers['stripe-signature'];
  // let event;
  // 
  // try {
  //   event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  //   console.log('📥 Webhook received (verified):', event.type);
  // } catch (err) {
  //   console.error('⚠️ Webhook signature verification failed:', err.message);
  //   return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  // }
  // 
  // await handleEvent(event);
  // res.json({ received: true });
  
  return res.status(501).json({
    error: 'TODO: Implement webhook signature verification',
    hint: 'Uncomment the verification code above'
  });
});

/**
 * Handle webhook events
 * Calls the Merchant Catalog API to update stock
 */
async function handleEvent(event) {
  // TODO: Handle payment_intent.succeeded event
  // - Find the checkout by payment_intent_id
  // - Mark it as webhook-confirmed
  // - Call the catalog stock endpoint to decrement stock
  // - Log the confirmation
  //
  // if (event.type === 'payment_intent.succeeded') {
  //   const paymentIntent = event.data.object;
  //   console.log('✅ Webhook: Payment confirmed:', paymentIntent.id);
  //   
  //   // Find checkout with this payment_intent_id
  //   for (const [checkoutId, checkout] of checkouts) {
  //     if (checkout.payment_intent_id === paymentIntent.id) {
  //       checkout.webhook_confirmed = true;
  //       checkout.webhook_confirmed_at = new Date().toISOString();
  //       
  //       // Record sale via catalog API (decrements stock AND records in sales history)
  //       // Uses the catalog stored with the checkout (e.g., "tv", "skis")
  //       if (!checkout.stock_reserved) {
  //         const merchantBaseUrl = `http://localhost:${process.env.PORT || 4000}`;
  //         const catalogName = checkout.catalog || 'products';
  //         
  //         for (const lineItem of checkout.line_items) {
  //           await fetch(`${merchantBaseUrl}/api/${catalogName}/sale`, {
  //             method: 'POST',
  //             headers: { 'Content-Type': 'application/json' },
  //             body: JSON.stringify({
  //               productId: lineItem.id,
  //               quantity: lineItem.item.quantity,
  //               orderId: checkout.order?.id,
  //             }),
  //           });
  //         }
  //         checkout.stock_reserved = true;
  //       }
  //       break;
  //     }
  //   }
  // }

  // TODO: (Optional) Handle payment_intent.payment_failed
  // if (event.type === 'payment_intent.payment_failed') {
  //   const paymentIntent = event.data.object;
  //   console.log('❌ Webhook: Payment failed:', paymentIntent.id);
  // }
  
  console.log('ℹ️ Webhook event received but not handled yet:', event.type);
}

export default router;
