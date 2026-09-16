import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_MESSAGES = 100;
const MAX_TOTAL_CHARS = 120_000;
const MAX_MESSAGE_CHARS = 20_000;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : 'Dosthai conversation';
  const rawMessages = Array.isArray(body.messages) ? body.messages.slice(0, MAX_MESSAGES) : [];
  const messages = rawMessages
    .filter((item: unknown): item is { role: string; content: string } => Boolean(item) && typeof item === 'object' && typeof (item as { role?: unknown }).role === 'string' && typeof (item as { content?: unknown }).content === 'string')
    .map((item) => ({ role: item.role === 'user' || item.role === 'assistant' ? item.role : 'assistant', content: item.content.slice(0, MAX_MESSAGE_CHARS) }));

  const totalChars = messages.reduce((sum, item) => sum + item.content.length, 0);
  if (totalChars > MAX_TOTAL_CHARS) {
    return NextResponse.json({ error: 'Conversation is too large to share. Export it or shorten the conversation first.' }, { status: 413 });
  }

  const payload = Buffer.from(JSON.stringify({ title, messages, createdAt: Date.now() })).toString('base64url');
  const origin = new URL(request.url).origin;

  return NextResponse.json({
    id: payload,
    url: `${origin}/share/${payload}`,
    expires: null,
    persistent: false,
    warning: 'This lightweight share link stores the conversation in the URL. Durable, revocable sharing remains gated behind authenticated cloud persistence.'
  });
}
