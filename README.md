# Dosthai AI

Dosthai is a full-stack AI assistant workspace designed to grow into a general-purpose AI platform.

## Current capabilities

- ChatGPT-style responsive chat workspace
- Conversation state in the browser
- Streaming responses from an OpenAI-compatible chat-completions endpoint
- Provider-independent server configuration through environment variables
- Clean mobile and desktop UI
- Suggested prompts and new-chat flow
- Server-side API-key handling

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

To enable live model responses, put your provider key in `.env.local`. Never commit the real key.

## Architecture roadmap

```text
Web UI
  -> Chat API
      -> Model Gateway
          -> LLM provider(s)
      -> Context / Memory
      -> RAG / Files
      -> Tools
      -> Agents
  -> Database / Object Storage
```

Planned layers include authentication, persistent conversations, file uploads, RAG, web research, tool calling, long-term memory, agent workflows, coding assistance, MuleSoft/DataWeave assistance, observability, safety controls, and production deployment.

## Engineering note

Dosthai uses Next.js App Router as the application foundation. The App Router is Next.js's modern routing architecture for React and full-stack applications.
