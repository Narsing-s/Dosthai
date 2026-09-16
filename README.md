# Dosthai AI

Dosthai is a general-purpose AI assistant workspace built to evolve into a full AI platform.

## What is working now

- ChatGPT-style responsive desktop and mobile chat UI
- New chat and recent conversation history
- Browser-local conversation persistence
- Open and delete saved conversations
- Streaming AI responses through an OpenAI-compatible endpoint
- Model selector for supported Dosthai modes
- Copy and regenerate assistant responses
- Code-block rendering for fenced responses
- Text/code file attachment into the prompt (up to 2 MB)
- Dark and light themes
- Settings panel and keyboard shortcuts
- Mobile sidebar navigation
- Server-side API-key handling
- Request validation and provider error handling

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

### Environment

```env
OPENAI_API_KEY=your_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5-mini
```

The real API key must stay server-side and must never be committed to Git.

## Product architecture

```text
                 ┌─────────────────────────┐
                 │      Dosthai Web UI     │
                 │ chat • history • files  │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │       Chat API          │
                 │ validation • streaming  │
                 └────────────┬────────────┘
                              │
                              ▼
                 ┌─────────────────────────┐
                 │     Model Gateway       │
                 │ OpenAI-compatible API   │
                 └────────────┬────────────┘
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
          Models           Memory            Tools
             │                │                │
             └────────────────┼────────────────┘
                              ▼
                    RAG / Knowledge / Agents
                              │
                              ▼
                    Database + Object Storage
```

## Roadmap to a full AI assistant

### Foundation
- Authentication and user accounts
- Cloud-synced conversations across devices
- Database-backed conversation storage
- Secure sessions and rate limiting

### ChatGPT-style capabilities
- Conversation search, rename, archive and export
- Branching conversations
- Better markdown and code rendering
- Model/provider switching
- Voice input and speech output
- Image input and generation
- Multi-file uploads

### Knowledge and research
- Document ingestion
- Embeddings and vector search
- Personal knowledge bases
- Web research tools with citations
- Source-aware answers

### AI agents
- Tool calling
- Multi-step workflows
- Coding agent
- Browser automation
- Background jobs
- Long-term memory with user controls

### Dosthai specialization
- MuleSoft assistant
- DataWeave generator and debugger
- RAML/API design helper
- Integration-pattern assistant
- Developer workspace and project analysis

### Production
- Observability and audit logs
- Abuse prevention and quotas
- Automated tests and CI
- Error tracking
- Production deployment and custom domain

## Engineering note

Dosthai uses the Next.js App Router as its application foundation. Next.js describes the App Router as its newer routing architecture for modern React applications. The current Next.js 16.3.3 release is Active LTS. citeturn0search1turn0search0

For future streaming, multi-provider, tool and agent work, Dosthai can adopt the current Vercel AI SDK, which provides a unified TypeScript layer for AI applications and supports streaming and multiple model providers. citeturn0search2
