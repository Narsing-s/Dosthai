import { runAgentStream } from '../../../../lib/agent-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const MAX_RATE_BUCKETS = 10_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

function clientKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous';
}

function rateLimited(key: string) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (buckets.size >= MAX_RATE_BUCKETS) {
      for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
      if (buckets.size >= MAX_RATE_BUCKETS) {
        const first = buckets.keys().next().value;
        if (typeof first === 'string') buckets.delete(first);
      }
    }
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

function parseHistory(value: unknown): ChatHistoryItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item: unknown): item is ChatHistoryItem => Boolean(item) && typeof item === 'object' && (((item as { role?: unknown }).role === 'user') || ((item as { role?: unknown }).role === 'assistant')) && typeof (item as { content?: unknown }).content === 'string')
    .slice(-24)
    .map((item: ChatHistoryItem) => ({ role: item.role, content: item.content.slice(0, 12_000) }));
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const headers = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-store, must-revalidate',
  connection: 'keep-alive',
  'x-accel-buffering': 'no'
};

export async function POST(request: Request) {
  if (rateLimited(clientKey(request))) return new Response(sse('error', { error: 'Too many agent requests. Please wait a moment and try again.' }), { status: 429, headers });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return new Response(sse('error', { error: 'Invalid JSON request body.' }), { status: 400, headers });
  const payload = body as Record<string, unknown>;
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) return new Response(sse('error', { error: 'Message is required.' }), { status: 400, headers });
  if (message.length > 30_000) return new Response(sse('error', { error: 'Message is too long.' }), { status: 413, headers });

  const history = parseHistory(payload.history);
  const model = typeof payload.model === 'string' ? payload.model : undefined;
  const encoder = new TextEncoder();
  let cancelled = false;
  const abort = () => { cancelled = true; };
  request.signal.addEventListener('abort', abort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: string, data: unknown) => { if (!cancelled) controller.enqueue(encoder.encode(sse(event, data))); };
      try {
        write('ready', { message: 'Agent is working…' });
        const result = await runAgentStream({
          message,
          history,
          model,
          signal: request.signal,
          onEvent(event) {
            if (event.type === 'token') write('token', { token: event.token });
            else if (event.type === 'status') write('status', { message: event.message });
            else write('meta', event);
          }
        });
        if (cancelled) return;
        write('done', { model: result.model, steps: result.steps });
        controller.close();
      } catch (error) {
        if (!cancelled) {
          const messageText = error instanceof Error ? error.message : 'Agent request failed.';
          write('error', { error: messageText });
          controller.close();
        }
      } finally {
        request.signal.removeEventListener('abort', abort);
      }
    },
    cancel() {
      cancelled = true;
    }
  });

  return new Response(stream, { headers });
}
