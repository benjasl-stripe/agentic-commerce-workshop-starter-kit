/**
 * MPP client for Module 7 (Tempo testnet).
 *
 * Safe to ship in the starter kit: nothing here runs during Modules 1–6.
 * Chat only calls maybeUnlockSkiReviews when AGENT_TEMPO_PRIVATE_KEY is set,
 * and any failure (no mppx yet, merchant route missing) is skipped so checkout
 * still works.
 *
 * mppx is imported inside buyCapability, not at startup. Install it in Module 7:
 *   npm install mppx viem --legacy-peer-deps
 *
 * @see https://mpp.dev/protocol
 */

const TEMPO_TESTNET_CHAIN_ID = 42431;

export function isMppConfigured() {
  return !!process.env.AGENT_TEMPO_PRIVATE_KEY?.startsWith('0x');
}

function parseDecision(raw) {
  const match = (raw || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function askModel(userContent, workshopContext, lambdaEndpoint) {
  const endpoint = lambdaEndpoint || process.env.LAMBDA_ENDPOINT;
  if (!endpoint) return '';

  const secret = process.env.WORKSHOP_SECRET || '';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret && { 'X-Workshop-Secret': secret }),
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: userContent }],
      workshopContext,
      enableFunctionCalling: false,
    }),
  });

  if (!response.ok) return '';
  const data = await response.json().catch(() => ({}));
  return data.content || '';
}

async function loadMppx() {
  try {
    const client = await import('mppx/client');
    const core = await import('mppx');
    const accounts = await import('viem/accounts');
    return {
      Mppx: client.Mppx,
      tempo: client.tempo,
      Receipt: core.Receipt,
      privateKeyToAccount: accounts.privateKeyToAccount,
    };
  } catch {
    throw new Error(
      'mppx is not installed. From agent-service run: npm install mppx viem --legacy-peer-deps',
    );
  }
}

function createClient(mppx, account) {
  return mppx.Mppx.create({
    polyfill: false,
    methods: [
      mppx.tempo({
        account,
        allowedChainIds: [TEMPO_TESTNET_CHAIN_ID],
        expectedChainId: TEMPO_TESTNET_CHAIN_ID,
      }),
    ],
  });
}

export async function listCapabilities(merchantUrl) {
  const response = await fetch(`${merchantUrl}/capabilities`);
  if (!response.ok) {
    throw new Error(`Could not fetch capabilities (${response.status})`);
  }
  return await response.json();
}

/**
 * Pay the 402 and return the merchant body plus the MPP receipt.
 * No cache: each call is a new micropayment.
 */
export async function buyCapability(capabilityId, merchantUrl) {
  const listed = await listCapabilities(merchantUrl);
  const capability = listed.capabilities?.find((c) => c.id === capabilityId);
  if (!capability) {
    throw new Error(`Unknown capability: ${capabilityId}`);
  }

  const path = capability.url || `/capabilities/${capabilityId}`;
  const url = path.startsWith('http') ? path : `${merchantUrl}${path}`;

  const mppx = await loadMppx();
  const key = process.env.AGENT_TEMPO_PRIVATE_KEY;
  if (!key?.startsWith('0x')) {
    throw new Error('Set AGENT_TEMPO_PRIVATE_KEY to a faucet-funded Tempo testnet key');
  }
  const account = mppx.privateKeyToAccount(key);

  console.log('🤖 Agent acquiring capability via MPP (Tempo testnet)');
  console.log(`   payer: ${account.address}`);
  console.log(`   GET ${url}  (expect 402 → micropay → retry)`);
  console.log(`   listed price: ${capability.price_display} on ${capability.method}/${capability.network}`);

  const response = await createClient(mppx, account).fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MPP unlock failed (${response.status}): ${body}`);
  }

  const receipt = mppx.Receipt.fromResponse(response);
  if (receipt) {
    console.log(`   🧾 Payment-Receipt: status=${receipt.status} ref=${receipt.reference}`);
  }

  const result = await response.json();
  console.log(`   ✅ Capability unlocked via MPP micropayment: ${capabilityId}`);
  return { ...result, receipt, fromCache: false };
}

export function normalizeCapabilityUnlock(unlocked, extras = {}) {
  const data = unlocked?.data;
  const reviewDocument = data && !Array.isArray(data) && typeof data === 'object' ? data : null;
  const reviews = Array.isArray(data) ? data : [];
  const skiCount = Array.isArray(reviewDocument?.skis) ? reviewDocument.skis.length : reviews.length || 3;

  return {
    capability_id: unlocked.capability_id || extras.capability_id || 'ski-reviews',
    paid: unlocked.paid || '0.01',
    rail: unlocked.rail || 'tempo-testnet',
    reviews_unlocked: skiCount,
    reviews,
    reviewDocument,
    receipt: unlocked.receipt || null,
    fromCache: false,
    spent: true,
    reason: extras.reason || null,
  };
}

export function withMppSpendNotice(content, unlock) {
  if (!unlock?.spent) return content;
  const ref = unlock.receipt?.reference ? `\nTx: \`${unlock.receipt.reference}\`` : '';
  const notice = [
    '---',
    `🤖 **Agent spend:** I just paid **$${unlock.paid || '0.01'}** (OUSD on ${unlock.rail || 'tempo-testnet'}) via MPP to unlock \`${unlock.capability_id || 'ski-reviews'}\` and answer your question.${ref}`,
  ].join('\n');
  return `${content || ''}\n\n${notice}`;
}

async function decideUnlock({ userMessage, products, capabilities, lambdaEndpoint }) {
  const catalog = (products || [])
    .map((p) => `- ${p.id}: ${p.title} — $${p.price} — ${p.description || ''}`)
    .join('\n');
  const caps = (capabilities || [])
    .map((c) => `- ${c.id}: ${c.name} — ${c.description || ''}`)
    .join('\n');

  const firstRaw = await askModel(
    `Decide whether the free catalog can fully answer the shopper.

Free catalog:
${catalog || '(none)'}

Paid article, still locked:
${caps || '(none)'}

Shopper message:
"""${userMessage || ''}"""

unlock=false for "what do you have?", price, stock, cart, and checkout.
unlock=true for more detail, a comparison, a review, or who a ski is actually for.

Return ONLY JSON:
{"unlock":boolean,"capability_id":string|null,"reason":string}`,
    'Output JSON only. Listing the store is unlock=false. A request for detail or a comparison is unlock=true.',
    lambdaEndpoint,
  );

  const first = parseDecision(firstRaw);
  if (!first?.unlock) {
    return { unlock: false, capability_id: null, reason: first?.reason || 'catalog is enough' };
  }

  const vetoRaw = await askModel(
    `A judge wants to buy a paid ski review.

Shopper message:
"""${userMessage || ''}"""

Judge reason:
"""${first.reason || ''}"""

Veto only a catalog listing, a price, or stock.
"what skis do you have?" → {"unlock":false,"reason":"catalog list is enough"}
"tell me in lots of detail about them" → {"unlock":true,"reason":"blurbs are not a detailed account"}

If your reason says the catalog is not enough, unlock must be true.
Return ONLY JSON: {"unlock":boolean,"reason":string}`,
    'Output JSON only. Veto only catalog listings, price, and stock.',
    lambdaEndpoint,
  );

  const veto = parseDecision(vetoRaw);
  const vetoReason = veto?.reason || '';
  const reasonNeedsArticle =
    /goes beyond|beyond the (?:brief|short|free)|not (?:fully )?(?:in|provided by|covered by) the (?:free )?catalog|more than the (?:brief|short|one-line)|insufficient/i.test(
      vetoReason,
    );

  if (!veto || (!veto.unlock && !reasonNeedsArticle)) {
    console.log(`   🧠 Purchase vetoed — ${vetoReason || 'catalog already answers'}`);
    return { unlock: false, capability_id: null, reason: vetoReason || 'catalog already answers' };
  }

  return {
    unlock: true,
    capability_id: first.capability_id || capabilities?.[0]?.id || 'ski-reviews',
    reason: first.reason || vetoReason,
  };
}

/**
 * Called from chat. Returns null unless the wallet is set, the merchant
 * advertises a capability, and the model says the catalog is not enough.
 * Never throws — a Module 7 problem must not fail checkout chat.
 */
export async function maybeUnlockSkiReviews({ userMessage, products, merchantUrl, lambdaEndpoint }) {
  if (!isMppConfigured() || !merchantUrl || !userMessage) return null;

  let capabilities = [];
  try {
    const listed = await listCapabilities(merchantUrl);
    capabilities = listed.capabilities || [];
  } catch (err) {
    console.log(`   ⚠️ MPP discovery skipped: ${err.message}`);
    return null;
  }
  if (capabilities.length === 0) return null;

  try {
    console.log('   🧠 Asking model whether the catalog is enough…');
    const decision = await decideUnlock({
      userMessage,
      products,
      capabilities,
      lambdaEndpoint,
    });
    console.log(
      `   🧠 Capability decision: unlock=${decision.unlock} id=${decision.capability_id} — ${decision.reason}`,
    );
    if (!decision.unlock) return null;

    const capabilityId = decision.capability_id || 'ski-reviews';
    console.log(`   🤖 Catalog is not enough — acquiring ${capabilityId} via MPP`);
    const unlocked = await buyCapability(capabilityId, merchantUrl);
    const normalized = normalizeCapabilityUnlock(unlocked, {
      capability_id: capabilityId,
      reason: decision.reason,
    });
    console.log(`   ✅ MPP unlock loaded (${normalized.reviews_unlocked} skis)`);
    return normalized;
  } catch (err) {
    console.error(`   ❌ MPP unlock skipped: ${err.message}`);
    return null;
  }
}
