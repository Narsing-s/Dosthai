import { NextResponse } from 'next/server';
import { LOCAL_MODEL_ID, LOCAL_MODEL_NAME } from '../../../lib/local-assistant';

export const runtime = 'nodejs';

const labels: Record<string, { name: string; hint: string }> = {
  'gpt-5.6-luna': { name: 'Dosthai Fast', hint: 'Fast general-purpose conversations' },
  'gpt-5.6-terra': { name: 'Dosthai Balanced', hint: 'General reasoning and professional work' },
  'gpt-5.6-sol': { name: 'Dosthai Pro', hint: 'Complex reasoning and demanding work' },
};

function configuredModels() {
  const ids = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '')
    .split(',').map(v => v.trim()).filter(Boolean);
  return [...new Set(ids.length ? ids : ['gpt-5.6-luna'])];
}

export async function GET() {
  // VERCEL only means the app is running on Vercel. It is NOT proof that an
  // AI Gateway credential is available. OIDC is valid only when a token exists.
  const gateway = Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  const direct = Boolean(process.env.OPENAI_API_KEY);
  const provider = gateway || direct;
  const ids = configuredModels();
  const models = provider
    ? ids.map((id, index) => ({
        id,
        name: labels[id]?.name || (index === 0 ? 'Dosthai Default' : `Dosthai Model ${index + 1}`),
        hint: labels[id]?.hint || 'General-purpose AI model',
      }))
    : [{
        id: LOCAL_MODEL_ID,
        name: LOCAL_MODEL_NAME,
        hint: 'AI provider is not configured — add AI_GATEWAY_API_KEY for open-ended generation',
      }];

  return NextResponse.json({
    models,
    configuredProvider: provider,
    localMode: !provider,
    provider: gateway ? 'vercel-ai-gateway' : direct ? (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1') : 'local',
    ready: true,
    message: provider ? undefined : 'No AI provider credentials are available. Add AI_GATEWAY_API_KEY in Vercel Environment Variables and redeploy.',
  }, { headers: { 'cache-control': 'no-store' } });
}
