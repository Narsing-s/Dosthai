# Dosthai release gate

Dosthai will **not** be deployed to Vercel or released to production until the product passes this gate.

## 1. Product correctness
- Chat creation, streaming, stop and retry work.
- Conversation search, delete, import and export work.
- Share links open correctly and do not expose server secrets.
- Model selection is validated server-side.
- Empty, oversized and malformed requests fail safely.
- Mobile and desktop layouts are usable.

## 2. AI platform
- Provider credentials stay server-side.
- Model routing and fallback behavior are tested.
- Tool calls have explicit schemas and timeouts.
- Research responses preserve source URLs and timestamps.
- Long-running work can be resumed rather than silently lost.
- AI never claims an external action happened without a real tool result.

## 3. Knowledge and multimodal
- PDF/DOCX/image/spreadsheet ingestion is tested.
- User knowledge is isolated by account.
- Retrieval is permission-aware.
- Voice transcription and speech output handle failures gracefully.
- Generated files/images have clear ownership and lifecycle rules.

## 4. Security
- Authentication and authorization are enabled before cloud data is exposed.
- Rate limiting is enforced across instances.
- CSRF/session protections are tested.
- Security headers are enabled.
- File uploads have MIME, extension, size and content validation.
- Secrets are never logged or sent to the browser.
- Account deletion and data export are implemented.

## 5. Reliability
- Production database migrations are repeatable.
- Background jobs have retries and idempotency.
- Provider timeouts and fallback behavior are tested.
- Observability covers errors, latency, model usage and tool failures.
- CI passes on the exact release commit.

## 6. Release process

**Develop → Test → CI → browser verification → security review → staging → acceptance → release → production deployment.**

Vercel deployment is intentionally deferred until all required gates are green.

The goal is not to ship a feature checklist. The goal is to ship a dependable AI workspace where every visible capability is actually connected to a working backend capability.
