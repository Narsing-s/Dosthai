# Dosthai AI

Dosthai is a general-purpose AI assistant workspace designed to grow into a secure, multi-model product with chat, files, research, tools, agents, memory and multimodal capabilities.

## Current product foundation

- ChatGPT-style responsive workspace
- Streaming AI conversations
- Conversation history stored locally in the browser
- New chat, rename-by-first-message, open and delete flows
- Model selector foundation
- Copy and regenerate actions
- Markdown/code-block presentation
- Text/code file attachment into prompts
- Dark/light theme
- Mobile sidebar and keyboard shortcuts
- Server-side provider credentials
- Health and model-discovery API endpoints
- Share API foundation
- Continuous Integration build workflow

## Advanced product roadmap

### Chat
- Persistent cloud conversations
- Search across conversations
- Conversation folders, archive and pin
- Edit user messages and branch/regenerate responses
- Stop generation and retry failed generations
- Message reactions and feedback
- Conversation export/import

### Accounts and security
- Email/password and OAuth authentication
- Session management
- Account deletion and data export
- Per-user authorization
- Rate limiting and abuse protection
- Audit logging and secure headers

### AI platform
- Multiple model providers
- Automatic model routing
- Fallback models
- Tool calling
- Multi-step agents
- Structured output
- Long-context management
- Prompt/version management
- Usage and cost tracking

### Knowledge and multimodal
- PDF, DOCX, images, spreadsheets and code uploads
- Document parsing and chunking
- Embeddings and semantic search
- Personal knowledge bases
- Web research with citations
- Image understanding and generation
- Speech-to-text and text-to-speech

### Developer AI
- Code generation and review
- Secure code execution sandbox
- GitHub integration
- MuleSoft/DataWeave specialist mode
- API/RAML assistance
- Debugging and test generation

### Production
- PostgreSQL persistence
- Object storage
- Background jobs
- Observability and tracing
- Automated tests
- Preview deployments
- Production deployment and monitoring

## Architecture

```text
Browser / Mobile Web
        |
        v
Next.js App Router
        |
        +--> Authentication / Authorization
        |
        +--> Chat API / AI SDK
        |       |
        |       +--> Model Gateway --> Multiple LLM Providers
        |       +--> Tools / Agents
        |       +--> Web Research
        |       +--> RAG / Knowledge
        |
        +--> PostgreSQL --> Users / Chats / Messages / Usage
        |
        +--> Object Storage --> Files / Attachments
        |
        +--> Background Jobs --> Indexing / Long Tasks
        |
        +--> Observability --> Logs / Metrics / Traces
```

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Set `OPENAI_API_KEY` in `.env.local` for live model responses. Never commit real credentials.

## Important

The repository is the product codebase, but advanced cloud features such as authentication, database persistence, web research and file indexing require their respective services and credentials before they can operate in production.
