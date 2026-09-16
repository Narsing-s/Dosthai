import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

  // Provider integration is intentionally isolated here. Replace this fallback
  // with the selected LLM provider without changing the chat UI.
  return NextResponse.json({
    message: `I received: “${message}”\n\nDosthai AI is initialized, but a live model provider has not been configured yet.`
  });
}
