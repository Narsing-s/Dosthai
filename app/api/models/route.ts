import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const labels: Record<string, { name: string; hint: string }> = {
  'gpt-5.6-luna': { name: 'Dosthai Fast', hint: 'Fast everyday conversations' },
  'gpt-5.6-terra': { name: 'Dosthai Balanced', hint: 'Reasoning and professional work' },
  'gpt-5.6-sol': { name: 'Dosthai Pro', hint: 'Complex reasoning and demanding work' },
};

function configuredModels() {
  const configured = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  return [...new Set(configured)];
}

export async function GET() {
  const ids = configuredModels();
  const models = ids.map((id, index) => ({
    id,
    name: labels[id]?.name || (index === 0 ? 'Dosthai Default' : `Dosthai Model ${index + 1}`),
    hint: labels[id]?.hint || 'Provider-configured AI model'
  }));

  return NextResponse.json({
    models,
    configuredProvider: Boolean(process.env.OPENAI_API_KEY),
    provider: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    ready: Boolean(process.env.OPENAI_API_KEY && ids.length),
    message: !process.env.OPENAI_API_KEY
      ? 'Configure OPENAI_API_KEY on the server.'
      : !ids.length
        ? 'Configure OPENAI_MODEL or DOSTHAI_MODELS on the server.'
        : undefined
  }, { headers: { 'cache-control': 'no-store' } });
}
