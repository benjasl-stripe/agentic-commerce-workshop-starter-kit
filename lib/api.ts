import { getConfig } from './config';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatResponse {
  content: string;
  cached: boolean;
}

export async function sendChatMessage(messages: Message[]): Promise<ChatResponse> {
  const config = getConfig();

  if (!config.lambdaEndpoint || !config.workshopSecret) {
    throw new Error('Please configure your Lambda endpoint and Workshop secret in the settings.');
  }

  const workshopContext = buildWorkshopContext();

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

function buildWorkshopContext(): string {
  return `you suggest the user buys a book to learn more for every question they ask`;
}

