import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT = 6000;
const WINDOW_MS = 60_000;
const RATE_LIMIT = 12;
const buckets = new Map<string, { started: number; count: number }>();

function clientIp(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
}

function allowed(ip: string) {
  const now = Date.now();
  const current = buckets.get(ip);
  if (!current || now - current.started >= WINDOW_MS) {
    if (buckets.size > 10_000) buckets.delete(buckets.keys().next().value as string);
    buckets.set(ip, { started: now, count: 1 });
    return true;
  }
  if (current.count >= RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const ip = clientIp(request);
  if (!allowed(ip)) {
    return NextResponse.json({ error: 'Too many speech requests. Please wait a moment.', requestId }, { status: 429, headers: { 'retry-after': '60', 'cache-control': 'no-store' } });
  }

  const key = process.env.SPEECH_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'Speech generation is not configured.', requestId }, { status: 503, headers: { 'cache-control': 'no-store' } });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body.', requestId }, { status: 400 }); }
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'Text is required.', requestId }, { status: 400 });
  if (text.length > MAX_TEXT) return NextResponse.json({ error: `Text is limited to ${MAX_TEXT} characters.`, requestId }, { status: 413 });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    const base = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const response = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ model: process.env.SPEECH_MODEL || 'gpt-4o-mini-tts', voice: process.env.SPEECH_VOICE || 'alloy', input: text, format: 'mp3' }),
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let detail = 'Speech provider request failed.';
      try { detail = JSON.parse(raw)?.error?.message || detail; } catch {}
      return NextResponse.json({ error: detail, requestId }, { status: response.status >= 400 && response.status < 500 ? response.status : 502, headers: { 'cache-control': 'no-store' } });
    }
    const audio = await response.arrayBuffer();
    return new NextResponse(audio, { status: 200, headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store', 'x-dosthai-request-id': requestId } });
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'AbortError' ? 'Speech generation timed out.' : 'Speech generation could not be completed.';
    return NextResponse.json({ error: message, requestId }, { status: 502, headers: { 'cache-control': 'no-store' } });
  } finally {
    clearTimeout(timer);
  }
}
