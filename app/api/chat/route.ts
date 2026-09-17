import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are Dosthai AI, a general-purpose AI assistant built for serious everyday and professional work. Be accurate, clear, practical, and honest about uncertainty. Think carefully before answering. Prefer structured answers when useful. For code, provide complete usable examples and call out important assumptions. Never claim to have browsed the web, run code, changed a repository, accessed a private account, or completed an external action unless the application actually supplied that tool result.`;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const MAX_RATE_BUCKETS = 10_000;
const MAX_HISTORY = 24;
const MAX_HISTORY_ITEM = 16_000;
const MAX_HISTORY_CHARS = 80_000;
const PROVIDER_CONNECT_TIMEOUT_MS = 15_000;
const STREAM_TIMEOUT_MS = 45_000;
const HEARTBEAT_MS = 15_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function allowedModels() {
  const configured = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return [...new Set(configured)];
}

function clientKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'anonymous';
}

function rateLimited(key: string) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    if (rateBuckets.size >= MAX_RATE_BUCKETS) {
      for (const [bucketKey, bucket] of rateBuckets) {
        if (bucket.resetAt <= now) rateBuckets.delete(bucketKey);
      }
      if (rateBuckets.size >= MAX_RATE_BUCKETS) rateBuckets.delete(rateBuckets.keys().next().value as string);
    }
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

function providerHeaders(apiKey: string) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${apiKey}`,
    accept: 'text/event-stream'
  };
}

function shouldFallback(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function compactHistory(history: any[]) {
  const normalized = history.slice(-MAX_HISTORY)
    .filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
    .map((item: any) => ({ role: item.role, content: item.content.slice(0, MAX_HISTORY_ITEM) }));

  let total = 0;
  const kept: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const item = normalized[index];
    if (total + item.content.length > MAX_HISTORY_CHARS && kept.length > 0) break;
    if (total + item.content.length > MAX_HISTORY_CHARS) {
      kept.unshift({ role: item.role, content: item.content.slice(-MAX_HISTORY_CHARS) });
      break;
    }
    kept.unshift(item);
    total += item.content.length;
  }
  return kept;
}

async function fetchProvider(url: string, init: RequestInit, timeoutMs: number) {
  const timeoutController = new AbortController();
  const parentSignal = init.signal;
  const onParentAbort = () => timeoutController.abort();
  if (parentSignal?.aborted) timeoutController.abort();
  else parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: timeoutController.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

function streamWithHeartbeat(body: ReadableStream<Uint8Array>, controller: AbortController, clientSignal: AbortSignal) {
  const reader = body.getReader();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  const abortFromClient = () => {
    controller.abort();
    reader.cancel().catch(() => undefined);
  };

  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (timeout) clearTimeout(timeout);
    clientSignal.removeEventListener('abort', abortFromClient);
    heartbeat = undefined;
    timeout = undefined;
  };

  return new ReadableStream<Uint8Array>({
    start(streamController) {
      if (clientSignal.aborted) {
        settled = true;
        controller.abort();
        cleanup();
        streamController.close();
        return;
      }

      clientSignal.addEventListener('abort', abortFromClient, { once: true });
      streamController.enqueue(encoder.encode(': dosthai-stream-open\n\n'));
      heartbeat = setInterval(() => {
        try { streamController.enqueue(encoder.encode(': dosthai-heartbeat\n\n')); } catch { /* stream already closed */ }
      }, HEARTBEAT_MS);
      timeout = setTimeout(() => {
        controller.abort();
        if (!settled) {
          settled = true;
          cleanup();
          try { streamController.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'The AI provider timed out.' })}\n\n`)); } catch { /* stream already closed */ }
          try { streamController.close(); } catch { /* stream already closed */ }
          reader.cancel().catch(() => undefined);
        }
      }, STREAM_TIMEOUT_MS);

      (async () => {
        try {
          while (!settled) {
            const { value, done } = await reader.read();
            if (done) break;
            streamController.enqueue(value);
          }
          if (!settled) {
            settled = true;
            cleanup();
            streamController.close();
          }
        } catch (error) {
          if (!settled) {
            settled = true;
            cleanup();
            controller.abort();
            const detail = error instanceof Error ? error.message : 'The AI stream failed.';
            try { streamController.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: detail })}\n\n`)); } catch { /* stream already closed */ }
            try { streamController.close(); } catch { /* stream already closed */ }
          }
        }
      })();
    },
    async cancel() {
      settled = true;
      cleanup();
      controller.abort();
      await reader.cancel().catch(() => undefined);
    }
  });
}

export async function POST(request: Request) {
  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': '60' } }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const history = Array.isArray(body.history) ? body.history : [];
  const requestedModel = typeof body.model === 'string' ? body.model.trim() : '';
  const models = allowedModels();

  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  if (message.length > 30_000) return NextResponse.json({ error: 'Message is too long. Keep it under 30,000 characters.' }, { status: 413 });
  if (history.length > 100) return NextResponse.json({ error: 'Conversation history is too large.' }, { status: 413 });

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

  if (!apiKey) {
    return NextResponse.json({ error: 'No AI provider is configured. Add OPENAI_API_KEY to the server environment.' }, { status: 503 });
  }
  if (!models.length) {
    return NextResponse.json({ error: 'No AI model is configured. Add OPENAI_MODEL or DOSTHAI_MODELS to the server environment.' }, { status: 503 });
  }

  const preferred = models.includes(requestedModel) ? requestedModel : models[0];
  const fallbackModels = [preferred, ...models.filter(model => model !== preferred)].slice(0, 3);
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...compactHistory(history),
    { role: 'user', content: message }
  ];

  let lastDetail = 'Provider request failed';

  for (const model of fallbackModels) {
    if (request.signal.aborted) return new Response(null, { status: 499 });

    const controller = new AbortController();
    const abortFromClient = () => controller.abort();
    request.signal.addEventListener('abort', abortFromClient, { once: true });
    let returnedStream = false;

    try {
      const upstream = await fetchProvider(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: providerHeaders(apiKey),
        body: JSON.stringify({ model, messages, stream: true }),
        cache: 'no-store',
        signal: controller.signal
      }, PROVIDER_CONNECT_TIMEOUT_MS);

      if (upstream.ok && upstream.body) {
        returnedStream = true;
        const stream = streamWithHeartbeat(upstream.body, controller, request.signal);
        return new Response(stream, {
          status: 200,
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
            connection: 'keep-alive',
            'x-accel-buffering': 'no',
            'x-dosthai-model': model
          }
        });
      }

      const detail = await upstream.text().catch(() => 'Provider request failed');
      lastDetail = detail.slice(0, 500);
      if (!shouldFallback(upstream.status)) break;
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      lastDetail = error instanceof Error && error.name === 'AbortError'
        ? 'The AI provider connection timed out.'
        : error instanceof Error ? error.message : 'Network request failed';
    } finally {
      if (!returnedStream) request.signal.removeEventListener('abort', abortFromClient);
    }
  }

  return NextResponse.json({ error: `Unable to generate a response: ${lastDetail}` }, { status: 502 });
}
