# 🤖 AI Workshop Assistant

A modern, production-ready AI chat assistant built with **Next.js 14**, **TypeScript**, **Tailwind CSS**, and **AWS Lambda**.

![AI Chat Interface](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)
![AWS Lambda](https://img.shields.io/badge/AWS-Lambda-FF9900?style=for-the-badge&logo=amazon-aws)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--3.5-412991?style=for-the-badge&logo=openai)

## ✨ Features

- 🎨 **Modern UI** - Beautiful, responsive design with Tailwind CSS
- ⚡ **Next.js 14** - Fast, optimized React framework with App Router
- 📘 **TypeScript** - Full type safety for better developer experience
- 💬 **Smart Chat** - Context-aware responses using OpenAI GPT-3.5
- ⚡ **Response Caching** - DynamoDB caching for faster repeat questions
- 📊 **Analytics** - Track usage patterns and popular questions
- 🔒 **Secure** - API keys protected server-side, authentication via secret
- 📝 **Markdown Support** - Code blocks with syntax highlighting
- 🚀 **Serverless** - No servers to manage, scales automatically
- 💰 **Cost Efficient** - ~$5-10 per 1,000 questions

## 🏗️ Architecture

```
┌─────────────────────────┐
│  Next.js Frontend       │  ← React components with TypeScript
│  (app/ + components/)   │
└───────────┬─────────────┘
            │ HTTPS POST
            ▼
┌─────────────────────────┐
│  API Gateway            │  ← CORS & routing
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Lambda (Node.js 22)    │  ← Validates secrets, calls OpenAI
└───────────┬─────────────┘
            │
       ┌────┴────┬─────────┐
       ▼         ▼         ▼
┌─────────┐ ┌────────┐ ┌──────────┐
│ OpenAI  │ │DynamoDB│ │CloudWatch│
│ GPT-3.5 │ │(Cache) │ │  (Logs)  │
└─────────┘ └────────┘ └──────────┘
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- AWS CLI configured
- AWS SAM CLI installed
- OpenAI API key ([Get one here](https://platform.openai.com/api-keys))

### 1. Install Dependencies

```bash
cd /Users/benjasl/Desktop/code/acp-demo
npm install
```

### 2. Deploy Backend

```bash
# Install Lambda dependencies
cd lambda && npm install && cd ..

# Build and deploy
sam build
sam deploy --parameter-overrides \
  OpenAIApiKey=sk-your-openai-key-here \
  WorkshopSecret=lama
```

**Save the API endpoint from the output!**

```
Outputs:
ApiEndpoint: https://abc123.execute-api.us-west-2.amazonaws.com/Prod/
```

### 3. Configure Environment (Optional)

Create `.env.local`:

```bash
NEXT_PUBLIC_LAMBDA_ENDPOINT=https://your-api-id.execute-api.us-west-2.amazonaws.com/Prod/
NEXT_PUBLIC_WORKSHOP_SECRET=lama
```

Or configure via the browser UI after starting the app.

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) 🎉

### 5. Configure in Browser

Click **"⚙️ Configuration"** and enter:
- **Lambda Endpoint**: Your API Gateway URL
- **Workshop Secret**: `lama` (or your custom secret)

## 📁 Project Structure

```
acp-demo/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/             # React components
│   ├── ChatInterface.tsx  # Main chat UI
│   └── ConfigModal.tsx    # Configuration modal
├── lib/                    # Utility functions
│   ├── api.ts             # API client
│   └── config.ts          # Configuration management
├── lambda/                 # AWS Lambda backend
│   ├── app.mjs           # Lambda handler (Node.js)
│   └── package.json      # Lambda dependencies
├── public/                 # Static assets
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── tailwind.config.ts     # Tailwind config
├── next.config.mjs        # Next.js config
└── template.yaml          # SAM/CloudFormation template
```

## 🛠️ Development

### Available Scripts

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Making Changes

- **UI Components**: Edit `components/ChatInterface.tsx`
- **Styling**: Modify `app/globals.css` or Tailwind classes inline
- **API Logic**: Update `lib/api.ts`
- **AI Context**: Edit `buildWorkshopContext()` in `lib/api.ts`
- **Backend**: Modify `lambda/app.mjs`

## 🎨 Customization

### Change Colors

Edit the gradient in `app/page.tsx`:

```tsx
className="bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800"
// Change to your preferred colors:
className="bg-gradient-to-br from-blue-600 via-blue-700 to-cyan-800"
```

### Change AI Behavior

Edit `lambda/app.mjs` - the `guidelines` variable:

```javascript
const guidelines = `Guidelines:
- Your custom AI guidelines here
- Keep answers concise
- Be helpful and friendly`;
```

### Change Workshop Context

Edit `lib/api.ts` - the `buildWorkshopContext()` function:

```typescript
function buildWorkshopContext(): string {
  return `You are a helpful AI assistant for [YOUR TOPIC].
  
  CURRENT PAGE CONTEXT:
  User is asking about [YOUR CONTENT]...`;
}
```

## 🚢 Deployment

### Vercel (Recommended - Easiest)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

Or connect your GitHub repo to [Vercel dashboard](https://vercel.com) for automatic deployments.

**Environment Variables in Vercel:**
- `NEXT_PUBLIC_LAMBDA_ENDPOINT`
- `NEXT_PUBLIC_WORKSHOP_SECRET`

### AWS Amplify

1. Go to AWS Amplify Console
2. Connect your GitHub repository
3. Build settings are auto-detected
4. Add environment variables
5. Deploy!

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t ai-workshop-assistant .
docker run -p 3000:3000 ai-workshop-assistant
```

## 🔒 Environment Variables

### Frontend (.env.local)

```bash
NEXT_PUBLIC_LAMBDA_ENDPOINT=https://xxx.execute-api.region.amazonaws.com/Prod/
NEXT_PUBLIC_WORKSHOP_SECRET=lama
```

**Note:** `NEXT_PUBLIC_` prefix exposes variables to the browser. This is safe because the actual OpenAI API key is securely stored in Lambda, never exposed.

### Backend (Lambda)

Set during SAM deployment:
- `OPENAI_API_KEY` - Your OpenAI key (secure)
- `WORKSHOP_SECRET` - Authentication secret
- `DYNAMODB_TABLE` - Auto-configured by SAM

## 💰 Cost Analysis

### Per-Request Breakdown

**OpenAI Costs (GPT-3.5-turbo):**
- Input tokens: ~10,000 × $0.0005/1K = **$0.005**
- Output tokens: ~150 × $0.0015/1K = **$0.00023**
- **Total: ~$0.0053 per question**

**AWS Costs:**
- Lambda: FREE (1M requests/month)
- API Gateway: FREE (1M requests/month)
- DynamoDB: FREE (25GB storage + 25 R/W units)
- **Total: $0** (within free tier)

### Monthly Cost Scenarios

| Usage Level | Questions/Month | OpenAI | AWS | Total |
|-------------|-----------------|--------|-----|-------|
| Small | 100 | $0.53 | $0 | **$0.53** |
| Medium | 1,000 | $5.30 | $0 | **$5.30** |
| Large | 10,000 | $53.00 | $0 | **$53.00** |
| Enterprise | 100,000 | $530.00 | ~$10 | **$540.00** |

## 📊 Features Breakdown

### Implemented ✅

- ✅ Beautiful, responsive UI with Tailwind CSS
- ✅ Real-time chat interface
- ✅ Markdown rendering with code highlighting
- ✅ Conversation history management
- ✅ Configuration modal with localStorage
- ✅ Error handling with user feedback
- ✅ Loading states and animations
- ✅ Response caching indicator
- ✅ TypeScript type safety
- ✅ AWS Lambda backend
- ✅ DynamoDB caching
- ✅ OpenAI GPT-3.5 integration

### Coming Soon 🚧

- [ ] RAG implementation with document loading
- [ ] Dark mode toggle
- [ ] Conversation export (PDF/Markdown)
- [ ] Analytics dashboard
- [ ] Multi-language support
- [ ] Voice input/output
- [ ] User authentication
- [ ] Custom AI models support

## 🐛 Troubleshooting

### Port 3000 Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
npm run dev -- -p 3001
```

### Build Errors

```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### "Configuration not saving"

- Check browser console for localStorage errors
- Ensure cookies/localStorage are enabled
- Try a different browser

### "Lambda endpoint not working"

```bash
# Check if Lambda is deployed
sam list stack-outputs --stack-name ai-chat

# View Lambda logs
sam logs -n PostChatFunction --tail

# Test Lambda directly
curl -X POST https://your-endpoint/Prod/ \
  -H "Content-Type: application/json" \
  -H "X-Workshop-Secret: lama" \
  -d '{"messages":[{"role":"user","content":"test"}],"workshopContext":"test"}'
```

## 📚 Technology Stack

- **Frontend Framework**: Next.js 14 (App Router)
- **UI Library**: React 18
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 3
- **Markdown**: react-markdown, remark-gfm, rehype-highlight
- **Backend**: AWS Lambda (Node.js 22)
- **Database**: DynamoDB
- **AI**: OpenAI GPT-3.5-turbo
- **Infrastructure**: AWS SAM (CloudFormation)

## 🔒 Security Best Practices

✅ **OpenAI API Key** - Never exposed to frontend, only in Lambda  
✅ **Workshop Secret** - Validates all API requests  
✅ **CORS** - Properly configured (can be restricted to your domain)  
✅ **Environment Variables** - Properly separated (frontend vs backend)  
✅ **DynamoDB TTL** - Auto-expires old data (90 days)  
✅ **NoEcho Parameters** - Secrets hidden in CloudFormation  

## 📖 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [React Documentation](https://react.dev)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [AWS SAM](https://docs.aws.amazon.com/serverless-application-model/)
- [OpenAI API](https://platform.openai.com/docs)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

MIT License - feel free to use this for your own projects!

## 🎉 What's Next?

1. ✅ **Run locally**: `npm install && npm run dev`
2. 🎨 **Customize** the UI to match your brand
3. 📝 **Add RAG** with your workshop/documentation content
4. 🚀 **Deploy** to Vercel or your preferred platform
5. 📊 **Monitor** usage and improve based on feedback

---

**Built with ❤️ using Next.js, TypeScript, and AWS**

**Repository**: https://github.com/benjasl-stripe/acp-demo
