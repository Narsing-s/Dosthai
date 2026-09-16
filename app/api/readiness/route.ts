import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const checks = [
  ['AI provider', Boolean(process.env.OPENAI_API_KEY), 'OPENAI_API_KEY'],
  ['Database persistence', Boolean(process.env.DATABASE_URL), 'DATABASE_URL'],
  ['Authentication secret', Boolean(process.env.AUTH_SECRET), 'AUTH_SECRET'],
  ['Object storage', Boolean(process.env.STORAGE_BUCKET), 'STORAGE_BUCKET'],
  ['Web research', Boolean(process.env.WEB_SEARCH_API_URL && process.env.WEB_SEARCH_API_KEY), 'WEB_SEARCH_API_URL + WEB_SEARCH_API_KEY'],
  ['RAG/vector database', Boolean(process.env.VECTOR_DATABASE_URL), 'VECTOR_DATABASE_URL'],
  ['Code sandbox', Boolean(process.env.CODE_EXECUTION_ENABLED), 'CODE_EXECUTION_ENABLED'],
  ['Image generation', Boolean(process.env.IMAGE_API_KEY), 'IMAGE_API_KEY'],
  ['Speech', Boolean(process.env.SPEECH_API_KEY), 'SPEECH_API_KEY'],
  ['GitHub integration', Boolean(process.env.GITHUB_APP_ID || process.env.GITHUB_TOKEN), 'GITHUB_APP_ID or GITHUB_TOKEN']
] as const;

export async function GET() {
  const result = checks.map(([name, configured, requirement]) => ({ name, configured, requirement }));
  const blockers = result.filter((item) => !item.configured).map((item) => item.name);
  return NextResponse.json({
    service: 'dosthai-ai',
    readyForProduction: blockers.length === 0,
    requiredCore: {
      chat: result[0].configured,
      persistence: result[1].configured,
      authentication: result[2].configured
    },
    checks: result,
    blockers,
    note: 'Missing optional integrations are reported explicitly; Dosthai must never pretend an unavailable tool is active.'
  }, { headers: { 'cache-control': 'no-store' } });
}
