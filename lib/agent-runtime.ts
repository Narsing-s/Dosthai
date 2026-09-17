export type AgentSource = { title: string; url: string; snippet: string };
export type AgentToolResult = { name: string; output: unknown };
export type AgentRunResult = { answer: string; model: string; steps: number; sources: AgentSource[]; toolResults: AgentToolResult[] };

type ResearchRecord = Record<string, unknown>;
type ProviderMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
  tool_calls?: unknown[];
};

const MAX_STEPS = 4;
const MAX_TOOL_CALLS_PER_STEP = 4;
const MAX_RESULTS = 8;
const REQUEST_TIMEOUT_MS = 45_000;

function allowedModels() {
  const configured = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '').split(',').map(v => v.trim()).filter(Boolean);
  return [...new Set(configured)];
}

function withTimeout<T>(promise: Promise<T>, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('The operation was aborted.', 'AbortError'));
    const timer = setTimeout(() => reject(new Error('AI provider request timed out.')), timeoutMs);
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('The operation was aborted.', 'AbortError')); };
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(value => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); resolve(value); }, error => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); reject(error); });
  });
}

function calculator(expression: string): number {
  const normalized = expression.replace(/\s+/g, '');
  if (normalized.length > 200) throw new Error('Expression is too long.');
  const tokens = normalized.match(/\d+(?:\.\d+)?|[()+\-*/%]/g);
  if (!tokens || tokens.join('') !== normalized) throw new Error('Only basic arithmetic expressions are supported.');
  let index = 0;
  const primary = (): number => {
    const token = tokens[index++];
    if (token === '(') { const value = additive(); if (tokens[index++] !== ')') throw new Error('Unbalanced parentheses.'); return value; }
    if (token === '-' || token === '+') return (token === '-' ? -1 : 1) * primary();
    const value = Number(token); if (!Number.isFinite(value)) throw new Error('Invalid number.'); return value;
  };
  const multiplicative = (): number => { let value = primary(); while (['*', '/', '%'].includes(tokens[index])) { const op = tokens[index++]; const right = primary(); if (op === '*') value *= right; if (op === '/') { if (right === 0) throw new Error('Division by zero.'); value /= right; } if (op === '%') { if (right === 0) throw new Error('Division by zero.'); value %= right; } } return value; };
  const additive = (): number => { let value = multiplicative(); while (tokens[index] === '+' || tokens[index] === '-') { const op = tokens[index++]; const right = multiplicative(); value = op === '+' ? value + right : value - right; } return value; };
  const result = additive();
  if (index !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid arithmetic expression.');
  return result;
}

async function webResearch(query: string, signal?: AbortSignal): Promise<AgentSource[]> {
  const endpoint = process.env.WEB_SEARCH_API_URL;
  const key = process.env.WEB_SEARCH_API_KEY;
  if (!endpoint || !key) throw new Error('Web research is not configured.');
  if (!query.trim() || query.length > 2000) throw new Error('Research query is invalid.');
  const response = await withTimeout(fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ query: query.trim(), num_results: MAX_RESULTS }), cache: 'no-store', signal }), signal);
  if (!response.ok) throw new Error(`Research provider returned HTTP ${response.status}.`);
  const data: unknown = await response.json();
  const object = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const raw = Array.isArray(object.results) ? object.results : Array.isArray(object.items) ? object.items : Array.isArray(object.data) ? object.data : [];
  return raw.slice(0, MAX_RESULTS).map((item: unknown): AgentSource => {
    const record: ResearchRecord = item && typeof item === 'object' ? item as ResearchRecord : {};
    return { title: typeof record.title === 'string' ? record.title.slice(0, 300) : 'Untitled source', url: typeof record.url === 'string' ? record.url : typeof record.link === 'string' ? record.link : '', snippet: typeof record.snippet === 'string' ? record.snippet.slice(0, 1000) : typeof record.description === 'string' ? record.description.slice(0, 1000) : '' };
  }).filter((source: AgentSource) => Boolean(source.url));
}

const tools = [
  { type: 'function', function: { name: 'calculator', description: 'Evaluate basic arithmetic exactly. Use for arithmetic instead of estimating.', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'], additionalProperties: false } } },
  { type: 'function', function: { name: 'web_research', description: 'Search current public information and return source metadata. Use when current or externally verifiable information is required.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } }
];

type ParsedToolCall = { raw: unknown; name: string; args: Record<string, unknown>; callId: string };

function parseToolCall(rawCall: unknown): ParsedToolCall {
  const call = rawCall && typeof rawCall === 'object' ? rawCall as Record<string, unknown> : {};
  const fn = call.function && typeof call.function === 'object' ? call.function as Record<string, unknown> : {};
  const name = typeof fn.name === 'string' ? fn.name : 'unknown';
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(typeof fn.arguments === 'string' ? fn.arguments : '{}');
    if (parsed && typeof parsed === 'object') args = parsed as Record<string, unknown>;
  } catch { /* invalid tool arguments are handled as empty arguments */ }
  return { raw: rawCall, name, args, callId: typeof call.id === 'string' ? call.id : '' };
}

async function executeTool(call: ParsedToolCall, signal?: AbortSignal): Promise<AgentToolResult & { sourceResults: AgentSource[] }> {
  try {
    if (call.name === 'calculator') return { name: call.name, output: { value: calculator(String(call.args.expression || '')) }, sourceResults: [] };
    if (call.name === 'web_research') {
      const found = await webResearch(String(call.args.query || ''), signal);
      return { name: call.name, output: { results: found }, sourceResults: found };
    }
    return { name: call.name, output: { error: 'Unknown tool.' }, sourceResults: [] };
  } catch (error) {
    return { name: call.name, output: { error: error instanceof Error ? error.message : 'Tool execution failed.' }, sourceResults: [] };
  }
}

export async function runAgent(input: { message: string; history?: Array<{ role: 'user' | 'assistant'; content: string }>; model?: string; signal?: AbortSignal }): Promise<AgentRunResult> {
  const message = input.message.trim();
  if (!message) throw new Error('Message is required.');
  if (message.length > 30_000) throw new Error('Message is too long.');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('No AI provider is configured.');
  const models = allowedModels();
  if (!models.length) throw new Error('No AI model is configured. Set OPENAI_MODEL or DOSTHAI_MODELS.');
  const requested = input.model?.trim() || '';
  const preferred = requested && models.includes(requested) ? requested : models[0];
  const orderedModels = [preferred, ...models.filter(model => model !== preferred)].slice(0, 3);
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const history = (input.history || []).slice(-20).filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').map(item => ({ role: item.role, content: item.content.slice(0, 12_000) }));

  let lastError: unknown;
  for (const model of orderedModels) {
    try {
      const messages: ProviderMessage[] = [{ role: 'system', content: 'You are Dosthai Agent. Complete the user task using available tools when useful. Never invent tool results. Use web_research for current or externally verifiable information and calculator for arithmetic. External or mutating actions are not available in this runtime. Return a concise, useful final answer and mention research sources when used.' }, ...history, { role: 'user', content: message }];
      const sources: AgentSource[] = [];
      const toolResults: AgentToolResult[] = [];
      for (let step = 0; step < MAX_STEPS; step++) {
        const response = await withTimeout(fetch(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.2 }), cache: 'no-store', signal: input.signal }), input.signal);
        if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}.`);
        const data: unknown = await response.json();
        const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
        const choices = Array.isArray(root.choices) ? root.choices : [];
        const choice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {};
        const assistant = choice.message && typeof choice.message === 'object' ? choice.message as Record<string, unknown> : null;
        if (!assistant) throw new Error('AI provider returned no message.');
        const rawToolCalls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls.slice(0, MAX_TOOL_CALLS_PER_STEP) : [];
        messages.push({ role: 'assistant', content: typeof assistant.content === 'string' ? assistant.content : null, ...(rawToolCalls.length ? { tool_calls: rawToolCalls } : {}) });
        if (!rawToolCalls.length) return { answer: typeof assistant.content === 'string' ? assistant.content : '', model, steps: step + 1, sources, toolResults };

        // Independent tools are executed concurrently so a multi-tool step does not wait on each tool sequentially.
        const parsedCalls = rawToolCalls.map(parseToolCall);
        const results = await Promise.all(parsedCalls.map(call => executeTool(call, input.signal)));
        for (let i = 0; i < results.length; i++) {
          const result = results[i];
          toolResults.push({ name: result.name, output: result.output });
          for (const source of result.sourceResults) if (!sources.some(existing => existing.url === source.url)) sources.push(source);
          messages.push({ role: 'tool', tool_call_id: parsedCalls[i].callId, content: JSON.stringify(result.output) });
        }
      }
      throw new Error('Agent reached its maximum tool steps without completing the task.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Agent request failed.');
}
