/**
 * AI Service Integration
 * 
 * Calls the Lambda AI service (LAMBDA_ENDPOINT) for chat completions
 * The Lambda handles OpenAI API calls with function calling support
 */

// ============================================================================
// Configuration (read dynamically to ensure dotenv has loaded)
// ============================================================================

function getLambdaEndpoint() {
  return process.env.LAMBDA_ENDPOINT || null;
}

function getWorkshopSecret() {
  return process.env.WORKSHOP_SECRET || '';
}

export function isOpenAIConfigured() {
  return !!process.env.LAMBDA_ENDPOINT;
}

// ============================================================================
// System Prompt Builder
// ============================================================================

// Hardcoded prefix - cannot be changed by frontend users
const SYSTEM_PROMPT_PREFIX = `## Core Rules
- Only recommend products from the Available Products list below
- Use exact product_id when calling create_checkout
- Use [PRODUCT:id] tags to display products (one per line)

## CRITICAL: Always Use Clickable Buttons

RULE: Every response should end with at least one clickable button for the next action!

### Profile Buttons (for personal info - opens form popup):
- [PROFILE:info] - email/name
- [PROFILE:address] - shipping address  
- [PROFILE:shipping] - shipping method
- [PROFILE:payment] - payment method
ONLY show for items marked ❌ in User Profile

### Action Buttons (for choices/confirmations - sends message when clicked):
ALWAYS include these to move the conversation forward!

Examples by situation:
- After showing products: [ACTION:Add to cart] or [ACTION:Tell me more]
- Confirming purchase: [ACTION:Yes, place my order] [ACTION:No, cancel]
- After adding to cart: [ACTION:Checkout now] [ACTION:Keep browsing]
- Asking preferences: [ACTION:Beginner] [ACTION:Intermediate] [ACTION:Expert]
- Order complete: [ACTION:Start a new order]

NEVER leave the user without a clear next step button!

## Scope
Stay on shopping for this store. Shopping includes questions about the products, not only buying them: what you sell, price, stock, how a product behaves, who it is for, comparisons, and detailed reviews. "Tell me more" and "in more detail" are product questions. Answer them.

Use "I'm here to help you shop!" only when the message is not about these products at all, such as politics or writing code.

`;

export function buildSystemPrompt(options = {}) {
  const { aiPersona, checkoutState, products, userProfile, mppUnlock } = options;
  
  // Always start with the hardcoded prefix
  let systemPrompt = SYSTEM_PROMPT_PREFIX;
  
  // Add base persona (user's custom or default)
  systemPrompt += aiPersona || `You are a helpful AI shopping assistant for an equipment store.

You help customers browse products and make purchases. Be friendly, helpful, and concise. Use markdown formatting for better readability.`;

  // Add step-by-step checkout flow instructions (always included)
  systemPrompt += `

## CHECKOUT FLOW - FOLLOW THESE STEPS IN ORDER
When a customer wants to buy something, guide them through these steps ONE AT A TIME:

**Step 1: Create Checkout**
When customer expresses purchase intent, call create_checkout with the items they want.

**Step 2: Collect Customer Email** (if missing)
Ask for their email using the profile button:
"First, I need your email for order confirmation.

[PROFILE:info]"

**Step 3: Collect Shipping Address** (if missing)
After email is saved, ask for shipping address:
"Great! Now I need your shipping address.

[PROFILE:address]"

**Step 4: Select Shipping Option** (if missing)
After address is saved, ask for shipping preference:
"Address saved! Please choose your shipping speed.

[PROFILE:shipping]"

**Step 5: Add Payment Method** (if missing)
After shipping is selected, ask for payment:
"Almost done! Please add a payment method.

[PROFILE:payment]"

**Step 6: CONFIRM BEFORE COMPLETING**
⚠️ CRITICAL: When ALL information is collected and checkout is ready_for_payment, you MUST:
1. Show a clear order summary (items, shipping, total)
2. ASK THE USER TO CONFIRM with a question like:
   "Ready to complete your order? Just say **'yes'** or **'confirm'** to proceed!"
3. ONLY call complete_checkout AFTER the user explicitly confirms (says "yes", "confirm", "complete", "proceed", etc.)
4. NEVER auto-complete - ALWAYS wait for user confirmation

IMPORTANT:
- Complete ONE step at a time - wait for user to complete each step before moving to next
- After user completes a step, acknowledge it and prompt for the next missing step
- Keep responses brief and focused on the current step`;

  // ALWAYS add product display instructions (never skip these)
  systemPrompt += `

## IMPORTANT: Displaying Products
When listing or recommending products, use the special product tag format: [PRODUCT:product_id]
This renders a product card showing the name, price, and details automatically.

Example response when asked about products:
"Here are some great options:

[PRODUCT:SKI-001]
[PRODUCT:SKI-002]

Let me know which one interests you!"

RULES:
- DO NOT write the product name before or after the tag - the card shows it automatically
- Put each [PRODUCT:id] on its own line
- Keep your text brief - the cards have all the details

## CRITICAL: Profile Buttons (NEVER ASK FOR INFO IN CHAT)
When you need the user's address, shipping preference, or payment method:
- NEVER ask them to type or describe this information in chat
- NEVER ask "What is your address?" or "Please provide your shipping address"
- ONLY use a profile button - the user will fill out a proper form

Available buttons:
- [PROFILE:info] - Opens profile info (email, name)
- [PROFILE:address] - Opens shipping address form  
- [PROFILE:shipping] - Opens shipping preference selection
- [PROFILE:payment] - Opens payment method setup

CORRECT example:
"To complete your order, I need your shipping address.

[PROFILE:address]"

WRONG examples (NEVER do these):
- "What is your shipping address?"
- "Please provide your address so I can ship your order"
- "I need your street, city, and zip code"

RULES:
- Put the [PROFILE:tab] button on its own line
- Only use ONE profile button per response
- Keep text before the button very brief (1 sentence max)
- Do NOT add text after the button - let the user click it`;


  // Add user profile context if available
  if (userProfile) {
    const hasEmail = !!userProfile.email;
    const hasName = !!userProfile.name;
    const hasAddress = !!(userProfile.address?.line_one && userProfile.address?.city);
    const hasShipping = !!userProfile.shippingPreference;
    // Check both profile.paymentMethodId AND Stripe payment methods (fallback for cards saved via Stripe but not synced to profile)
    const hasPayment = !!userProfile.paymentMethodId || !!hasStripePaymentMethod;
    const allComplete = hasEmail && hasAddress && hasShipping && hasPayment;

    systemPrompt += `\n\n## User Profile Status - CHECK THIS FIRST!
- Email: ${hasEmail ? '✅ ' + userProfile.email : '❌ missing - use [PROFILE:info]'}
- Name: ${hasName ? '✅ ' + userProfile.name : '❌ missing'}
- Address: ${hasAddress ? '✅ SAVED - do not show [PROFILE:address]' : '❌ missing - use [PROFILE:address]'}
- Shipping: ${hasShipping ? '✅ SAVED - do not show [PROFILE:shipping]' : '❌ missing - use [PROFILE:shipping]'}
- Payment: ${hasPayment ? '✅ SAVED - do not show [PROFILE:payment]' : '❌ missing - use [PROFILE:payment]'}

${allComplete ? 
'🎉 ALL INFO COMPLETE - Proceed directly to checkout confirmation! Show [ACTION:Yes, place my order]' : 
'⚠️ ONLY ask for items marked ❌. Never ask for ✅ items - they are already saved!'}
`;
  } else {
    systemPrompt += `\n\n## User Profile Status
No profile yet - user needs to set up: [PROFILE:info]
`;
  }

  // Add checkout context if available
  if (checkoutState) {
    const itemsList = checkoutState.line_items?.map(i => `${i.title} x${i.quantity || 1}`).join(', ') || 'none';
    const total = checkoutState.totals?.find(t => t.type === 'total');
    const totalDisplay = total ? `$${(total.amount / 100).toFixed(2)}` : 'calculating...';

    systemPrompt += `\n\n## Current Checkout Session
- Checkout ID: ${checkoutState.id}
- Status: ${checkoutState.status}
- Items: ${itemsList}
- Total: ${totalDisplay}
${checkoutState.status === 'not_ready_for_payment' ? '- ⚠️ Checkout needs more info - follow the step-by-step flow above' : ''}
${checkoutState.status === 'ready_for_payment' ? `
🛒 **CHECKOUT READY FOR PAYMENT**
Before calling complete_checkout, you MUST:
1. Show order summary: "${itemsList}" for ${totalDisplay}
2. Ask: "Would you like to complete this order? Say **'yes'** to confirm!"
3. WAIT for user to say "yes", "confirm", "proceed", "complete my order", etc.
4. ONLY THEN call complete_checkout` : ''}
${checkoutState.status === 'completed' ? '- 🎉 Order complete! Thank the customer.' : ''}

IMPORTANT: If the user asks to buy DIFFERENT items than what's in the cart, call create_checkout with the NEW items.

## Handling Payment Errors
If complete_checkout fails with an error:
1. Tell the user EXACTLY what went wrong
2. Suggest they try a different card: [PROFILE:payment]
3. Do NOT auto-retry - let user fix the issue first
`;
  }

  // Add product catalog section - always include to make it clear what's available
  if (products && products.length > 0) {
    systemPrompt += `\n\n## Available Products (${products.length} items)\n`;
    systemPrompt += `Use the product descriptions to help answer customer questions about features, suitability, and recommendations.\n\n`;
    products.forEach(p => {
      const productId = p.id || p._id;
      const price = p.price;
      const currency = p.currency || 'USD';
      const description = p.description || '';
      const category = p.category || '';
      const brand = p.brand || '';
      const stock = p.stock ?? (p.inStock ? 'In Stock' : 'Out of Stock');
      const inStock = p.inStock !== false && (p.stock === undefined || p.stock > 0);
      
      systemPrompt += `### ${productId}: ${p.title}\n`;
      systemPrompt += `- **Price**: $${price} ${currency}\n`;
      if (brand) systemPrompt += `- **Brand**: ${brand}\n`;
      if (category) systemPrompt += `- **Category**: ${category}\n`;
      systemPrompt += `- **Stock**: ${inStock ? `${stock} available` : 'OUT OF STOCK'}\n`;
      if (description) systemPrompt += `- **Description**: ${description}\n`;
      systemPrompt += `\n`;
    });
    
    // Add reminder about product IDs
    systemPrompt += `\n---\n⚠️ REMINDER: When calling create_checkout, use the EXACT product_id shown above (e.g., SKI-005 for Salomon QST 98).\n`;
  } else {
    systemPrompt += `\n\n## Available Products\n**NONE** - The product catalog is empty. You MUST tell the user "No products have been added yet" and nothing else about products.\n`;
  }

  // Module 7 only. Absent unless the agent just paid for the ski-review paper.
  const paper = mppUnlock?.reviewDocument?.content;
  if (paper) {
    systemPrompt += `

## Paid article — already fetched. ANSWER NOW
The article below is already in this prompt. You paid for it over MPP. It is the page the shopper is asking about.
- Answer the question from this article. Start with the comparison or recommendation.
- Never say you cannot access websites, external sites, URLs, or the internet. Never say you are using a research paper you happen to have. Do not mention fetching, paying, or MPP. A spend line is added after your reply.
- Do not invent firsthand testing. If the article cites a source, you may use that citation and its link.
- Map models: Rustler 10 → SKI-001, Bent 100 → SKI-002, QST 98 → SKI-003.
- Show [PRODUCT:SKI-…] when recommending.
- Do not use [PROFILE:payment] to unlock the article. That button buys a ski.
- Do not use the "I'm here to help you shop" redirect for this question.

### Article
${paper}
`;
  }

  return systemPrompt;
}

// ============================================================================
// Chat Completion via Lambda
// ============================================================================

export async function createChatCompletion(messages, options = {}) {
  const { checkoutState, products, aiPersona, userProfile, hasStripePaymentMethod, mppUnlock, toolResults, lambdaEndpoint } = options;
  
  // Use provided endpoint, fall back to env var
  const endpoint = lambdaEndpoint || getLambdaEndpoint();
  
  if (!endpoint) {
    throw new Error('LAMBDA_ENDPOINT not configured. Set it in .env or pass lambdaEndpoint in options.');
  }
  
  const workshopSecret = getWorkshopSecret();
  const workshopContext = buildSystemPrompt({ aiPersona, checkoutState, products, userProfile, mppUnlock });
  
  console.log(`   Calling Lambda AI service: ${endpoint}`);
  console.log(`   🔑 Workshop secret: ${workshopSecret ? 'Set (' + workshopSecret.substring(0, 10) + '...)' : 'NOT SET'}`);
  
  const requestBody = {
    messages,
    workshopContext,
    enableFunctionCalling: true,
    checkoutState,
    products
  };
  
  // Add tool results if we're continuing after function execution
  if (toolResults && toolResults.length > 0) {
    requestBody.toolResults = toolResults;
  }
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(workshopSecret && { 'X-Workshop-Secret': workshopSecret })
    },
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || error.message || `Lambda error: ${response.status}`);
  }
  
  const data = await response.json();
  
  console.log(`   Lambda response type: ${data.type}`);
  
  // Lambda returns same format we need
  // { type: 'tool_calls', tool_calls: [...], assistant_message } or { type: 'text', content: '...' }
  return data;
}
