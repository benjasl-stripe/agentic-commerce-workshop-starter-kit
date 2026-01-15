/**
 * Chat Route with AI-Powered Function Calling
 * 
 * Handles AI chat by proxying to Lambda and executing ACP function calls
 */

import express from 'express';
import { 
  createCheckout, 
  getCheckout, 
  updateCheckout, 
  completeCheckout, 
  cancelCheckout 
} from './checkout.js';
import { createSPT, getCustomerPaymentMethods } from './payment.js';
import { getPendingLogs } from '../lib/acp-call-logger.js';

const router = express.Router();

// ============================================================================
// Function Executors - Execute ACP operations based on AI decisions
// ============================================================================

/**
 * Execute a function call from the AI
 */
async function executeFunction(name, args, context) {
  console.log(`🔧 Executing function: ${name}`);
  console.log('   Arguments:', JSON.stringify(args, null, 2));
  
  try {
    switch (name) {
      case 'create_checkout': {
        // Map product_id to id format expected by checkout
        const items = args.items.map(item => ({
          id: item.product_id,
          quantity: item.quantity || 1
        }));
        
        const buyer = args.buyer_email ? { email: args.buyer_email } : undefined;
        const result = await createCheckout(items, buyer);
        
        console.log(`   ✅ Checkout created: ${result.id}`);
        return {
          success: true,
          checkout: result,
          message: `Checkout ${result.id} created successfully`
        };
      }
      
      case 'get_checkout': {
        const result = await getCheckout(args.checkout_id);
        console.log(`   ✅ Retrieved checkout: ${args.checkout_id}`);
        return {
          success: true,
          checkout: result
        };
      }
      
      case 'update_checkout': {
        const updates = {};
        
        if (args.shipping_address) {
          updates.fulfillmentAddress = {
            name: args.shipping_address.name || 'Customer',
            line_one: args.shipping_address.line_one,
            line_two: args.shipping_address.line_two,
            city: args.shipping_address.city,
            state: args.shipping_address.state,
            postal_code: args.shipping_address.postal_code,
            country: args.shipping_address.country || 'US'
          };
        }
        
        if (args.fulfillment_option_id) {
          updates.fulfillmentOptionId = args.fulfillment_option_id;
        }
        
        // Default to standard shipping if address provided but no option
        if (updates.fulfillmentAddress && !updates.fulfillmentOptionId) {
          updates.fulfillmentOptionId = 'shipping_standard';
        }
        
        const result = await updateCheckout(args.checkout_id, updates);
        console.log(`   ✅ Checkout updated: ${args.checkout_id}, status: ${result.status}`);
        return {
          success: true,
          checkout: result,
          message: `Checkout updated. Status: ${result.status}`
        };
      }
      
      case 'complete_checkout': {
        // Get the user email from context to create SPT
        const email = context.userEmail;
        
        if (!email) {
          console.log('   ⚠️ No user email for payment');
          return {
            success: false,
            error: 'No user email available for payment',
            action_required: 'request_payment_method'
          };
        }
        
        // Check if user has a payment method
        try {
          const paymentMethods = await getCustomerPaymentMethods(email);
          if (!paymentMethods || paymentMethods.length === 0) {
            console.log('   ⚠️ No payment method on file');
            return {
              success: false,
              error: 'No payment method on file',
              action_required: 'request_payment_method'
            };
          }
          
          // Get checkout details to determine the amount for SPT
          const checkout = await getCheckout(args.checkout_id);
          const totalAmount = checkout.totals?.find(t => t.type === 'total')?.amount || 10000;
          const currency = checkout.currency || 'usd';
          
          console.log(`   💰 Checkout total: ${totalAmount} ${currency}`);
          
          // Create SPT with proper usage limits
          const spt = await createSPT(email, totalAmount, currency, args.checkout_id);
          console.log(`   🔐 SPT created: ${spt.token.substring(0, 30)}...`);
          
          const result = await completeCheckout(args.checkout_id, spt.token);
          console.log(`   ✅ Checkout completed: ${args.checkout_id}`);
          
          return {
            success: true,
            checkout: result,
            sptUsed: spt.token.substring(0, 20) + '...',
            message: 'Order completed successfully!'
          };
        } catch (err) {
          console.log(`   ❌ Payment error: ${err.message}`);
          return {
            success: false,
            error: err.message,
            action_required: 'request_payment_method'
          };
        }
      }
      
      case 'cancel_checkout': {
        const result = await cancelCheckout(args.checkout_id);
        console.log(`   ✅ Checkout cancelled: ${args.checkout_id}`);
        return {
          success: true,
          checkout: result,
          message: 'Checkout cancelled'
        };
      }
      
      case 'set_user_email': {
        console.log('   📧 Setting user email:', args.email);
        // Update context so subsequent calls use this email
        context.userEmail = args.email;
        return {
          success: true,
          email: args.email,
          action: 'update_email',
          message: `Email set to ${args.email}`
        };
      }
      
      case 'request_payment_method': {
        console.log('   💳 Checking payment methods');
        const email = context.userEmail;
        
        if (!email) {
          console.log('   ⚠️ No user email - cannot check payment methods');
          return {
            success: false,
            has_payment_method: false,
            error: 'Need user email first',
            action_required: 'set_user_email'
          };
        }
        
        // Check if user already has payment methods on file
        try {
          const existingMethods = await getCustomerPaymentMethods(email);
          if (existingMethods && existingMethods.length > 0) {
            console.log(`   ✅ Customer has ${existingMethods.length} payment method(s) on file`);
            return {
              success: true,
              has_payment_method: true,
              message: 'Customer already has payment method on file',
              methods: existingMethods.map(pm => ({
                id: pm.id,
                brand: pm.card?.brand,
                last4: pm.card?.last4
              }))
            };
          }
        } catch (err) {
          console.log(`   ⚠️ Could not check payment methods: ${err.message}`);
        }
        
        // No payment method found - show the collection form
        console.log('   💳 No payment method on file - requesting payment setup');
        return {
          success: true,
          has_payment_method: false,
          action: 'show_payment_setup',
          message: args.reason || 'Please add a payment method to continue'
        };
      }
      
      default:
        console.log(`   ❌ Unknown function: ${name}`);
        return {
          success: false,
          error: `Unknown function: ${name}`
        };
    }
  } catch (error) {
    console.error(`   ❌ Function error:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// Message Sanitization
// ============================================================================

/**
 * Sanitize messages to remove incomplete tool call sequences
 * 
 * When a function call fails, the conversation may contain an assistant message
 * with tool_calls but no corresponding tool response. OpenAI requires that every
 * assistant message with tool_calls is followed by tool messages for each call.
 * 
 * This function removes any assistant messages with tool_calls that don't have
 * matching tool responses.
 */
function sanitizeMessages(messages) {
  const sanitized = [];
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    
    // If this is an assistant message with tool_calls
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      // Check if all tool_calls have corresponding tool responses after this message
      const toolCallIds = new Set(msg.tool_calls.map(tc => tc.id));
      let allResponded = true;
      
      // Look for tool messages that follow this assistant message
      for (let j = i + 1; j < messages.length && messages[j].role === 'tool'; j++) {
        if (messages[j].tool_call_id) {
          toolCallIds.delete(messages[j].tool_call_id);
        }
      }
      
      // If there are unresponded tool calls, skip this message
      if (toolCallIds.size > 0) {
        console.log(`   ⚠️ Removing incomplete tool_calls message (missing: ${Array.from(toolCallIds).join(', ')})`);
        continue;
      }
    }
    
    // If this is a tool message, check if its corresponding assistant message was kept
    if (msg.role === 'tool') {
      // Find the preceding assistant message
      let hasMatchingAssistant = false;
      for (let j = sanitized.length - 1; j >= 0; j--) {
        if (sanitized[j].role === 'assistant' && sanitized[j].tool_calls) {
          if (sanitized[j].tool_calls.some(tc => tc.id === msg.tool_call_id)) {
            hasMatchingAssistant = true;
            break;
          }
        }
        // Stop looking if we hit a non-assistant/non-tool message
        if (sanitized[j].role !== 'assistant' && sanitized[j].role !== 'tool') {
          break;
        }
      }
      
      if (!hasMatchingAssistant) {
        console.log(`   ⚠️ Removing orphan tool message (${msg.tool_call_id})`);
        continue;
      }
    }
    
    sanitized.push(msg);
  }
  
  return sanitized;
}

// ============================================================================
// Chat Route
// ============================================================================

/**
 * POST /api/chat
 * Send a message and get AI response with function calling
 */
router.post('/', async (req, res) => {
  try {
    const { messages, checkoutState, userEmail, aiPersona } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array required' });
    }
    
    // Sanitize messages: Remove any assistant messages with tool_calls
    // that don't have corresponding tool responses
    // This prevents issues from previous failed function call sequences
    const sanitizedMessages = sanitizeMessages(messages);
    
    console.log('\n📨 Chat request received');
    console.log('   Messages:', messages.length, sanitizedMessages.length !== messages.length ? `(sanitized to ${sanitizedMessages.length})` : '');
    console.log('   Checkout:', checkoutState?.id || 'none');
    console.log('   User:', userEmail || 'anonymous');
    console.log('   AI Persona:', aiPersona ? `${aiPersona.substring(0, 50)}...` : 'default');
    
    const LAMBDA_ENDPOINT = process.env.LAMBDA_ENDPOINT;
    const WORKSHOP_SECRET = process.env.WORKSHOP_SECRET;
    
    if (!LAMBDA_ENDPOINT || !WORKSHOP_SECRET) {
      console.log('⚠️ Lambda not configured, using fallback');
      return res.json({
        content: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
        checkoutState,
        acpLogs: getPendingLogs()
      });
    }
    
    // Fetch products for context
    let products = [];
    try {
      const MERCHANT_API_URL = process.env.MERCHANT_API_URL || 'http://localhost:4000';
      const productsResponse = await fetch(`${MERCHANT_API_URL}/api/products`);
      if (productsResponse.ok) {
        const data = await productsResponse.json();
        products = data.products || [];
      }
    } catch (err) {
      console.log('Could not fetch products:', err.message);
    }
    
    // Context for function execution
    const context = {
      userEmail,
      checkoutState
    };
    
    // Track the current checkout state and user email
    let currentCheckout = checkoutState;
    let showPaymentSetup = false;
    let updatedEmail = null;
    
    // Conversation messages for the loop (use sanitized messages)
    let conversationMessages = [...sanitizedMessages];
    
    // Maximum function call iterations to prevent infinite loops
    const MAX_ITERATIONS = 5;
    let iterations = 0;
    
    // Function calling loop
    while (iterations < MAX_ITERATIONS) {
      iterations++;
      console.log(`\n🔄 Lambda call iteration ${iterations}`);
      
      try {
        const lambdaResponse = await fetch(LAMBDA_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Workshop-Secret': WORKSHOP_SECRET,
          },
          body: JSON.stringify({
            messages: conversationMessages,
            enableFunctionCalling: true,
            checkoutState: currentCheckout,
            products,
            workshopContext: aiPersona || null,
            currentPage: 'Agent Service',
            currentUrl: 'http://localhost:3001',
          }),
        });
        
        if (!lambdaResponse.ok) {
          const errorText = await lambdaResponse.text();
          console.error('Lambda error:', lambdaResponse.status, errorText);
          throw new Error(`Lambda error: ${lambdaResponse.status}`);
        }
        
        const data = await lambdaResponse.json();
        console.log('   Response type:', data.type);
        
        // Check if AI wants to call functions
        if (data.type === 'tool_calls' && data.tool_calls) {
          console.log('   Tool calls received:');
          data.tool_calls.forEach(tc => {
            console.log(`      - ${tc.name} (id: ${tc.id})`);
          });
          
          // Add assistant message with tool calls to conversation
          console.log('   Assistant message tool_calls IDs:', 
            data.assistant_message?.tool_calls?.map(tc => tc.id) || 'none');
          conversationMessages.push(data.assistant_message);
          
          // Execute each function and collect results
          const toolResults = [];
          
          for (const toolCall of data.tool_calls) {
            const result = await executeFunction(toolCall.name, toolCall.arguments, context);
            
            toolResults.push({
              tool_call_id: toolCall.id,
              result
            });
            
            // Update checkout state if returned
            if (result.checkout) {
              currentCheckout = result.checkout;
              context.checkoutState = currentCheckout;
            }
            
            // Check if we need to show payment setup
            if (result.action === 'show_payment_setup') {
              showPaymentSetup = true;
            }
            
            // Check if email was updated
            if (result.action === 'update_email' && result.email) {
              updatedEmail = result.email;
            }
          }
          
          // Add tool result messages to conversation BEFORE sending to Lambda
          for (const toolResult of toolResults) {
            conversationMessages.push({
              role: 'tool',
              tool_call_id: toolResult.tool_call_id,
              content: JSON.stringify(toolResult.result)
            });
          }
          
          // Send tool results back to Lambda
          console.log('📤 Sending tool results to Lambda:');
          console.log('   Tool results:', toolResults.map(tr => ({ id: tr.tool_call_id, result: tr.result?.success })));
          console.log('   Conversation now has', conversationMessages.length, 'messages');
          console.log('   Last 2 messages:', conversationMessages.slice(-2).map(m => m.role));
          
          // Debug: Log all assistant messages with tool_calls
          console.log('   📋 Messages being sent to Lambda:');
          conversationMessages.forEach((msg, i) => {
            if (msg.role === 'assistant' && msg.tool_calls) {
              console.log(`      [${i}] assistant with tool_calls:`, msg.tool_calls.map(tc => tc.id));
            } else if (msg.role === 'tool') {
              console.log(`      [${i}] tool response for:`, msg.tool_call_id);
            } else {
              console.log(`      [${i}] ${msg.role}`);
            }
          });
          
          const continueResponse = await fetch(LAMBDA_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Workshop-Secret': WORKSHOP_SECRET,
            },
            body: JSON.stringify({
              messages: conversationMessages,
              enableFunctionCalling: true,
              checkoutState: currentCheckout,
              products,
              workshopContext: aiPersona || null,
              currentPage: 'Agent Service',
              currentUrl: 'http://localhost:3001',
            }),
          });
          
          if (!continueResponse.ok) {
            throw new Error(`Lambda continue error: ${continueResponse.status}`);
          }
          
          const continueData = await continueResponse.json();
          
          // If we got a text response, we're done
          if (continueData.type === 'text') {
            console.log('   ✅ Got final text response');
            return res.json({
              content: continueData.content,
              checkoutState: currentCheckout,
              showPaymentSetup,
              updatedEmail,
              acpLogs: getPendingLogs()
            });
          }
          
          // If we got more tool calls, we need to execute them too
          if (continueData.type === 'tool_calls' && continueData.tool_calls) {
            console.log('   🔄 Got more tool calls:', continueData.tool_calls.map(tc => tc.name).join(', '));
            
            // Add the new assistant message with tool_calls
            conversationMessages.push(continueData.assistant_message);
            
            // Execute these new tool calls
            const newToolResults = [];
            for (const toolCall of continueData.tool_calls) {
              const result = await executeFunction(toolCall.name, toolCall.arguments, context);
              
              newToolResults.push({
                tool_call_id: toolCall.id,
                result
              });
              
              // Update checkout state if returned
              if (result.checkout) {
                currentCheckout = result.checkout;
                context.checkoutState = currentCheckout;
              }
              
              // Check if we need to show payment setup
              if (result.action === 'show_payment_setup') {
                showPaymentSetup = true;
              }
              
              // Check if email was updated
              if (result.action === 'update_email' && result.email) {
                updatedEmail = result.email;
              }
            }
            
            // Add the tool results to conversation
            for (const toolResult of newToolResults) {
              conversationMessages.push({
                role: 'tool',
                tool_call_id: toolResult.tool_call_id,
                content: JSON.stringify(toolResult.result)
              });
            }
            
            // Continue the loop to get the final response
            continue;
          }
          
        } else if (data.type === 'text') {
          // Got a text response, we're done
          console.log('   ✅ Text response received');
          return res.json({
            content: data.content,
            checkoutState: currentCheckout,
            showPaymentSetup,
            updatedEmail,
            acpLogs: getPendingLogs()
          });
        }
        
      } catch (err) {
        console.error('Lambda call failed:', err.message);
        return res.json({
          content: generateFallbackResponse(messages[messages.length - 1]?.content || ''),
          checkoutState: currentCheckout,
          updatedEmail,
          error: err.message,
          acpLogs: getPendingLogs()
        });
      }
    }
    
    // If we hit max iterations, return what we have
    console.log('⚠️ Max iterations reached');
    return res.json({
      content: "I've processed your request. Is there anything else you'd like help with?",
      checkoutState: currentCheckout,
      updatedEmail,
      acpLogs: getPendingLogs()
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate fallback response when Lambda is not available
 */
function generateFallbackResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('buy') || lowerMessage.includes('purchase') || lowerMessage.includes('order')) {
    return `I'd love to help you make a purchase! However, the AI service is currently unavailable.

Please try again in a moment, or configure the Lambda endpoint in the settings.`;
  }
  
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi') || lowerMessage.includes('hey')) {
    return `Hello! 👋 Welcome to our bookstore!

I can help you browse and purchase books. The AI service is currently not configured, but you can still explore our products.`;
  }
  
  return `I'm your AI shopping assistant! 

To use the full checkout functionality, please ensure the Lambda endpoint is configured in your settings.`;
}

export default router;
