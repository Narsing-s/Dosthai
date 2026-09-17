import { NextResponse } from 'next/server';
import { runAgent } from '../../../lib/agent-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  if (message.length > 30_000) return NextResponse.json({ error: 'Message is too long.' }, { status: 413 });
  const history = Array.isArray(body.history) ? body.history.filter((item: unknown): item is { role: 'user' | 'assistant'; content: string } => Boolean(item) && typeof item === 'object' && (((item as { role?: unknown }).role === 'user') || ((item as { role?: unknown }).role === 'assistant')) && typeof (item as { content?: unknown }).content === 'string').map(item => ({ role: item.role, content: item.content.slice(0, 12_000) })) : [];
  try {
    const result = await runAgent({ message, history, model: typeof body.model === 'string' ? body.model : undefined, signal: request.signal });
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store', 'x-dosthai-agent-model': result.model, 'x-dosthai-agent-steps': String(result.steps) } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return NextResponse.json({ error: 'Agent request was cancelled.' }, { status: 499 });
    const messageText = error instanceof Error ? error.message : 'Agent request failed.';
    const status = /not configured/i.test(messageText) ? 503 : /timed out/i.test(messageText) ? 504 : 502;
    return NextResponse.json({ error: messageText }, { status, headers: { 'cache-control': 'no-store' } });
  }
}
