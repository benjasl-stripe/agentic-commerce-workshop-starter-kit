import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import ProductCard from './ProductCard';
import { Product } from '@/lib/products';

interface MessageRendererProps {
  content: string;
  products: Product[];
  onOpenProfile?: (tab: 'info' | 'address' | 'shipping' | 'payment') => void;
  onProductClick?: (product: Product) => void;
  onActionClick?: (action: string) => void;
}

const markdownComponents = {
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mb-3 last:mb-0 text-[15px] leading-7 text-gray-800">{children}</p>
  ),
  h1: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-4 mb-2 first:mt-0 text-base font-semibold leading-snug text-gray-950">{children}</h2>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-4 mb-2 first:mt-0 text-[15px] font-semibold leading-snug text-gray-950">{children}</h3>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h4 className="mt-4 mb-1.5 first:mt-0 text-[15px] font-semibold leading-snug text-gray-950">{children}</h4>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mb-3 ml-5 list-disc space-y-1.5 text-[15px] leading-7 text-gray-800">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mb-3 ml-5 list-decimal space-y-1.5 text-[15px] leading-7 text-gray-800">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="pl-1">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-gray-950">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-4 border-gray-200" />,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a href={href} className="text-indigo-700 underline underline-offset-2" target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-3 border-l-2 border-indigo-200 pl-3 text-gray-600">{children}</blockquote>
  ),
  code: ({ className, children }: { className?: string; children?: ReactNode }) =>
    className ? (
      <code className={className}>{children}</code>
    ) : (
      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[13px] text-gray-900">{children}</code>
    ),
};

// Profile button labels and icons
const PROFILE_BUTTONS: Record<string, { label: string; icon: string }> = {
  info: { label: 'Set Up Your Profile', icon: '👤' },
  address: { label: 'Add Shipping Address', icon: '📍' },
  shipping: { label: 'Choose Shipping Method', icon: '🚚' },
  payment: { label: 'Add Payment Method', icon: '💳' },
};

export default function MessageRenderer({ content, products, onOpenProfile, onProductClick, onActionClick }: MessageRendererProps) {
  // Parse content for product, profile, and action references
  const parts = content.split(/(\[PRODUCT:[^\]]+\]|\[PROFILE:[^\]]+\]|\[ACTION:[^\]]+\])/g);
  
  // Group consecutive product tags together
  const groupedElements: JSX.Element[] = [];
  let currentProductGroup: Product[] = [];
  let currentTextBuffer = '';
  
  const flushProductGroup = () => {
    if (currentProductGroup.length > 0) {
      groupedElements.push(
        <div key={`products-${groupedElements.length}`} className="my-3 space-y-2">
          {currentProductGroup.map((product, idx) => (
            <ProductCard key={idx} product={product} onClick={onProductClick} />
          ))}
        </div>
      );
      currentProductGroup = [];
    }
  };
  
  const flushTextBuffer = () => {
    if (currentTextBuffer.trim()) {
      groupedElements.push(
        <div key={`text-${groupedElements.length}`} className="max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={markdownComponents}
          >
            {currentTextBuffer}
          </ReactMarkdown>
        </div>
      );
      currentTextBuffer = '';
    }
  };
  
  parts.forEach((part) => {
    const productMatch = part.match(/\[PRODUCT:([^\]]+)\]/);
    const profileMatch = part.match(/\[PROFILE:([^\]]+)\]/);
    const actionMatch = part.match(/\[ACTION:([^\]]+)\]/);
    
    if (productMatch) {
      // Flush any pending text before starting product group
      flushTextBuffer();
      
      const identifier = productMatch[1].trim();
      
      // Find product by ID first
      let product = products.find(p => p.id?.toString() === identifier);
      
      // If not found by ID, try by title (partial match)
      if (!product) {
        const identifierLower = identifier.toLowerCase();
        product = products.find(p => 
          p.title.toLowerCase().includes(identifierLower) ||
          identifierLower.includes(p.title.toLowerCase())
        );
      }
      
      // If still not found, try exact category match
      if (!product) {
        product = products.find(p => 
          p.category?.toLowerCase() === identifier.toLowerCase()
        );
      }
      
      if (product) {
        currentProductGroup.push(product);
      } else {
        console.warn('Product not found:', identifier);
      }
    } else if (profileMatch) {
      // Profile button - flush any pending content first
      flushProductGroup();
      flushTextBuffer();
      
      const tab = profileMatch[1].trim().toLowerCase() as 'info' | 'address' | 'shipping' | 'payment';
      const buttonConfig = PROFILE_BUTTONS[tab] || PROFILE_BUTTONS.info;
      
      groupedElements.push(
        <div key={`profile-${groupedElements.length}`} className="my-3">
          <button
            onClick={() => onOpenProfile?.(tab)}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-700 text-white font-bold py-3 px-6 rounded-xl hover:shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <span className="text-xl">{buttonConfig.icon}</span>
            <span>{buttonConfig.label}</span>
          </button>
        </div>
      );
    } else if (actionMatch) {
      // Action button - clickable response option
      flushProductGroup();
      flushTextBuffer();
      
      const actionText = actionMatch[1].trim();
      
      groupedElements.push(
        <div key={`action-${groupedElements.length}`} className="my-2 inline-block mr-2">
          <button
            onClick={() => onActionClick?.(actionText)}
            className="bg-white border-2 border-indigo-500 text-indigo-700 font-semibold py-2 px-4 rounded-lg hover:bg-indigo-50 hover:border-indigo-600 transition-all"
          >
            {actionText}
          </button>
        </div>
      );
    } else if (part.trim()) {
      // Text content - flush products first if any
      flushProductGroup();
      currentTextBuffer += part;
    }
  });
  
  // Flush any remaining content
  flushProductGroup();
  flushTextBuffer();
  
  return <div className="space-y-4">{groupedElements}</div>;
}

