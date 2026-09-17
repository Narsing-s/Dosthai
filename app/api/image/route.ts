import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_PROMPT = 4000;
const ALLOWED_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);

function imageConfig() {
  const key = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  return { key, baseUrl };
}

export async function POST(request: NextRequest) {
  const { key, baseUrl } = imageConfig();
  if (!key) return NextResponse.json({ error: 'Image generation is not configured.' }, { status: 503, headers: { 'cache-control': 'no-store' } });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 }); }
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (!prompt) return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
  if (prompt.length > MAX_PROMPT) return NextResponse.json({ error: `Prompt is limited to ${MAX_PROMPT} characters.` }, { status: 413 });

  const model = typeof input.model === 'string' && input.model.trim() ? input.model.trim() : 'gpt-image-1';
  const size = typeof input.size === 'string' && ALLOWED_SIZES.has(input.size) ? input.size : '1024x1024';
  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, prompt, size, n: 1 }),
    cache: 'no-store'
  });

  if (!response.ok) {
    const raw = await response.text();
    let message = `Image provider returned HTTP ${response.status}.`;
    try { const parsed = JSON.parse(raw); if (typeof parsed?.error?.message === 'string') message = parsed.error.message; } catch { /* keep safe provider error */ }
    return NextResponse.json({ error: message }, { status: response.status >= 500 ? 502 : response.status, headers: { 'cache-control': 'no-store' } });
  }

  const data: unknown = await response.json();
  const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const items = Array.isArray(root.data) ? root.data : [];
  const first = items[0] && typeof items[0] === 'object' ? items[0] as Record<string, unknown> : {};
  const url = typeof first.url === 'string' ? first.url : '';
  const b64 = typeof first.b64_json === 'string' ? first.b64_json : '';
  if (!url && !b64) return NextResponse.json({ error: 'Image provider returned no image data.' }, { status: 502 });

  return NextResponse.json({ model, size, image: url ? { type: 'url', value: url } : { type: 'base64', value: b64 } }, { headers: { 'cache-control': 'no-store' } });
}
