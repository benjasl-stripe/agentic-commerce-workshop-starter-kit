/**
 * MPP client for Module 6 (Tempo testnet).
 *
 * Safe to ship in the starter kit: nothing here runs during Modules 1–5.
 * Chat only calls maybeUnlockSkiReviews when AGENT_TEMPO_PRIVATE_KEY is set.
 * The paid resource is the hosted Contents Not Dead article, not the local merchant.
 * Any failure is skipped so checkout still works.
 *
 * mppx is imported inside payUrl, not at startup. Install it in Module 6:
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

export const HOSTED_ARTICLE = {
  id: 'agentic-ski-shopping',
  name: 'Three Skis Worth Sending Your Agent After',
  description:
    'Paid article comparing the catalog skis: who each is for and how they differ. Not in the free blurbs. $0.50 on Tempo testnet. No account or API key.',
};

const DEFAULT_CONTENT_URL = 'https://api.contentsnotdead.com/api/content/agentic-ski-shopping';

export function contentUrl() {
  return process.env.MPP_CONTENT_URL?.trim() || DEFAULT_CONTENT_URL;
}

async function payUrl(url) {
  const mppx = await loadMppx();
  const key = process.env.AGENT_TEMPO_PRIVATE_KEY;
  if (!key?.startsWith('0x')) {
    throw new Error('Set AGENT_TEMPO_PRIVATE_KEY to a faucet-funded Tempo testnet key');
  }
  const account = mppx.privateKeyToAccount(key);

  console.log('🤖 Agent acquiring article via MPP (Tempo testnet)');
  console.log(`   payer: ${account.address}`);
  console.log(`   GET ${url}  (expect 402 → micropay → retry)`);

  const response = await createClient(mppx, account).fetch(url);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MPP unlock failed (${response.status}): ${body}`);
  }

  const receipt = mppx.Receipt.fromResponse(response);
  if (receipt) {
    console.log(`   🧾 Payment-Receipt: status=${receipt.status} ref=${receipt.reference}`);
  }

  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : await response.text();
  console.log('   ✅ Article unlocked via MPP');
  return { body, receipt };
}

/** Pay the hosted article. The body may be markdown. No local merchant. */
export async function buyContentUrl(url) {
  const paid = await payUrl(url);
  if (typeof paid.body === 'string') {
    return {
      capability_id: 'agentic-ski-shopping',
      paid: '0.50',
      rail: 'tempo-testnet',
      data: {
        format: 'markdown',
        title: "Three Skis Worth Sending Your Agent After",
        content: paid.body,
      },
      receipt: paid.receipt,
      fromCache: false,
    };
  }
  const result = paid.body && typeof paid.body === 'object' ? paid.body : {};
  if (typeof result.content === 'string' && !result.data) {
    result.data = {
      format: 'markdown',
      title: result.title || "Three Skis Worth Sending Your Agent After",
      content: result.content,
    };
  }
  return {
    capability_id: 'agentic-ski-shopping',
    paid: '0.50',
    rail: 'tempo-testnet',
    ...result,
    receipt: paid.receipt,
    fromCache: false,
  };
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

function withoutAccessDisclaimer(content) {
  if (!content) return content;
  return content
    .replace(
      /^(?:I (?:can(?:'|no)t|cannot|am unable to) (?:access|browse|visit|open)[\s\S]{0,500}?(?:research paper|article)[\s\S]{0,240}?:\s*)/i,
      '',
    )
    .trim();
}

export function withMppSpendNotice(content, unlock) {
  if (!unlock?.spent) return content;
  content = withoutAccessDisclaimer(content);
  const ref = unlock.receipt?.reference ? `\nTx: \`${unlock.receipt.reference}\`` : '';
  const notice = [
    '---',
    `🤖 **Agent spend:** I just paid **$${unlock.paid || '0.50'}** on Tempo testnet via MPP to unlock \`${unlock.capability_id || 'agentic-ski-shopping'}\` and answer your question.${ref}`,
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
 * Called from chat. Returns null unless the wallet is set and the model
 * says the catalog is not enough. Pays the hosted article, never the local merchant.
 * Never throws — a Module 6 problem must not fail checkout chat.
 */
export async function maybeUnlockSkiReviews({ userMessage, products, lambdaEndpoint }) {
  if (!isMppConfigured() || !userMessage) return null;
  const url = contentUrl();

  try {
    console.log('   🧠 Asking model whether the catalog is enough…');
    const decision = await decideUnlock({
      userMessage,
      products,
      capabilities: [HOSTED_ARTICLE],
      lambdaEndpoint,
    });
    console.log(
      `   🧠 Capability decision: unlock=${decision.unlock} id=${decision.capability_id} — ${decision.reason}`,
    );
    if (!decision.unlock) return null;

    const capabilityId = HOSTED_ARTICLE.id;
    console.log(`   🤖 Catalog is not enough — acquiring ${url} via MPP`);
    const unlocked = await buyContentUrl(url);
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
