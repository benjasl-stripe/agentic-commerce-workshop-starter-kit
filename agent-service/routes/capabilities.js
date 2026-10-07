/**
 * Module 6. Describes the hosted article and can pay for it.
 * Does not call the local merchant.
 */

import express from 'express';
import { HOSTED_ARTICLE, buyContentUrl, contentUrl, isMppConfigured } from '../lib/capabilities.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    url: contentUrl(),
    ...HOSTED_ARTICLE,
    method: 'tempo',
    network: 'testnet',
    price_display: '$0.50',
  });
});

router.post('/buy', async (req, res) => {
  try {
    if (!isMppConfigured()) {
      return res.status(400).json({
        error: 'Set AGENT_TEMPO_PRIVATE_KEY in agent-service/.env and restart the agent',
      });
    }
    const result = await buyContentUrl(contentUrl());
    res.json(result);
  } catch (err) {
    console.error('MPP article purchase error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
