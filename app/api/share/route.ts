import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_MESSAGES = 100;
const MAX_TOTAL_CHARS = 120_000;
const MAX_MESSAGE_CHARS = 20_000;
type ShareMessage = { role: 'user' | 'assistant'; content: string };

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  const payload = body as Record<string, unknown>;
  const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 120) : 'Dosthai conversation';
  const rawMessages: unknown[] = Array.isArray(payload.messages) ? payload.messages.slice(0, MAX_MESSAGES) : [];
  const messages: ShareMessage[] = rawMessages
    .filter((item: unknown): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item: Record<string, unknown>): ShareMessage => ({ role: item.role === 'user' ? 'user' : 'assistant', content: typeof item.content === 'string' ? item.content.slice(0, MAX_MESSAGE_CHARS) : '' }))
    .filter((item: ShareMessage) => Boolean(item.content));
  const totalChars = messages.reduce((sum: number, item: ShareMessage) => sum + item.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) return NextResponse.json({ error: 'Conversation is too large to share. Export it or shorten the conversation first.' }, { status: 413 });

  const encoded = Buffer.from(JSON.stringify({ title, messages, createdAt: Date.now() })).toString('base64url');
  const origin = new URL(request.url).origin;
  return NextResponse.json({ id: encoded, url: `${origin}/share/${encoded}`, expires: null, persistent: false, warning: 'This lightweight share link stores the conversation in the URL. Durable, revocable sharing requires authenticated cloud persistence.' });
}
