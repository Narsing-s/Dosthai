import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_STEPS = 4;
const MAX_RESULTS = 8;
const DEFAULT_MODELS = ['gpt-5.6-terra', 'gpt-5.6-sol', 'gpt-5.6-luna'];

function allowedModels() {
  const configured = (process.env.DOSTHAI_MODELS || '').split(',').map(v => v.trim()).filter(Boolean);
  return configured.length ? configured : DEFAULT_MODELS;
}

function calculator(expression: string): number {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (!tokens || tokens.join('') !== expression.replace(/\s+/g, '')) throw new Error('Only basic arithmetic expressions are supported.');
  let index = 0;
  const primary = (): number => {
    const token = tokens[index++];
    if (token === '(') {
      const value = additive();
      if (tokens[index++] !== ')') throw new Error('Unbalanced parentheses.');
      return value;
    }
    if (token === '-' || token === '+') return (token === '-' ? -1 : 1) * primary();
    const value = Number(token);
    if (!Number.isFinite(value)) throw new Error('Invalid number.');
    return value;
  };
  const multiplicative = (): number => {
    let value = primary();
    while (['*', '/', '%'].includes(tokens[index])) {
      const op = tokens[index++];
      const right = primary();
      if (op === '*') value *= right;
      if (op === '/') { if (right === 0) throw new Error('Division by zero.'); value /= right; }
      if (op === '%') { if (right === 0) throw new Error('Division by zero.'); value %= right; }
    }
    return value;
  };
  const additive = (): number => {
    let value = multiplicative();
    while (tokens[index] === '+' || tokens[index] === '-') {
      const op = tokens[index++];
      const right = multiplicative();
      value = op === '+' ? value + right : value - right;
    }
    return value;
  };
  const result = additive();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid arithmetic expression.');
  return result;
}

async function webResearch(query: string) {
  const endpoint = process.env.WEB_SEARCH_API_URL;
  const key = process.env.WEB_SEARCH_API_KEY;
  if (!endpoint || !key) throw new Error('Web research is not configured.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, num_results: MAX_RESULTS }),
    cache: 'no-store'
  });
  if (!response.ok) throw new Error(`Research provider returned HTTP ${response.status}.`);
  const data = await response.json();
  const raw = Array.isArray(data?.results) ? data.results : Array.isArray(data?.items) ? data.items : Array.isArray(data?.data) ? data.data : [];
  return raw.slice(0, MAX_RESULTS).map((item: any) => ({
    title: typeof item?.title === 'string' ? item.title.slice(0, 300) : 'Untitled source',
    url: typeof item?.url === 'string' ? item.url : typeof item?.link === 'string' ? item.link : '',
    snippet: typeof item?.snippet === 'string' ? item.snippet.slice(0, 1000) : typeof item?.description === 'string' ? item.description.slice(0, 1000) : ''
  }));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  if (message.length > 30000) return NextResponse.json({ error: 'Message is too long.' }, { status: 413 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'No AI provider is configured.' }, { status: 503 });

  const models = allowedModels();
  const requested = typeof body.model === 'string' ? body.model.trim() : '';
  const model = models.includes(requested) ? requested : models[0];
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const history = Array.isArray(body.history) ? body.history.slice(-20).filter((item: any) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').map((item: any) => ({ role: item.role, content: item.content.slice(0, 12000) })) : [];

  const tools = [
    { type: 'function', function: { name: 'calculator', description: 'Evaluate basic arithmetic exactly. Use for arithmetic instead of estimating.', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'], additionalProperties: false } } },
    { type: 'function', function: { name: 'web_research', description: 'Search current public information and return source metadata. Use when current or externally verifiable information is required.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } }
  ];

  const messages: any[] = [
    { role: 'system', content: 'You are Dosthai Agent. Solve the user task using available tools when useful. Never invent tool results. For current information use web_research. For arithmetic use calculator. Give a concise final answer and mention sources when research was used.' },
    ...history,
    { role: 'user', content: message }
  ];

  let researchSources: any[] = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.2 }),
      cache: 'no-store'
    });
    if (!response.ok) return NextResponse.json({ error: `AI provider returned HTTP ${response.status}.` }, { status: 502 });
    const data = await response.json();
    const assistant = data?.choices?.[0]?.message;
    if (!assistant) return NextResponse.json({ error: 'AI provider returned no message.' }, { status: 502 });
    messages.push(assistant);
    const calls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls : [];
    if (!calls.length) return NextResponse.json({ answer: typeof assistant.content === 'string' ? assistant.content : '', model, steps: step + 1, sources: researchSources });

    for (const call of calls.slice(0, 4)) {
      const name = call?.function?.name;
      let args: any = {};
      try { args = JSON.parse(call?.function?.arguments || '{}'); } catch { args = {}; }
      let result: any;
      try {
        if (name === 'calculator') result = { value: calculator(String(args.expression || '')) };
        else if (name === 'web_research') { result = { results: await webResearch(String(args.query || '')) }; researchSources.push(...result.results); }
        else result = { error: 'Unknown tool.' };
      } catch (error) { result = { error: error instanceof Error ? error.message : 'Tool execution failed.' }; }
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  return NextResponse.json({ error: 'Agent reached its maximum tool steps without completing the task.', model, sources: researchSources }, { status: 504 });
}
