import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const tools = [
  { id: 'web-research', name: 'Web Research', description: 'Search current public information and return source metadata.', category: 'research', requires: 'WEB_SEARCH_API_URL + WEB_SEARCH_API_KEY', mode: 'read' },
  { id: 'calculator', name: 'Calculator', description: 'Perform deterministic arithmetic without asking the model to guess.', category: 'utility', requires: 'built-in', mode: 'read' },
  { id: 'structured-json', name: 'Structured JSON', description: 'Validate JSON and return normalized data.', category: 'developer', requires: 'built-in', mode: 'read' },
  { id: 'knowledge', name: 'Knowledge Base', description: 'Retrieve relevant user documents with semantic search.', category: 'knowledge', requires: 'VECTOR_DATABASE_URL', mode: 'read' },
  { id: 'code-sandbox', name: 'Code Sandbox', description: 'Execute generated code in an isolated environment.', category: 'developer', requires: 'CODE_EXECUTION_ENABLED', mode: 'execute' },
  { id: 'github', name: 'GitHub', description: 'Read and operate on authorized repositories, issues and pull requests.', category: 'developer', requires: 'GITHUB_APP / OAuth credentials', mode: 'execute' },
  { id: 'image', name: 'Image Generation', description: 'Generate or edit images from prompts.', category: 'multimodal', requires: 'IMAGE_API_KEY', mode: 'execute' },
  { id: 'voice', name: 'Voice', description: 'Speech transcription and text-to-speech.', category: 'multimodal', requires: 'SPEECH_API_KEY', mode: 'execute' }
] as const;

function configured(id: string) {
  switch (id) {
    case 'web-research': return Boolean(process.env.WEB_SEARCH_API_URL && process.env.WEB_SEARCH_API_KEY);
    case 'calculator':
    case 'structured-json': return true;
    case 'knowledge': return Boolean(process.env.VECTOR_DATABASE_URL);
    case 'code-sandbox': return process.env.CODE_EXECUTION_ENABLED === 'true';
    case 'github': return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_TOKEN);
    case 'image': return Boolean(process.env.IMAGE_API_KEY);
    case 'voice': return Boolean(process.env.SPEECH_API_KEY);
    default: return false;
  }
}

function calculate(expression: string): number {
  const source = expression.replace(/\s+/g, '');
  if (!source || source.length > 200 || !/^[0-9()+\-*/%.]+$/.test(source)) throw new Error('Only basic arithmetic is supported.');
  const tokens = source.match(/\d+(?:\.\d+)?|[()+\-*/%]/g) || [];
  if (tokens.join('') !== source) throw new Error('Invalid arithmetic expression.');
  let i = 0;
  const primary = (): number => {
    const token = tokens[i++];
    if (token === '(') { const value = additive(); if (tokens[i++] !== ')') throw new Error('Unbalanced parentheses.'); return value; }
    if (token === '+' || token === '-') return (token === '-' ? -1 : 1) * primary();
    const value = Number(token); if (!Number.isFinite(value)) throw new Error('Invalid number.'); return value;
  };
  const multiplicative = (): number => { let value = primary(); while (['*','/','%'].includes(tokens[i])) { const op = tokens[i++]; const right = primary(); if ((op === '/' || op === '%') && right === 0) throw new Error('Division by zero.'); value = op === '*' ? value * right : op === '/' ? value / right : value % right; } return value; };
  const additive = (): number => { let value = multiplicative(); while (tokens[i] === '+' || tokens[i] === '-') { const op = tokens[i++]; const right = multiplicative(); value = op === '+' ? value + right : value - right; } return value; };
  const result = additive(); if (i !== tokens.length || !Number.isFinite(result)) throw new Error('Invalid arithmetic expression.'); return result;
}

export async function GET() {
  return NextResponse.json({
    tools: tools.map(tool => ({ ...tool, configured: configured(tool.id), available: configured(tool.id), status: configured(tool.id) ? 'ready' : 'integration-required' })),
    policy: { unavailableToolsAreNeverClaimedActive: true, externalActionsRequireApproval: true }
  }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  const tool = typeof body.tool === 'string' ? body.tool : '';
  if (tool === 'calculator') {
    try { return NextResponse.json({ tool, result: calculate(typeof body.expression === 'string' ? body.expression : '') }); }
    catch (error) { return NextResponse.json({ tool, error: error instanceof Error ? error.message : 'Calculation failed.' }, { status: 400 }); }
  }
  if (tool === 'structured-json') {
    const value = body.value;
    if (typeof value === 'undefined') return NextResponse.json({ tool, error: 'value is required.' }, { status: 400 });
    try {
      const normalized = typeof value === 'string' ? JSON.parse(value) : value;
      return NextResponse.json({ tool, valid: true, result: normalized });
    } catch { return NextResponse.json({ tool, valid: false, error: 'Invalid JSON.' }, { status: 400 }); }
  }
  return NextResponse.json({ error: 'This tool is not directly executable from the public tool endpoint. Use its configured integration through the agent runtime.' }, { status: 400 });
}
