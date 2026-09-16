# Dosthai AI

Dosthai is a general-purpose AI workspace designed to become a secure, multi-model assistant for chat, coding, research, files, knowledge, tools, agents and multimodal work.

## What is working now

- ChatGPT-style responsive workspace with dark/light mode
- Streaming AI conversations through an OpenAI-compatible server endpoint
- Current Dosthai model catalog with Fast, Balanced and Pro tiers
- Runtime model discovery through `/api/models`
- Local browser conversation history with search, open, delete and export/import
- Copy and regenerate response actions
- Markdown and code-block presentation
- Text/code attachments for prompt context
- Browser voice input
- Stop generation with `AbortController`
- Conversation share links through `/api/share` and `/share/[id]`
- Capability discovery through `/api/capabilities`
- Basic per-IP chat rate limiting and request-size/history limits
- Branded loading, error and not-found states
- Server-side provider credentials; API keys are never sent to the browser
- CI workflow for the production build

## Product direction

Dosthai is being built as an AI operating workspace rather than only a chat box. The target platform has six layers:

1. **Chat** — fast streaming, editing, branching, regeneration, search, folders, archive, pinning and durable history.
2. **Intelligence** — multi-model routing, fallbacks, structured output, long-context management and task-specific modes.
3. **Tools & agents** — web research, browser tasks, code execution, file operations, connectors and multi-step workflows with explicit user control.
4. **Knowledge** — PDF/DOCX/images/spreadsheets/code ingestion, semantic search, personal knowledge bases and grounded answers with citations.
5. **Creation** — image, speech, transcription, document and code generation with reusable artifacts.
6. **Trust** — authentication, authorization, encryption where appropriate, rate limits, audit logs, privacy controls, usage controls and observability.

## Advanced roadmap

### Accounts and cloud sync
- Email/password and OAuth authentication
- Secure sessions and per-user authorization
- PostgreSQL persistence for users, conversations and messages
- Account deletion and data export
- Cross-device synchronization

### AI platform
- OpenAI-compatible providers plus a model gateway abstraction
- Automatic routing by task, latency and cost
- Provider/model fallbacks
- Tool calling and multi-step agents
- Structured outputs and typed actions
- Usage, latency and cost tracking
- Prompt/version management

### Research and knowledge
- Real-time web search and page extraction with source citations
- PDF, DOCX, spreadsheet, image and code ingestion
- Chunking, embeddings and semantic retrieval
- Personal/team knowledge bases
- Grounded-answer controls and source inspection

### Multimodal creation
- Vision and document understanding
- Image generation/editing
- Speech-to-text and text-to-speech
- Realtime voice conversations
- Generated files and reusable artifacts

### Developer workspace
- Code generation, review and debugging
- Sandboxed code execution
- GitHub repositories, issues and pull requests
- API/RAML tooling
- MuleSoft/DataWeave specialist mode
- Test generation and structured technical workflows

### Production
- Object storage for attachments
- Background jobs for indexing and long-running tasks
- Distributed rate limiting
- Secure headers and abuse controls
- OpenTelemetry-compatible tracing/metrics
- Automated unit, integration, browser and end-to-end tests
- Preview and production deployment pipelines

## Architecture

```text
                    Dosthai Web / Mobile Web
                              |
                              v
                    Next.js App Router
                              |
        +---------------------+----------------------+
        |                     |                      |
        v                     v                      v
   Auth & Policy        Chat / Agent Runtime     Artifact UI
        |                     |                      |
        |          +----------+----------+           |
        |          |          |          |           |
        |          v          v          v           |
        |       Models      Tools      RAG        Files/Media
        |          |          |          |           |
        |          +----------+----------+-----------+
        |                     |
        v                     v
   PostgreSQL             Provider Gateway
   users/chats/usage      OpenAI + other models
        |                     |
        +----------+----------+
                   |
                   v
          Background / Observability
```

## Environment

Copy `.env.example` to `.env.local`. The important baseline variables are:

- `OPENAI_API_KEY` — server-side model credential
- `OPENAI_BASE_URL` — OpenAI-compatible provider endpoint
- `OPENAI_MODEL` — default model
- `DOSTHAI_MODELS` — comma-separated model allow-list

Advanced environment variables are documented in `.env.example`. They are intentionally optional so the core app can run without provisioning every cloud service first.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Product principle

Dosthai should not pretend a feature exists just because a button exists. Each advanced capability is treated as a real server-side integration with explicit configuration, error handling, security controls and verification before being marked production-ready.
