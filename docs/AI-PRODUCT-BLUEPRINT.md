# Dosthai AI Product Blueprint

Dosthai is being built as a full AI workspace rather than a basic chatbot. The target is a polished, general-purpose assistant with ChatGPT-class interaction patterns and a broader architecture for agents, research, coding, knowledge, multimodal work and automation.

## Core product

1. **Chat** — streaming responses, stop, retry, regenerate, edit-and-resend, branching, message actions, markdown/code rendering, conversation search and export.
2. **Models** — server-side model catalog, capability-aware routing, fallback, per-task model selection and provider-neutral adapters.
3. **Projects** — persistent spaces containing chats, files, instructions, memories, tools and project context.
4. **Memory** — explicit saved memories, project memory, conversation-derived context, user controls, inspection, correction and deletion.
5. **Research** — current web retrieval, source metadata, citations, source previews, evidence-aware synthesis and research reports.
6. **Agents** — multi-step planning, tool loops, progress events, approvals, cancellation, retries, timeouts and resumable execution.
7. **Coding** — code generation, explanation, debugging, repository context, isolated execution, test results and downloadable artifacts.
8. **Knowledge** — PDF/DOCX/XLSX/CSV/JSON/text/image ingestion, extraction, chunking, embeddings, retrieval, reranking and cited answers.
9. **Multimodal** — image understanding, image generation/editing, speech-to-text, text-to-speech and future realtime interaction.
10. **Artifacts** — documents, spreadsheets, presentations, code files, datasets, images and other generated files with version history.
11. **Developer integrations** — GitHub and other authorized services with least-privilege scopes and explicit approval for mutations.
12. **Automation** — scheduled prompts, recurring research, reminders, background jobs and durable workflows.
13. **Cloud** — authentication, account isolation, synced conversations, files, projects, memory and sharing.
14. **Privacy** — data export, account deletion, memory controls, file deletion, session security and clear retention controls.
15. **Observability** — request IDs, structured logs, model/tool latency, failures, usage, cost accounting and audit events.

## ChatGPT-class UX requirements

- One primary composer with attachments, voice and tools.
- Fast streaming with visible generation state.
- Clear model and mode controls without clutter.
- Projects accessible from the sidebar.
- Search across conversations and project knowledge.
- Persistent conversation history for authenticated users.
- Mobile-first responsive layout.
- Empty, loading, error, offline and retry states.
- Keyboard shortcuts and accessibility labels.
- Source/citation cards for research.
- Tool cards that show what ran and what returned.
- Approval cards before external or mutating actions.
- Artifact previews alongside downloadable files.

## Agent safety contract

- Provider credentials stay server-side.
- Tool permissions are scoped per user/project.
- Read-only tools may run automatically when policy permits.
- External or mutating actions require explicit approval.
- Tool inputs are schema validated and bounded.
- Every network/tool call has a timeout and failure path.
- Long-running tasks have durable state and can resume after interruption.
- Tool results are never fabricated by the UI.
- Research keeps source metadata through the complete response pipeline.
- Generated files have lifecycle, ownership and deletion rules.

## Release gates

A feature is not considered complete merely because a UI button exists. Each feature must have working UI, backend behavior, validation, failure handling, authorization, tests, browser verification and documentation.

`Implement -> unit/API tests -> production build -> browser/E2E -> security review -> integration tests -> staging acceptance -> release gate -> Vercel production deployment`

**Vercel deployment is intentionally the final step only.**