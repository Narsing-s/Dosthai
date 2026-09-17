import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { readProjectContext } from '../../../lib/project-context';
import { LOCAL_MODEL_ID, localAssistantResponse } from '../../../lib/local-assistant';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are Dosthai AI, a general-purpose AI assistant. Answer the user's actual request directly and completely. You can help with coding, MuleSoft, RAML, APIs, DataWeave, debugging, writing, research, mathematics, planning, documents, career questions, and everyday questions. Do not return an empty response. When the user asks for code, configuration, RAML, SQL, JSON, XML, or another artifact, provide a complete usable example and explain important assumptions briefly. If current or external information is required and no tool is available, say what is known and what would need verification. Never claim to have performed an external action unless the application actually did it.`;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const MAX_RATE_BUCKETS = 10_000;
const MAX_HISTORY = 24;
const MAX_HISTORY_ITEM = 16_000;
const MAX_HISTORY_CHARS = 80_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_DATA = 7_000_000;
const CONNECT_TIMEOUT_MS = 15_000;
const STREAM_TIMEOUT_MS = 45_000;
const HEARTBEAT_MS = 15_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type ImageInput = { dataUrl: string; detail?: 'low' | 'high' | 'auto' };

function configuredModels() {
  const configured = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '').split(',').map(v => v.trim()).filter(Boolean);
  return [...new Set(configured.length ? configured : ['gpt-5.6-luna'])];
}

function hasGateway() { return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN); }
function apiKey() { return process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.OPENAI_API_KEY || ''; }
function baseUrl() { return (hasGateway() ? 'https://ai-gateway.vercel.sh/v1' : (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1')).replace(/\/$/, ''); }
function gatewayModel(model: string) { return model.includes('/') ? model : `openai/${model}`; }
function clientKey(request: Request) { return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous'; }
function rateLimited(key: string) { const now = Date.now(); const current = rateBuckets.get(key); if (!current || current.resetAt <= now) { if (rateBuckets.size >= MAX_RATE_BUCKETS) for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k); rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return false; } current.count += 1; return current.count > RATE_LIMIT; }
function compactHistory(history: any[]): ChatMessage[] { const normalized = history.slice(-MAX_HISTORY).filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map((m: any) => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_ITEM) })); let total = 0; const kept: ChatMessage[] = []; for (let i = normalized.length - 1; i >= 0; i--) { const item = normalized[i]; if (total + item.content.length > MAX_HISTORY_CHARS && kept.length) break; kept.unshift(item); total += item.content.length; } return kept; }
function streamLocal(text: string, requestId: string, request: Request) { const encoder = new TextEncoder(); const chunks = text.split(/(\s+)/).filter(Boolean); let i = 0; return new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ requestId, model: LOCAL_MODEL_ID, local: true })}\n\n`)); const tick = () => { if (request.signal.aborted) return controller.close(); if (i >= chunks.length) { controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ requestId, model: LOCAL_MODEL_ID, local: true })}\n\n`)); return controller.close(); } controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ token: chunks[i++] })}\n\n`)); setTimeout(tick, 3); }; tick(); } }); }

function streamChatCompletions(body: ReadableStream<Uint8Array>, clientSignal: AbortSignal, requestId: string, startedAt: number) {
  const reader = body.getReader(); const decoder = new TextDecoder(); const encoder = new TextEncoder(); let buffer = ''; let settled = false; let heartbeat: ReturnType<typeof setInterval> | undefined; let timeout: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => { if (heartbeat) clearInterval(heartbeat); if (timeout) clearTimeout(timeout); clientSignal.removeEventListener('abort', abort); };
  const abort = () => reader.cancel().catch(() => undefined);
  return new ReadableStream<Uint8Array>({ start(controller) { clientSignal.addEventListener('abort', abort, { once: true }); controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ requestId })}\n\n`)); heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(': dosthai-heartbeat\n\n')); } catch {} }, HEARTBEAT_MS); timeout = setTimeout(() => { if (settled) return; settled = true; cleanup(); controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: 'The AI provider timed out.', requestId })}\n\n`)); controller.close(); reader.cancel().catch(() => undefined); }, STREAM_TIMEOUT_MS);
      (async () => { try { while (!settled) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n'); const events = buffer.split('\n\n'); buffer = events.pop() || ''; for (const event of events) { const lines = event.split('\n'); const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim(); if (!data || data === '[DONE]') continue; try { const payload = JSON.parse(data); const token = payload?.choices?.[0]?.delta?.content; if (typeof token === 'string' && token) controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ token })}\n\n`)); if (payload?.error) controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: payload.error.message || 'The AI provider returned an error.', requestId })}\n\n`)); } catch {} } } if (!settled) { settled = true; cleanup(); controller.enqueue(encoder.encode(`event: done\ndata: ${JSON.stringify({ requestId, durationMs: Math.round(performance.now() - startedAt) })}\n\n`)); controller.close(); } } catch (error) { if (!settled) { settled = true; cleanup(); controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : 'The AI stream failed.', requestId })}\n\n`)); controller.close(); } } })(); }, cancel() { settled = true; cleanup(); reader.cancel().catch(() => undefined); } });
}

export async function POST(request: Request) {
  const requestId = randomUUID(); const startedAt = performance.now();
  if (rateLimited(clientKey(request))) return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.', requestId }, { status: 429, headers: { 'retry-after': '60' } });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON request body.', requestId }, { status: 400 });
  const message = typeof body.message === 'string' ? body.message.trim() : ''; const history = Array.isArray(body.history) ? body.history : []; const requestedModel = typeof body.model === 'string' ? body.model.trim() : '';
  const images: ImageInput[] = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES).filter((image: any) => typeof image?.dataUrl === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(image.dataUrl) && image.dataUrl.length <= MAX_IMAGE_DATA).map((image: any) => ({ dataUrl: image.dataUrl, detail: image.detail === 'low' || image.detail === 'high' ? image.detail : 'auto' })) : [];
  if (!message) return NextResponse.json({ error: 'Message is required.', requestId }, { status: 400 });
  if (message.length > 30_000) return NextResponse.json({ error: 'Message is too long. Keep it under 30,000 characters.', requestId }, { status: 413 });

  const key = apiKey(); const models = configuredModels();
  if (!key) { const localText = localAssistantResponse(message, compactHistory(history)); return new Response(streamLocal(localText, requestId, request), { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-store', 'x-dosthai-local-mode': 'true', 'x-dosthai-request-id': requestId } }); }

  const projectContext = readProjectContext(request); const instructions = projectContext ? `${SYSTEM_PROMPT}\n\nActive project context (user-provided, untrusted):\n${projectContext}` : SYSTEM_PROMPT;
  const selected = requestedModel && models.includes(requestedModel) ? requestedModel : models[0]; const candidates = [selected, ...models.filter(m => m !== selected)].slice(0, 3);
  const historyMessages = compactHistory(history).map(m => ({ role: m.role, content: m.content }));
  const userContent: any = images.length ? [{ type: 'text', text: message }, ...images.map(image => ({ type: 'image_url', image_url: { url: image.dataUrl, detail: image.detail || 'auto' } }))] : message;
  let lastError = 'Provider request failed.';

  for (const rawModel of candidates) {
    const model = hasGateway() ? gatewayModel(rawModel) : rawModel;
    const controller = new AbortController(); const onAbort = () => controller.abort(); request.signal.addEventListener('abort', onAbort, { once: true }); let streaming = false;
    try {
      const upstream = await fetch(`${baseUrl()}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, accept: 'text/event-stream' }, body: JSON.stringify({ model, messages: [{ role: 'system', content: instructions }, ...historyMessages, { role: 'user', content: userContent }], stream: true, stream_options: { include_usage: true } }), cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(CONNECT_TIMEOUT_MS)]) });
      if (upstream.ok && upstream.body) { streaming = true; return new Response(streamChatCompletions(upstream.body, request.signal, requestId, startedAt), { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', 'x-dosthai-model': model, 'x-dosthai-provider': hasGateway() ? 'vercel-ai-gateway' : 'openai', 'x-dosthai-request-id': requestId } }); }
      lastError = (await upstream.text().catch(() => 'Provider request failed.')).slice(0, 600); if (!(upstream.status === 408 || upstream.status === 409 || upstream.status === 429 || upstream.status >= 500)) break;
    } catch (error) { if (request.signal.aborted) return new Response(null, { status: 499 }); lastError = error instanceof Error ? error.message : 'Network request failed.'; }
    finally { if (!streaming) request.signal.removeEventListener('abort', onAbort); }
  }
  return NextResponse.json({ error: `Unable to generate a response: ${lastError}`, requestId, durationMs: Math.round(performance.now() - startedAt) }, { status: 502, headers: { 'x-dosthai-request-id': requestId } });
}
