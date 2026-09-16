# Dosthai capability matrix

Dosthai is being developed as a unified AI workspace rather than a simple chat wrapper.

## Core experience

- Chat with streaming responses
- Conversation history, search, rename/delete and import/export
- Multiple model routing with server-side allow-listing
- Stop, retry and share workflows
- Voice input
- Text/code file context
- Responsive web UI

## Work modes

- Agent: multi-step planning and tool execution
- Research: current web research with source metadata
- Code: developer-oriented workflows and sandbox integration
- Create: documents, structured outputs and generated assets

## Tools

- Calculator
- Web research
- Knowledge/RAG
- Code sandbox
- GitHub
- Image generation
- Speech
- Structured JSON

Every tool must have a real server-side implementation or be shown as unavailable. UI controls must never claim that an unconfigured integration is active.

## Long-running intelligence

The target architecture includes resumable jobs, background execution, checkpoints, retries, idempotency and observable tool calls. The current agent route is deliberately bounded to short multi-step execution; it is not yet the final long-running worker system.

## Knowledge and memory

The target product includes user memory, project-scoped memory, uploaded document libraries, permission-aware retrieval, conversation context and account isolation.

## Creation

The target product includes editable workspaces, generated documents, PDFs, spreadsheets, presentations, images and reusable artifacts.

## Safety and control

- Secrets stay server-side.
- Tool permissions are explicit.
- Sensitive external actions require confirmation.
- Tool calls and sources are inspectable.
- Users can stop active work.
- Account data must be isolated and deletable.
- Production readiness is a gate, not a deployment button.

## Product principle

Dosthai should learn from the interaction patterns of leading assistants—chat, projects, memory, web research, agents, coding, documents, voice and multimodal workflows—while keeping its own architecture, UX and provider-neutral integrations. Current ChatGPT and Mistral Vibe both demonstrate the value of combining conversation with projects/workspaces, tools, research and agentic execution. Dosthai therefore treats those capabilities as architectural requirements rather than separate add-ons.
