import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are Dosthai AI, a helpful general-purpose AI assistant. Be accurate, clear, practical, and honest about uncertainty. Use markdown when useful. For code, explain important assumptions and provide complete usable examples. Never claim to have browsed the web, run code, changed a repository, or completed an external action unless the application actually supplied that tool result.`;

const ALLOWED_MODELS = new Set(['gpt-5-mini', 'gpt-5']);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const history = Array.isArray(body.history) ? body.history : [];
  const requestedModel = typeof body.model === 'string' ? body.model : '';

  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  if (message.length > 30000) return NextResponse.json({ error: 'Message is too long. Keep it under 30,000 characters.' }, { status: 413 });

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const configuredModel = process.env.OPENAI_MODEL || 'gpt-5-mini';
  const model = ALLOWED_MODELS.has(requestedModel) ? requestedModel : configuredModel;

  if (!apiKey) {
    return NextResponse.json({
      error: 'No AI provider is configured. Add OPENAI_API_KEY to the server environment.'
    }, { status: 503 });
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-20).filter((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const value = item as { role?: unknown; content?: unknown };
      return (value.role === 'user' || value.role === 'assistant') && typeof value.content === 'string';
    }),
    { role: 'user', content: message }
  ];

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.4 }),
      cache: 'no-store'
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
        connection: 'keep-alive',
        'x-accel-buffering': 'no'
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network request failed';
    return NextResponse.json({ error: `Unable to contact AI provider: ${detail}` }, { status: 502 });
  }
}
