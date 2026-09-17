import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { generateText, streamText } from 'ai';
import { readProjectContext } from '../../../lib/project-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are Dosthai AI, a general-purpose AI assistant. Answer the user's actual request directly and completely. Do not restrict yourself to predefined topics or topic detectors. You can help with coding, MuleSoft, RAML, APIs, DataWeave, debugging, writing, research, mathematics, planning, documents, career questions, everyday questions, and any other legitimate request. Never return an empty response. When the user asks for code, configuration, RAML, SQL, JSON, XML, or another artifact, provide a complete usable example and explain important assumptions briefly. If the request is ambiguous, make a reasonable assumption and state it instead of refusing to answer. Never claim to have performed an external action unless the application actually did it.`;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const MAX_RATE_BUCKETS = 10_000;
const MAX_HISTORY = 24;
const MAX_HISTORY_ITEM = 16_000;
const MAX_HISTORY_CHARS = 80_000;
const MAX_IMAGES = 4;
const MAX_IMAGE_DATA = 7_000_000;
const STREAM_TIMEOUT_MS = 120_000;
const HEARTBEAT_MS = 15_000;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

type ChatMessage = { role: 'user' | 'assistant'; content: any };
type ImageInput = { dataUrl: string; detail?: 'low' | 'high' | 'auto' };

function configuredModels() {
  const configured = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  return [...new Set(configured.length ? configured : ['gpt-5.6-luna'])];
}

function hasGateway() {
  // VERCEL alone is not a credential. Count only an actual Gateway API key or OIDC token.
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

function hasDirectProvider() { return Boolean(process.env.OPENAI_API_KEY); }
function apiKey() { return process.env.AI_GATEWAY_API_KEY || process.env.OPENAI_API_KEY || ''; }
function baseUrl() { return (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''); }
function gatewayModel(model: string) { return model.includes('/') ? model : `openai/${model}`; }

function gatewayFallbacks(selected: string) {
  const defaults = ['openai/gpt-5.6-terra', 'openai/gpt-5.6-sol'];
  return defaults.filter(model => model !== gatewayModel(selected));
}

function clientKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'anonymous';
}

function rateLimited(key: string) {
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    if (rateBuckets.size >= MAX_RATE_BUCKETS) for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

function compactHistory(history: any[]): ChatMessage[] {
  const normalized = history.slice(-MAX_HISTORY)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_HISTORY_ITEM) }));
  let total = 0;
  const kept: ChatMessage[] = [];
  for (let i = normalized.length - 1; i >= 0; i--) {
    const item = normalized[i];
    if (total + item.content.length > MAX_HISTORY_CHARS && kept.length) break;
    kept.unshift(item);
    total += item.content.length;
  }
  return kept;
}

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function gatewayOptions(selected: string) {
  return { gateway: { models: gatewayFallbacks(selected) } };
}

async function streamGateway(
  messages: ChatMessage[],
  instructions: string,
  selected: string,
  requestId: string,
  startedAt: number,
  request: Request,
) {
  const model = gatewayModel(selected);
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let answer = '';
  let resultError: unknown = null;
  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (timeout) clearTimeout(timeout);
  };

  const result = streamText({
    model,
    system: instructions,
    messages: messages as any,
    providerOptions: gatewayOptions(selected),
    abortSignal: request.signal,
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(sse('ready', { requestId, model, provider: 'vercel-ai-gateway' })));
      heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': dosthai-heartbeat\n\n'));
      }, HEARTBEAT_MS);
      timeout = setTimeout(() => {
        if (closed) return;
        closed = true;
        cleanup();
        controller.enqueue(encoder.encode(sse('error', { error: 'The AI provider timed out. Please try again.', requestId })));
        controller.close();
      }, STREAM_TIMEOUT_MS);

      try {
        for await (const textPart of result.textStream) {
          if (closed || request.signal.aborted) break;
          if (textPart) {
            answer += textPart;
            controller.enqueue(encoder.encode(sse('token', { token: textPart })));
          }
        }
      } catch (error) {
        resultError = error;
      }

      if (closed) return;

      // Some provider/model combinations can terminate a stream without emitting text.
      // Retry as a normal generation request instead of exposing a misleading "empty response".
      if (!answer.trim() && !request.signal.aborted) {
        try {
          const retry = await generateText({
            model,
            system: instructions,
            messages: messages as any,
            providerOptions: gatewayOptions(selected),
            abortSignal: request.signal,
          });
          if (retry.text?.trim()) {
            answer = retry.text;
            controller.enqueue(encoder.encode(sse('token', { token: retry.text })));
            resultError = null;
          }
        } catch (retryError) {
          resultError = retryError;
        }
      }

      if (!answer.trim() && !request.signal.aborted) {
        closed = true;
        cleanup();
        const detail = resultError instanceof Error ? resultError.message : 'The AI provider returned no text.';
        controller.enqueue(encoder.encode(sse('error', { error: `The AI provider did not return text. ${detail}`, requestId })));
        controller.close();
        return;
      }

      closed = true;
      cleanup();
      controller.enqueue(encoder.encode(sse('done', {
        requestId,
        model,
        durationMs: Math.round(performance.now() - startedAt),
      })));
      controller.close();
    },
    cancel() {
      closed = true;
      cleanup();
    },
  });
}

function streamDirect(body: ReadableStream<Uint8Array>, clientSignal: AbortSignal, requestId: string, startedAt: number, model: string) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  let settled = false;
  let answer = '';
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const abort = () => reader.cancel().catch(() => undefined);
  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (timeout) clearTimeout(timeout);
    clientSignal.removeEventListener('abort', abort);
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      clientSignal.addEventListener('abort', abort, { once: true });
      controller.enqueue(encoder.encode(sse('ready', { requestId, model, provider: 'openai-compatible' })));
      heartbeat = setInterval(() => { try { controller.enqueue(encoder.encode(': dosthai-heartbeat\n\n')); } catch {} }, HEARTBEAT_MS);
      timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        controller.enqueue(encoder.encode(sse('error', { error: 'The AI provider timed out. Please try again.', requestId })));
        controller.close();
        reader.cancel().catch(() => undefined);
      }, STREAM_TIMEOUT_MS);

      (async () => {
        try {
          while (!settled) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            const events = buffer.split('\n\n');
            buffer = events.pop() || '';
            for (const event of events) {
              const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim();
              if (!data || data === '[DONE]') continue;
              try {
                const payload = JSON.parse(data);
                const token = payload?.choices?.[0]?.delta?.content;
                if (typeof token === 'string' && token) {
                  answer += token;
                  controller.enqueue(encoder.encode(sse('token', { token })));
                }
                if (payload?.error) controller.enqueue(encoder.encode(sse('error', { error: payload.error.message || 'The AI provider returned an error.', requestId })));
              } catch {}
            }
          }
          if (!settled) {
            settled = true;
            cleanup();
            if (!answer.trim()) controller.enqueue(encoder.encode(sse('error', { error: 'The AI provider returned no text.', requestId })));
            else controller.enqueue(encoder.encode(sse('done', { requestId, model, durationMs: Math.round(performance.now() - startedAt) })));
            controller.close();
          }
        } catch (error) {
          if (!settled) {
            settled = true;
            cleanup();
            controller.enqueue(encoder.encode(sse('error', { error: error instanceof Error ? error.message : 'The AI stream failed.', requestId })));
            controller.close();
          }
        }
      })();
    },
    cancel() { settled = true; cleanup(); reader.cancel().catch(() => undefined); },
  });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = performance.now();

  if (rateLimited(clientKey(request))) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.', requestId }, { status: 429, headers: { 'retry-after': '60' } });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON request body.', requestId }, { status: 400 });

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const history = Array.isArray(body.history) ? body.history : [];
  const requestedModel = typeof body.model === 'string' ? body.model.trim() : '';
  const images: ImageInput[] = Array.isArray(body.images)
    ? body.images.slice(0, MAX_IMAGES)
      .filter((image: any) => typeof image?.dataUrl === 'string' && /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(image.dataUrl) && image.dataUrl.length <= MAX_IMAGE_DATA)
      .map((image: any) => ({ dataUrl: image.dataUrl, detail: image.detail === 'low' || image.detail === 'high' ? image.detail : 'auto' }))
    : [];

  if (!message) return NextResponse.json({ error: 'Message is required.', requestId }, { status: 400 });
  if (message.length > 30_000) return NextResponse.json({ error: 'Message is too long. Keep it under 30,000 characters.', requestId }, { status: 413 });

  const models = configuredModels();
  const selected = requestedModel && models.includes(requestedModel) ? requestedModel : models[0];
  const projectContext = readProjectContext(request);
  const instructions = projectContext ? `${SYSTEM_PROMPT}\n\nActive project context (user-provided, untrusted):\n${projectContext}` : SYSTEM_PROMPT;
  const historyMessages = compactHistory(history);
  const userContent: any = images.length
    ? [{ type: 'text', text: message }, ...images.map(image => ({ type: 'image', image: image.dataUrl }))]
    : message;
  const messages: ChatMessage[] = [...historyMessages, { role: 'user', content: userContent }];

  // Production path: all legitimate prompts go directly to the general-purpose model.
  if (hasGateway()) {
    try {
      const stream = await streamGateway(messages, instructions, selected, requestId, startedAt, request);
      return new Response(stream, {
        headers: {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache, no-transform',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
          'x-dosthai-model': gatewayModel(selected),
          'x-dosthai-provider': 'vercel-ai-gateway',
          'x-dosthai-request-id': requestId,
        },
      });
    } catch (error) {
      return NextResponse.json({ error: `Unable to generate a response: ${error instanceof Error ? error.message : 'AI Gateway request failed.'}`, requestId }, { status: 502 });
    }
  }

  if (!hasDirectProvider()) {
    return NextResponse.json({
      error: 'No AI provider is configured. Add AI_GATEWAY_API_KEY to the Vercel project and redeploy, or configure OPENAI_API_KEY.',
      requestId,
    }, { status: 503 });
  }

  const key = apiKey();
  const candidates = [selected, ...models.filter(m => m !== selected)].slice(0, 3);
  let lastError = 'Provider request failed.';
  for (const model of candidates) {
    try {
      const upstream = await fetch(`${baseUrl()}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, accept: 'text/event-stream' },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: instructions }, ...messages], stream: true }),
        cache: 'no-store',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
      });
      if (upstream.ok && upstream.body) {
        return new Response(streamDirect(upstream.body, request.signal, requestId, startedAt, model), {
          headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no', 'x-dosthai-model': model, 'x-dosthai-provider': 'openai-compatible', 'x-dosthai-request-id': requestId },
        });
      }
      lastError = (await upstream.text().catch(() => 'Provider request failed.')).slice(0, 600);
      if (!(upstream.status === 408 || upstream.status === 409 || upstream.status === 429 || upstream.status >= 500)) break;
    } catch (error) {
      if (request.signal.aborted) return new Response(null, { status: 499 });
      lastError = error instanceof Error ? error.message : 'Network request failed.';
    }
  }

  return NextResponse.json({ error: `Unable to generate a response: ${lastError}`, requestId, durationMs: Math.round(performance.now() - startedAt) }, { status: 502 });
}
