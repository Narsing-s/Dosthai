import { NextResponse } from 'next/server';
import { runAgent } from '../../../lib/agent-runtime';

export const runtime = 'nodejs';

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const MAX_RATE_BUCKETS = 10_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'anonymous';
}

function rateLimited(key: string) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    if (buckets.size >= MAX_RATE_BUCKETS) {
      for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
      if (buckets.size >= MAX_RATE_BUCKETS) buckets.delete(buckets.keys().next().value as string);
    }
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

export async function POST(request: Request) {
  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { error: 'Too many agent requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  if (message.length > 30_000) return NextResponse.json({ error: 'Message is too long.' }, { status: 413 });

  const history = Array.isArray(body.history)
    ? body.history
      .filter((item: unknown): item is { role: 'user' | 'assistant'; content: string } =>
        Boolean(item) && typeof item === 'object' &&
        (((item as { role?: unknown }).role === 'user') || ((item as { role?: unknown }).role === 'assistant')) &&
        typeof (item as { content?: unknown }).content === 'string')
      .slice(-24)
      .map(item => ({ role: item.role, content: item.content.slice(0, 12_000) }))
    : [];

  try {
    const result = await runAgent({
      message,
      history,
      model: typeof body.model === 'string' ? body.model : undefined,
      signal: request.signal
    });
    return NextResponse.json(result, {
      headers: {
        'cache-control': 'no-store',
        'x-dosthai-agent-model': result.model,
        'x-dosthai-agent-steps': String(result.steps)
      }
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return NextResponse.json({ error: 'Agent request was cancelled.' }, { status: 499 });
    const messageText = error instanceof Error ? error.message : 'Agent request failed.';
    const status = /not configured/i.test(messageText) ? 503 : /timed out/i.test(messageText) ? 504 : /too many/i.test(messageText) ? 429 : 502;
    return NextResponse.json({ error: messageText }, { status, headers: { 'cache-control': 'no-store' } });
  }
}
