import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are Dosthai AI, a helpful general-purpose AI assistant. Be accurate, clear, practical, and honest about uncertainty. Use markdown when useful. Do not claim to have performed actions you did not perform.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const history = Array.isArray(body.history) ? body.history : [];
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';

  if (!apiKey) {
    return NextResponse.json({
      message: `Dosthai AI is ready, but no model provider is configured yet. Add OPENAI_API_KEY to the server environment to enable live AI responses.`
    });
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-20).filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string'),
    { role: 'user', content: message }
  ];

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.4 })
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => 'Provider request failed');
    return NextResponse.json({ error: `AI provider error: ${detail.slice(0, 500)}` }, { status: 502 });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  });
}
