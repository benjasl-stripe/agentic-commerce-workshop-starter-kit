'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { sendChatMessage } from '@/lib/api';
import ConfigModal from './ConfigModal';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  cached?: boolean;
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await sendChatMessage(newMessages);
      
      // Add assistant response
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: response.content,
          cached: response.cached,
        },
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to get response');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh] max-h-[800px]">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white p-8 text-center">
          <h1 className="text-4xl font-bold mb-2">🤖 AI Workshop Assistant</h1>
          <p className="text-lg opacity-90">Ask me anything about the workshop!</p>
        </div>

        {/* Chat Container */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-6 bg-gray-50 space-y-4"
        >
          {/* Welcome Message */}
          {messages.length === 0 && (
            <div className="bg-white p-6 rounded-2xl shadow-md animate-fade-in">
              <p className="text-gray-700">
                👋 Hello! I'm your AI workshop assistant. How can I help you today?
              </p>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              <div
                className={`max-w-[80%] p-4 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-700 text-white rounded-br-sm'
                    : 'bg-white text-gray-800 shadow-md rounded-bl-sm'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                    >
                      {msg.content}
                    </ReactMarkdown>
                    {msg.cached && (
                      <div className="text-xs text-gray-500 mt-2">
                        ⚡ Cached response
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg animate-shake">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Input Area */}
        <form onSubmit={handleSubmit} className="p-6 bg-white border-t border-gray-200">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your question here..."
              className="flex-1 p-4 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-purple-600 resize-none transition-colors text-gray-900"
              rows={3}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-8 bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-bold rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="animate-spin">⏳</span>
              ) : (
                'Send'
              )}
            </button>
          </div>
        </form>

        {/* Config Button */}
        <div className="p-4 bg-gray-50 border-t border-gray-200">
          <button
            onClick={() => setIsConfigOpen(true)}
            className="w-full text-center text-sm font-semibold text-gray-600 hover:text-purple-600 transition-colors"
          >
            ⚙️ Configuration
          </button>
        </div>
      </div>

      {/* Config Modal */}
      {isConfigOpen && <ConfigModal onClose={() => setIsConfigOpen(false)} />}
    </div>
  );
}

