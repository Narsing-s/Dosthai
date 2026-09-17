import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  const models = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);

  return NextResponse.json({
    ok: true,
    service: 'dosthai-ai',
    chatReady: hasKey && models.length > 0,
    modelConfigured: models.length > 0,
    providerConfigured: hasKey,
    streaming: true,
    timestamp: new Date().toISOString()
  }, { headers: { 'cache-control': 'no-store' } });
}
