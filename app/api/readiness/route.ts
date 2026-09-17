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
  ['Speech', Boolean(process.env.SPEECH_API_KEY), 'SPEECH_API_KEY'],
  ['GitHub integration', Boolean(process.env.GITHUB_APP_ID || process.env.GITHUB_TOKEN), 'GITHUB_APP_ID or GITHUB_TOKEN']
] as const;

export async function GET() {
  const apiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const models = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  const checks = [
    { name: 'AI provider', configured: apiConfigured, required: true, requirement: 'OPENAI_API_KEY' },
    { name: 'AI model', configured: models.length > 0, required: true, requirement: 'OPENAI_MODEL or DOSTHAI_MODELS' },
    ...optionalChecks.map(([name, configured, requirement]) => ({ name, configured, required: false, requirement }))
  ];
  const blockers = checks.filter(item => item.required && !item.configured).map(item => item.name);
  const optional = checks.filter(item => !item.required && !item.configured).map(item => item.name);

  return NextResponse.json({
    service: 'dosthai-ai',
    readyForProduction: blockers.length === 0,
    core: {
      chat: apiConfigured && models.length > 0,
      streaming: true,
      modelRouting: models.length > 0,
      localHistory: true,
      tools: true,
      agent: apiConfigured && models.length > 0
    },
    checks,
    blockers,
    optionalIntegrations: optional,
    note: 'Optional integrations are reported separately. Dosthai never pretends an unavailable integration is active. Missing optional integrations are reported explicitly.'
  }, { headers: { 'cache-control': 'no-store' } });
}
