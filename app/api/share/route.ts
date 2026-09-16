import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : 'Dosthai conversation';
  const messages = Array.isArray(body.messages)
    ? body.messages.slice(0, 100).filter((item: unknown) => item && typeof item === 'object')
    : [];

  const payload = Buffer.from(JSON.stringify({ title, messages, createdAt: Date.now() })).toString('base64url');
  const origin = new URL(request.url).origin;

  return NextResponse.json({
    id: payload,
    url: `${origin}/share/${payload}`,
    expires: null,
    persistent: false
  });
}
