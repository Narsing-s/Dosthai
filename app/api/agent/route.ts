import { NextResponse } from 'next/server';
import { runAgent } from '../../../lib/agent-runtime';

export const runtime = 'nodejs';

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

export async function POST(request: Request) {
  if (rateLimited(clientKey(request))) return NextResponse.json({ error: 'Too many agent requests. Please wait a moment and try again.' }, { status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } });
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  const payload = body as Record<string, unknown>;
  const message = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  if (message.length > 30_000) return NextResponse.json({ error: 'Message is too long.' }, { status: 413 });
  const history = parseHistory(payload.history);

  try {
    const result = await runAgent({ message, history, model: typeof payload.model === 'string' ? payload.model : undefined, signal: request.signal });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store', 'x-dosthai-agent-model': result.model, 'x-dosthai-agent-steps': String(result.steps) } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return NextResponse.json({ error: 'Agent request was cancelled.' }, { status: 499 });
    const messageText = error instanceof Error ? error.message : 'Agent request failed.';
    const status = /not configured/i.test(messageText) ? 503 : /timed out/i.test(messageText) ? 504 : /too many/i.test(messageText) ? 429 : 502;
    return NextResponse.json({ error: messageText }, { status, headers: { 'cache-control': 'no-store' } });
  }
}
