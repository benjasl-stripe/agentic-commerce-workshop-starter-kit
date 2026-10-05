/**
 * Optional Module 7 routes. Registered always, but they only pay when
 * AGENT_TEMPO_PRIVATE_KEY is set and the merchant exposes /capabilities.
 */

import express from 'express';
import { listCapabilities, buyCapability, isMppConfigured } from '../lib/capabilities.js';

const router = express.Router();

function getMerchantUrl(req) {
  return (
    req.headers['x-merchant-url'] ||
    req.body?.merchantUrl ||
    process.env.MERCHANT_API_URL ||
    'http://localhost:4000'
  );
}

router.get('/', async (req, res) => {
  try {
    const data = await listCapabilities(getMerchantUrl(req));
    res.json(data);
  } catch (err) {
    res.status(502).json({
      error: err.message,
      hint: 'The merchant capabilities route is added in Module 7. Earlier modules can ignore this.',
    });
  }
});

router.post('/buy', async (req, res) => {
  try {
    if (!isMppConfigured()) {
      return res.status(400).json({
        error: 'Set AGENT_TEMPO_PRIVATE_KEY in agent-service/.env and restart the agent',
      });
    }
    const { capability_id } = req.body || {};
    if (!capability_id) {
      return res.status(400).json({ error: 'capability_id is required' });
    }
    const result = await buyCapability(capability_id, getMerchantUrl(req));
    res.json(result);
  } catch (err) {
    console.error('MPP capability purchase error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
