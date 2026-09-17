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
const MAX_HISTORY = 20;
const MAX_HISTORY_ITEM = 12_000;
const MAX_HISTORY_CHARS = 60_000;
const REQUEST_TIMEOUT_MS = 45_000;
const RESEARCH_TIMEOUT_MS = 15_000;

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

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS) {
  const timeoutController = new AbortController();
  const parentSignal = init.signal;
  const abort = () => timeoutController.abort();
  if (parentSignal?.aborted) timeoutController.abort();
  else parentSignal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: timeoutController.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abort);
  }
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
  const response = await fetchWithTimeout(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ query: query.trim(), num_results: MAX_RESULTS }), cache: 'no-store', signal }, RESEARCH_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Research provider returned HTTP ${response.status}.`);
  const data: unknown = await response.json();
  const object = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const raw = Array.isArray(object.results) ? object.results : Array.isArray(object.items) ? object.items : Array.isArray(object.data) ? object.data : [];
  return raw.slice(0, MAX_RESULTS).map((item: unknown): AgentSource => {
    const record: ResearchRecord = item && typeof item === 'object' ? item as ResearchRecord : {};
    return { title: typeof record.title === 'string' ? record.title.slice(0, 300) : 'Untitled source', url: typeof record.url === 'string' ? record.url : typeof record.link === 'string' ? record.link : '', snippet: typeof record.snippet === 'string' ? record.snippet.slice(0, 1000) : typeof record.description === 'string' ? record.description.slice(0, 1000) : '' };
  }).filter((source: AgentSource) => Boolean(source.url));
}

const calculatorTool = { type: 'function', function: { name: 'calculator', description: 'Evaluate basic arithmetic exactly. Use for arithmetic instead of estimating.', parameters: { type: 'object', properties: { expression: { type: 'string' } }, required: ['expression'], additionalProperties: false } } };
const researchTool = { type: 'function', function: { name: 'web_research', description: 'Search current public information and return source metadata. Use when current or externally verifiable information is required.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } } };

function availableTools() {
  return process.env.WEB_SEARCH_API_URL && process.env.WEB_SEARCH_API_KEY ? [calculatorTool, researchTool] : [calculatorTool];
}

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

function isRetryableProviderStatus(status: number) {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function buildHistory(input: Array<{ role: 'user' | 'assistant'; content: string }> | undefined, message: string) {
  let historyChars = 0;
  const history = (input || []).slice(-MAX_HISTORY).filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').reverse().flatMap(item => {
    const content = item.content.slice(0, MAX_HISTORY_ITEM);
    if (historyChars + content.length > MAX_HISTORY_CHARS) return [];
    historyChars += content.length;
    return [{ role: item.role, content }];
  }).reverse();
  return [{ role: 'system', content: `You are Dosthai Agent. Complete the user task using available tools when useful. ${availableTools().length > 1 ? 'Use web_research for current or externally verifiable information and mention research sources when used.' : 'Web research is not configured, so do not claim to have searched the web.'} Use calculator for arithmetic. External or mutating actions are not available in this runtime. Return a concise, useful final answer.` }, ...history, { role: 'user', content: message }] as ProviderMessage[];
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
  const tools = availableTools();
  let lastError: unknown;
  for (let modelIndex = 0; modelIndex < orderedModels.length; modelIndex++) {
    const model = orderedModels[modelIndex];
    try {
      const messages = buildHistory(input.history, message);
      const sources: AgentSource[] = [];
      const toolResults: AgentToolResult[] = [];
      for (let step = 0; step < MAX_STEPS; step++) {
        const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', parallel_tool_calls: true, temperature: 0.2 }), cache: 'no-store', signal: input.signal }, REQUEST_TIMEOUT_MS);
        if (!response.ok) throw Object.assign(new Error(`AI provider returned HTTP ${response.status}.`), { retryable: isRetryableProviderStatus(response.status) });
        const data: unknown = await response.json();
        const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
        const choices = Array.isArray(root.choices) ? root.choices : [];
        const choice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {};
        const assistant = choice.message && typeof choice.message === 'object' ? choice.message as Record<string, unknown> : null;
        if (!assistant) throw new Error('AI provider returned no message.');
        const rawToolCalls = Array.isArray(assistant.tool_calls) ? assistant.tool_calls.slice(0, MAX_TOOL_CALLS_PER_STEP) : [];
        messages.push({ role: 'assistant', content: typeof assistant.content === 'string' ? assistant.content : null, ...(rawToolCalls.length ? { tool_calls: rawToolCalls } : {}) });
        if (!rawToolCalls.length) return { answer: typeof assistant.content === 'string' ? assistant.content : '', model, steps: step + 1, sources, toolResults };
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
      const retryable = Boolean(error && typeof error === 'object' && 'retryable' in error && (error as { retryable?: unknown }).retryable === true);
      if (!retryable || modelIndex === orderedModels.length - 1) throw error instanceof Error ? error : new Error('Agent request failed.');
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Agent request failed.');
}

type AgentStreamEvent =
  | { type: 'token'; token: string }
  | { type: 'status'; message: string }
  | { type: 'meta'; model: string; steps: number; sources: AgentSource[]; toolResults: AgentToolResult[] };

function providerDeltaToolCall(call: unknown) {
  const value = call && typeof call === 'object' ? call as Record<string, unknown> : {};
  const fn = value.function && typeof value.function === 'object' ? value.function as Record<string, unknown> : {};
  return { index: typeof value.index === 'number' ? value.index : 0, id: typeof value.id === 'string' ? value.id : '', name: typeof fn.name === 'string' ? fn.name : '', arguments: typeof fn.arguments === 'string' ? fn.arguments : '' };
}

async function readProviderStream(response: Response, onEvent: (event: AgentStreamEvent) => void, signal?: AbortSignal) {
  if (!response.body) throw new Error('AI provider returned an empty stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let answer = '';
  const toolParts = new Map<number, { id: string; name: string; arguments: string }>();
  const processLine = (line: string) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    let parsed: unknown;
    try { parsed = JSON.parse(payload); } catch { return; }
    const root = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    const choices = Array.isArray(root.choices) ? root.choices : [];
    const choice = choices[0] && typeof choices[0] === 'object' ? choices[0] as Record<string, unknown> : {};
    const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta as Record<string, unknown> : {};
    if (typeof delta.content === 'string' && delta.content) { answer += delta.content; onEvent({ type: 'token', token: delta.content }); }
    if (Array.isArray(delta.tool_calls)) for (const raw of delta.tool_calls) {
      const call = providerDeltaToolCall(raw);
      const current = toolParts.get(call.index) || { id: '', name: '', arguments: '' };
      if (call.id) current.id = call.id;
      if (call.name) current.name += call.name;
      current.arguments += call.arguments;
      toolParts.set(call.index, current);
    }
  };
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) processLine(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) processLine(buffer.trim());
  } finally {
    try { await reader.cancel(); } catch { /* stream already closed */ }
  }
  const toolCalls = [...toolParts.entries()].sort((a, b) => a[0] - b[0]).slice(0, MAX_TOOL_CALLS_PER_STEP).map(([index, call]) => ({ id: call.id || `call_${index}`, type: 'function', function: { name: call.name, arguments: call.arguments } }));
  return { answer, toolCalls };
}

export async function runAgentStream(input: { message: string; history?: Array<{ role: 'user' | 'assistant'; content: string }>; model?: string; signal?: AbortSignal; onEvent: (event: AgentStreamEvent) => void }): Promise<AgentRunResult> {
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
  const tools = availableTools();
  let lastError: unknown;

  for (let modelIndex = 0; modelIndex < orderedModels.length; modelIndex++) {
    const model = orderedModels[modelIndex];
    try {
      const messages = buildHistory(input.history, message);
      const sources: AgentSource[] = [];
      const toolResults: AgentToolResult[] = [];
      let finalAnswer = '';
      for (let step = 0; step < MAX_STEPS; step++) {
        input.onEvent({ type: 'status', message: step === 0 ? 'Thinking…' : 'Using tools…' });
        const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', parallel_tool_calls: true, temperature: 0.2, stream: true }), cache: 'no-store', signal: input.signal }, REQUEST_TIMEOUT_MS);
        if (!response.ok) throw Object.assign(new Error(`AI provider returned HTTP ${response.status}.`), { retryable: isRetryableProviderStatus(response.status) });
        const streamed = await readProviderStream(response, input.onEvent, input.signal);
        const assistantToolCalls = streamed.toolCalls;
        messages.push({ role: 'assistant', content: streamed.answer || null, ...(assistantToolCalls.length ? { tool_calls: assistantToolCalls } : {}) });
        finalAnswer = streamed.answer;
        if (!assistantToolCalls.length) {
          input.onEvent({ type: 'meta', model, steps: step + 1, sources, toolResults });
          return { answer: finalAnswer, model, steps: step + 1, sources, toolResults };
        }
        const parsedCalls = assistantToolCalls.map(parseToolCall);
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
      const retryable = Boolean(error && typeof error === 'object' && 'retryable' in error && (error as { retryable?: unknown }).retryable === true);
      if (!retryable || modelIndex === orderedModels.length - 1) throw error instanceof Error ? error : new Error('Agent request failed.');
      input.onEvent({ type: 'status', message: 'Switching to the next configured model…' });
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Agent request failed.');
}
