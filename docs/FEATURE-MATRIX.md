# Dosthai Feature Matrix

Dosthai is being built as a general-purpose AI workspace with ChatGPT-class interaction patterns and an extensible agent/tool platform.

The project follows one rule: **a UI control is not considered implemented until the server-side behavior, failure path, security model, and verification path exist.**

## Product layers

| Capability | Current foundation | Integration / implementation required | Release gate |
|---|---|---|---|
| Chat + streaming | Implemented | Provider credentials | Must pass E2E |
| Model catalog + fallback | Implemented | Provider routing | Must pass provider tests |
| Local conversations | Implemented | None | Must pass import/export/search tests |
| Stop / retry / regenerate | Implemented | None | Must pass browser tests |
| Agent workspace | Implemented foundation | Streaming agent runtime, approvals, durable jobs | Required |
| Web research | Adapter implemented | Real search provider | Required for research release |
| Tool registry | Implemented | Provider-specific tools | Required |
| Knowledge / RAG | Architecture + DB schema | Embeddings/vector provider + ingestion | Required |
| File knowledge | Text/code attachment foundation | PDF/DOCX/XLSX/image extraction + storage | Required |
| Code execution | Contract | Isolated sandbox + resource limits | Required |
| Image generation | Contract | Image provider | Required for multimodal release |
| Voice | Browser input foundation | Transcription/TTS provider | Required for full voice release |
| GitHub workflows | Contract | OAuth/App authorization + scoped operations | Required |
| Authentication | Contract | Session/auth implementation | Required for cloud accounts |
| Cloud conversations | DB schema | Database + account isolation | Required |
| Object storage | Contract | Durable storage provider | Required |
| Durable sharing | Schema | Server-backed share records, expiry and revocation | Required |
| Memory | Schema | User controls, retrieval, deletion | Required |
| Background agents | Architecture | Durable/resumable job runner | Required |
| Observability | Basic health/capability endpoints | Logs, metrics, traces, usage | Required |
| Security | Headers + server-side secrets + validation foundation | Distributed limits, authz, CSRF/session hardening, upload security | Required |
| Mobile | Responsive web foundation | Native/PWA expansion where justified | Release-dependent |

## Agent/tool safety contract

- Server-side credentials never enter browser code.
- Tools report `ready` only when their required integration is actually configured.
- Unconfigured tools must be presented as unavailable/integration-required rather than simulated.
- Read-only tools can execute automatically when policy allows.
- External or mutating actions require explicit approval before execution.
- Tool calls must have bounded input, timeout, and error handling.
- Research responses preserve source metadata instead of inventing citations.
- Long-running work must eventually become resumable rather than relying on one HTTP request.

## Development and release sequence

```text
Product requirements
  -> implementation
  -> unit/API tests
  -> local production build
  -> browser/E2E verification
  -> security review
  -> CI
  -> integration readiness
  -> staging acceptance
  -> final release gate
  -> Vercel production deployment
```

**Vercel deployment is intentionally deferred until the complete release gate passes.**

## What “complete” means

A feature is complete only when:

1. The UI is usable on desktop and mobile.
2. The API/server implementation is real.
3. Invalid, missing, slow and failed dependencies have defined behavior.
4. Authentication and authorization are enforced where required.
5. Sensitive data is kept server-side.
6. Automated tests cover important paths.
7. Browser verification covers the user-visible flow.
8. Documentation accurately describes the actual state.

This prevents Dosthai from becoming a collection of buttons that merely look like an AI product.
