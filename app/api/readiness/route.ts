import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const optionalChecks = [
  ['Database persistence', Boolean(process.env.DATABASE_URL), 'DATABASE_URL'],
  ['Authentication secret', Boolean(process.env.AUTH_SECRET), 'AUTH_SECRET'],
  ['Object storage', Boolean(process.env.STORAGE_BUCKET), 'STORAGE_BUCKET'],
  ['Web research', Boolean(process.env.WEB_SEARCH_API_URL && process.env.WEB_SEARCH_API_KEY), 'WEB_SEARCH_API_URL + WEB_SEARCH_API_KEY'],
  ['RAG/vector database', Boolean(process.env.VECTOR_DATABASE_URL), 'VECTOR_DATABASE_URL'],
  ['Code sandbox', Boolean(process.env.CODE_EXECUTION_ENABLED), 'CODE_EXECUTION_ENABLED'],
  ['Image generation', Boolean(process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY), 'IMAGE_API_KEY or OPENAI_API_KEY'],
  ['Image model', Boolean(process.env.IMAGE_MODEL?.trim() || process.env.OPENAI_API_KEY || process.env.IMAGE_API_KEY), 'IMAGE_MODEL or provider key'],
  ['Speech', Boolean(process.env.SPEECH_API_KEY || process.env.OPENAI_API_KEY), 'SPEECH_API_KEY or OPENAI_API_KEY'],
  ['GitHub integration', Boolean(process.env.GITHUB_APP_ID || process.env.GITHUB_TOKEN), 'GITHUB_APP_ID or GITHUB_TOKEN']
] as const;

export async function GET() {
  const provider = Boolean(process.env.OPENAI_API_KEY && (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL));
  const checks = [
    { name: 'Local AI mode', configured: true, required: true, requirement: 'Built into Dosthai; no credential required' },
    { name: 'Cloud model provider', configured: provider, required: false, requirement: 'OPENAI_API_KEY + OPENAI_MODEL or DOSTHAI_MODELS' },
    ...optionalChecks.map(([name, configured, requirement]) => ({ name, configured, required: false, requirement }))
  ];
  const optional = checks.filter(item => !item.required && !item.configured).map(item => item.name);

  return NextResponse.json({
    service: 'dosthai-ai',
    readyForProduction: true,
    mode: provider ? 'provider' : 'local',
    core: { chat: true, streaming: true, modelRouting: provider, localHistory: true, tools: true, agent: provider },
    checks,
    blockers: [],
    optionalIntegrations: optional,
    note: provider ? 'A configured model provider is active.' : 'Dosthai runs without API credentials in transparent local mode. Local mode does not pretend to be a large language model; connect a provider when full generative AI is required.'
  }, { headers: { 'cache-control': 'no-store' } });
}
