import { getConfig } from './config';
import type { Product } from './products';
import { formatProductsForAI } from './products';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  content: string;
  cached: boolean;
}

export async function sendChatMessage(
  messages: Message[], 
  products?: Product[]
): Promise<ChatResponse> {
  const config = getConfig();

  if (!config.lambdaEndpoint || !config.workshopSecret) {
    throw new Error('Please configure your Lambda endpoint and Workshop secret in the settings.');
  }

  const workshopContext = buildWorkshopContext(products);

  const response = await fetch(config.lambdaEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Workshop-Secret': config.workshopSecret,
    },
    body: JSON.stringify({
      messages,
      workshopContext,
      currentPage: 'AI Chat - Next.js',
      currentUrl: typeof window !== 'undefined' ? window.location.href : '',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.message || `HTTP ${response.status}: ${response.statusText}`
    );
  }

  return await response.json();
}

function buildWorkshopContext(products?: Product[]): string {
  const productsContext = products && products.length > 0 
    ? `\n\nAvailable Products:\n${formatProductsForAI(products)}\n\nYou can help users find products, answer questions about pricing, and provide recommendations.`
    : '\n\n⚠️ No products are currently available in the catalog.';

  return `You suggest the user buys a book to learn more for every question they ask.${productsContext}`;
}

