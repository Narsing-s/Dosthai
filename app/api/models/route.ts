import { NextResponse } from 'next/server';
import { LOCAL_MODEL_ID, LOCAL_MODEL_NAME } from '../../../lib/local-assistant';

export const runtime = 'nodejs';

const labels: Record<string, { name: string; hint: string }> = {
  'gpt-5.6-luna': { name: 'Dosthai Fast', hint: 'Fast everyday conversations' },
  'gpt-5.6-terra': { name: 'Dosthai Balanced', hint: 'Reasoning and professional work' },
  'gpt-5.6-sol': { name: 'Dosthai Pro', hint: 'Complex reasoning and demanding work' },
};

function configuredModels() {
  const ids = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '').split(',').map(v => v.trim()).filter(Boolean);
  return [...new Set(ids.length ? ids : ['gpt-5.6-luna'])];
}

export async function GET() {
  const gateway = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  const direct = Boolean(process.env.OPENAI_API_KEY);
  const provider = gateway || direct;
  const ids = configuredModels();
  const models = provider
    ? ids.map((id, index) => ({ id, name: labels[id]?.name || (index === 0 ? 'Dosthai Default' : `Dosthai Model ${index + 1}`), hint: labels[id]?.hint || 'General-purpose AI model' }))
    : [{ id: LOCAL_MODEL_ID, name: LOCAL_MODEL_NAME, hint: 'Local rules mode — connect an AI provider for open-ended generation' }];

  return NextResponse.json({
    models,
    configuredProvider: provider,
    localMode: !provider,
    provider: gateway ? 'vercel-ai-gateway' : direct ? (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1') : 'local',
    ready: true,
    message: provider ? undefined : 'No AI provider credentials are available. Open-ended questions require an AI provider.'
  }, { headers: { 'cache-control': 'no-store' } });
}
