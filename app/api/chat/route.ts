import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are Dosthai AI, a general-purpose AI assistant built for serious everyday and professional work. Be accurate, clear, practical, and honest about uncertainty. Think carefully before answering. Prefer structured answers when useful. For code, provide complete usable examples and call out important assumptions. Never claim to have browsed the web, run code, changed a repository, accessed a private account, or completed an external action unless the application actually supplied that tool result.`;

const DEFAULT_MODELS = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5-mini', 'gpt-5'];
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function allowedModels() {
  const configured = (process.env.DOSTHAI_MODELS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_MODELS);
}

function clientKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'anonymous';
}

function rateLimited(key: string) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

export async function POST(request: Request) {
  if (rateLimited(clientKey(request))) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429, headers: { 'retry-after': '60' } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const history = Array.isArray(body.history) ? body.history : [];
  const requestedModel = typeof body.model === 'string' ? body.model.trim() : '';
  const models = allowedModels();

  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  if (message.length > 30000) return NextResponse.json({ error: 'Message is too long. Keep it under 30,000 characters.' }, { status: 413 });

  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const configuredModel = process.env.OPENAI_MODEL || [...models][0];
  const model = models.has(requestedModel) ? requestedModel : (models.has(configuredModel) ? configuredModel : [...models][0]);

  if (!apiKey) return NextResponse.json({ error: 'No AI provider is configured. Add OPENAI_API_KEY to the server environment.' }, { status: 503 });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-30).filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').map((item: any) => ({ role: item.role, content: item.content.slice(0, 30000) })),
    { role: 'user', content: message }
  ];

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, stream: true }),
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
        'x-accel-buffering': 'no',
        'x-dosthai-model': model
      }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Network request failed';
    return NextResponse.json({ error: `Unable to contact AI provider: ${detail}` }, { status: 502 });
  }
}
