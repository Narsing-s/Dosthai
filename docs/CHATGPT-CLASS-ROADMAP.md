# Dosthai — ChatGPT-Class Product Roadmap

Dosthai is being built as a unified AI workspace rather than a collection of disconnected demos. The target is a polished, trustworthy product capable of competing with leading AI assistants.

## Core experience

- Fast streaming chat
- Stop, retry, regenerate and edit prompts
- Conversation branching and temporary chat
- Search, pin, archive, rename, export and delete chats
- Model picker with server-side allow-list and fallback
- Automatic context compaction for long conversations
- Markdown, code blocks, tables and rich artifacts
- Mobile-first responsive experience
- Offline/poor-network recovery states

## Projects and context

- Persistent projects
- Project instructions
- Project-only memory
- Project files and chats
- Project search
- Move/branch chats into projects
- Shared projects with explicit membership and permissions
- Per-project tool policies

Projects should keep chats, files, instructions and evolving context together, matching the modern project-workspace pattern documented by OpenAI. citeturn0search0turn0search2

## Memory

- Explicit saved memories
- Automatic memory candidates
- Memory review/edit/delete
- Conversation-history retrieval
- Project-scoped memory
- Temporary chat that never reads or writes memory
- Memory freshness/decay metadata
- User-controlled memory enable/disable
- Never silently expose sensitive memory to unrelated contexts

Modern AI assistants increasingly treat memory as a user-controlled, reviewable system rather than a hidden prompt string. citeturn0search1turn0search5

## Research

- Quick web search
- Deep research mode
- Research plan preview/edit
- Source allow/block lists
- Parallel source collection
- Source quality metadata
- Citation-aware synthesis
- Contradiction and uncertainty detection
- Research progress events
- Interrupt/resume
- Exportable research report

Deep research should be multi-step, source-aware and interruptible rather than a single search request. citeturn0search3turn0search4turn0search10

## Agents and actions

- Agent mode inside normal chat
- Multi-step planning
- Tool registry
- Read-only tools
- Mutating tools with explicit approval
- Browser automation adapter
- Code execution adapter
- External integrations
- Live progress narration
- Stop/interruption
- Timeouts and cancellation
- Durable background jobs
- Resume/retry/idempotency
- Audit trail
- Scheduled tasks

Consequence-bearing actions must require explicit approval, and the user must be able to interrupt work. This follows the current agent UX pattern described by OpenAI. citeturn0search6

## Files and knowledge

- PDF ingestion
- DOC/DOCX ingestion
- XLS/XLSX/CSV ingestion
- PPT/PPTX ingestion
- Images and OCR
- Plain text/code/JSON/XML/YAML
- File previews
- Secure object storage
- Virus/type/size validation
- Chunking and metadata
- Embeddings/vector retrieval
- Hybrid keyword + semantic search
- Permission-aware RAG
- Citation back to file/page/section
- File deletion and retention controls

## Creation and artifacts

- Documents
- Spreadsheets
- Presentations
- Code projects
- Data analysis outputs
- Charts
- Images
- Downloadable generated files
- Version history
- Preview before export
- Artifact editing in-place

## Developer workspace

- Code interpreter/sandbox
- Multiple languages where supported
- Tests and diagnostics
- GitHub OAuth/app authorization
- Repository browsing
- Branch-aware changes
- Pull-request workflows
- Diff review
- Approval before mutations
- Secrets never exposed to models unnecessarily

## Voice and multimodal

- Push-to-talk
- Streaming speech recognition
- Streaming text-to-speech
- Interruptible voice conversation
- Image understanding
- Image generation/editing
- Camera/image attachments
- Audio/file analysis
- Unified multimodal context

## Accounts, cloud and collaboration

- Secure authentication
- Session management
- Account isolation
- Cloud conversation sync
- Cloud file sync
- Cross-device continuation
- Shared projects
- Roles and permissions
- Invitation/revocation
- Audit events
- Data export
- Account deletion

## Trust and safety

- Server-side secrets only
- Tool permission boundaries
- Prompt-injection defenses for retrieved content
- SSRF protections for web tools
- Upload validation
- Sandboxed execution
- Rate limits with distributed storage
- Abuse controls
- CSRF/session protection
- Security headers
- Encryption in transit/at rest where supported
- Data retention controls
- Complete deletion semantics
- Safe error messages

## Reliability

- Provider timeout/fallback
- Streaming reconnect
- Idempotency keys
- Durable job state
- Retry budgets
- Circuit breakers
- Structured logs
- Metrics
- Traces
- Usage/cost accounting
- Provider latency/error dashboards
- Health/readiness endpoints
- Automated migrations

## UX quality bar

Every feature must include:

1. visible UI entry point;
2. working server implementation;
3. loading/progress state;
4. success state;
5. empty state;
6. error state;
7. retry/stop path where relevant;
8. permission/approval behavior where relevant;
9. mobile behavior;
10. accessibility behavior;
11. automated tests;
12. browser verification;
13. documentation.

A placeholder button, environment variable, mock result or static capability flag does not count as a completed feature.

## Release gate

`Requirement → implementation → unit/API tests → local production build → browser/E2E → security review → integration tests → CI → staging acceptance → final readiness → production release`

Vercel deployment is deliberately the final release operation, never a development shortcut.
