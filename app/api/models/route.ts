import { NextResponse } from 'next/server';
import { LOCAL_MODEL_ID, LOCAL_MODEL_NAME } from '../../../lib/local-assistant';

export const runtime = 'nodejs';

const labels: Record<string, { name: string; hint: string }> = {
  'gpt-5.6-luna': { name: 'Dosthai Fast', hint: 'Fast everyday conversations' },
  'gpt-5.6-terra': { name: 'Dosthai Balanced', hint: 'Reasoning and professional work' },
  'gpt-5.6-sol': { name: 'Dosthai Pro', hint: 'Complex reasoning and demanding work' },
};

function configuredModels() {
  return [...new Set((process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '').split(',').map(v => v.trim()).filter(Boolean))];
}

export async function GET() {
  const ids = configuredModels();
  const providerModels = ids.map((id, index) => ({ id, name: labels[id]?.name || (index === 0 ? 'Dosthai Default' : `Dosthai Model ${index + 1}`), hint: labels[id]?.hint || 'Provider-configured AI model' }));
  const provider = Boolean(process.env.OPENAI_API_KEY && ids.length);
  const models = providerModels.length ? providerModels : [{ id: LOCAL_MODEL_ID, name: LOCAL_MODEL_NAME, hint: 'Browser-local WebGPU AI; no API key required' }];

  return NextResponse.json({
    models,
    configuredProvider: provider,
    localMode: !provider,
    provider: provider ? (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1') : 'browser-local',
    ready: true,
    message: provider ? undefined : 'Dosthai is ready in browser-local AI mode. A cloud model provider is optional.'
  }, { headers: { 'cache-control': 'no-store' } });
}
