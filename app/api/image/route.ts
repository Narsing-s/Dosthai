import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PROMPT = 4000;
const MAX_BUCKETS = 10_000;
const RATE_LIMIT = 6;
const WINDOW_MS = 60_000;
const PROVIDER_TIMEOUT_MS = 60_000;
const ALLOWED_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);
const buckets = new Map<string, { started: number; count: number }>();

function imageConfig() {
  const key = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.IMAGE_MODEL?.trim() || 'gpt-image-2';
  return { key, baseUrl, model };
}

function requestId() { return `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }
function clientKey(request: NextRequest) { return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'; }
function rateLimited(key: string) {
  const now = Date.now();
  if (buckets.size > MAX_BUCKETS) for (const [id, bucket] of buckets) if (now - bucket.started > WINDOW_MS) buckets.delete(id);
  const current = buckets.get(key);
  if (!current || now - current.started >= WINDOW_MS) { buckets.set(key, { started: now, count: 1 }); return false; }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

export async function POST(request: NextRequest) {
  const id = requestId();
  if (rateLimited(clientKey(request))) return NextResponse.json({ error: 'Image generation rate limit exceeded. Try again in a minute.', requestId: id }, { status: 429, headers: { 'cache-control': 'no-store', 'retry-after': '60', 'x-dosthai-request-id': id } });

  const { key, baseUrl, model: configuredModel } = imageConfig();
  if (!key) return NextResponse.json({ error: 'Image generation is not configured.', requestId: id }, { status: 503, headers: { 'cache-control': 'no-store', 'x-dosthai-request-id': id } });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON request.', requestId: id }, { status: 400, headers: { 'cache-control': 'no-store' } }); }
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt) return NextResponse.json({ error: 'Prompt is required.', requestId: id }, { status: 400, headers: { 'cache-control': 'no-store' } });
  if (prompt.length > MAX_PROMPT) return NextResponse.json({ error: `Prompt is limited to ${MAX_PROMPT} characters.`, requestId: id }, { status: 413, headers: { 'cache-control': 'no-store' } });

  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim() : configuredModel;
  const size = typeof input.size === 'string' && ALLOWED_SIZES.has(input.size) ? input.size : '1024x1024';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt, size, n: 1 }),
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      const raw = await response.text();
      let message = `Image provider returned HTTP ${response.status}.`;
      try { const parsed = JSON.parse(raw); if (typeof parsed?.error?.message === 'string') message = parsed.error.message; } catch { /* keep safe provider error */ }
      return NextResponse.json({ error: message, requestId: id }, { status: response.status >= 500 ? 502 : response.status, headers: { 'cache-control': 'no-store', 'x-dosthai-request-id': id } });
    }

    const data: unknown = await response.json();
    const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const items = Array.isArray(root.data) ? root.data : [];
    const first = items[0] && typeof items[0] === 'object' ? items[0] as Record<string, unknown> : {};
    const url = typeof first.url === 'string' ? first.url : '';
    const b64 = typeof first.b64_json === 'string' ? first.b64_json : '';
    if (!url && !b64) return NextResponse.json({ error: 'Image provider returned no image data.', requestId: id }, { status: 502, headers: { 'cache-control': 'no-store', 'x-dosthai-request-id': id } });

    return NextResponse.json({ model, size, requestId: id, image: url ? { type: 'url', value: url } : { type: 'base64', value: b64 } }, { headers: { 'cache-control': 'no-store', 'x-dosthai-request-id': id } });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === 'AbortError';
    return NextResponse.json({ error: timeout ? 'Image generation timed out. Please try again.' : 'Image generation failed. Please try again.', requestId: id }, { status: 502, headers: { 'cache-control': 'no-store', 'x-dosthai-request-id': id } });
  } finally {
    clearTimeout(timer);
  }
}
