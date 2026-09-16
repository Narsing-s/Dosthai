# Dosthai product architecture

Dosthai is being built as a general-purpose AI workspace rather than a thin chat wrapper. The existing ChatGPT-style interface remains the primary interaction surface while capabilities are added behind stable server-side contracts.

## Product layers

1. **Conversation core** — streaming responses, model selection, fallback routing, stop/regenerate, local history, search, import/export and share links.
2. **Tool layer** — a discoverable registry with deterministic utilities first, followed by web research, knowledge retrieval, code execution and authorized developer tools.
3. **Knowledge layer** — uploaded documents, indexing, retrieval, citations, permissions and user/workspace isolation.
4. **Multimodal layer** — text, files, images, speech input/output and generated artifacts.
5. **Agent layer** — multi-step plans, tool calls, approvals, retries, resumable jobs and durable state.
6. **Cloud layer** — authentication, PostgreSQL persistence, object storage, usage metering, account deletion/export and audit events.
7. **Production layer** — rate limits, security headers, secret isolation, validation, observability, error handling, CI and browser verification.

## Design rules

- The browser never receives provider secrets.
- UI controls must map to real functionality; unavailable integrations are shown as unavailable rather than simulated.
- External actions require an explicit tool result before Dosthai claims they happened.
- User data must be isolated by authenticated account/workspace before cloud features are enabled.
- Tool execution must be bounded by time, input size and permissions.
- Web answers should retain source metadata so citations can be rendered in the conversation UI.
- Provider integrations remain replaceable through server-side adapters.
- Vercel deployment is a release step, not a development dependency.

## Release gate

A production release requires a successful build, browser verification of core flows, security review, configured integrations, failure-path testing and acceptance of the release checklist in `docs/RELEASE-GATE.md`. No production deployment is performed merely because CI is green.
