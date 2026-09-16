import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 120) : 'Dosthai conversation';
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 100) : [];
  const token = crypto.randomUUID();
  const payload = Buffer.from(JSON.stringify({ title, messages, createdAt: Date.now() })).toString('base64url');
  return NextResponse.json({ id: token, shareData: payload });
}
