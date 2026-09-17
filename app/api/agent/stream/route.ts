import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request) { return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous'; }
function rateLimited(key: string) { const now = Date.now(); const current = buckets.get(key); if (!current || current.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return false; } current.count += 1; return current.count > RATE_LIMIT; }
function sse(event: string, data: unknown) { return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; }
const baseHeaders = { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-store, must-revalidate', connection: 'keep-alive', 'x-accel-buffering': 'no' };

export async function POST(request: Request) {
  const requestId = randomUUID();
  if (rateLimited(clientKey(request))) return new Response(sse('error', { error: 'Too many agent requests. Please wait a moment and try again.', requestId }), { status: 429, headers: { ...baseHeaders, 'retry-after': '60' } });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return new Response(sse('error', { error: 'Invalid JSON request body.', requestId }), { status: 400, headers: baseHeaders });
  const payload = body as Record<string, unknown>;
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) return new Response(sse('error', { error: 'Message is required.', requestId }), { status: 400, headers: baseHeaders });
  if (message.length > 30_000) return new Response(sse('error', { error: 'Message is too long.', requestId }), { status: 413, headers: baseHeaders });

  // Agent mode intentionally uses the same general-purpose AI generation pipeline as normal
  // chat. There is no topic whitelist or separate local rules engine deciding what can be answered.
  // Keeping one inference path prevents agent mode from silently falling back to the old narrow
  // local assistant when Vercel AI Gateway is configured.
  try {
    const target = new URL('/api/chat', request.url);
    const upstream = await fetch(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'x-dosthai-agent-proxy': 'true' },
      body: JSON.stringify({ message, history: Array.isArray(payload.history) ? payload.history : [], model: typeof payload.model === 'string' ? payload.model : undefined }),
      cache: 'no-store',
      signal: request.signal
    });
    if (!upstream.body) return new Response(sse('error', { error: 'The AI service returned an empty stream.', requestId }), { status: 502, headers: baseHeaders });
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sse('ready', { message: 'Agent is working…', requestId })));
        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
              const events = buffer.split('\n\n');
              buffer = events.pop() || '';
              for (const event of events) {
                const lines = event.split('\n');
                const type = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || 'message';
                const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
                if (!data) continue;
                try {
                  const parsed = JSON.parse(data);
                  if (type === 'token') controller.enqueue(encoder.encode(sse('token', parsed)));
                  else if (type === 'error') controller.enqueue(encoder.encode(sse('error', { ...parsed, requestId })));
                  else if (type === 'done') controller.enqueue(encoder.encode(sse('done', { ...parsed, requestId })));
                } catch {}
              }
            }
            if (buffer.trim()) {
              for (const line of buffer.split('\n')) {
                if (!line.startsWith('data:')) continue;
                try { const parsed = JSON.parse(line.slice(5).trimStart()); if (parsed?.token) controller.enqueue(encoder.encode(sse('token', parsed))); } catch {}
              }
            }
            controller.close();
          } catch (error) {
            controller.enqueue(encoder.encode(sse('error', { error: error instanceof Error ? error.message : 'Agent stream failed.', requestId })));
            controller.close();
          }
        })();
      },
      cancel() { reader.cancel().catch(() => undefined); }
    });
    return new Response(stream, { status: upstream.ok ? 200 : upstream.status, headers: { ...baseHeaders, 'x-dosthai-request-id': requestId } });
  } catch (error) {
    return new Response(sse('error', { error: error instanceof Error ? error.message : 'Agent request failed.', requestId }), { status: 502, headers: baseHeaders });
  }
}
