import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const catalog = [
  { id: 'gpt-5.6-luna', name: 'Dosthai Fast', hint: 'Fast, cost-efficient everyday AI' },
  { id: 'gpt-5.6-terra', name: 'Dosthai Balanced', hint: 'Strong reasoning and broad work' },
  { id: 'gpt-5.6-sol', name: 'Dosthai Pro', hint: 'Frontier reasoning and complex work' }
];

export async function GET() {
  const configured = (process.env.DOSTHAI_MODELS || '').split(',').map(v => v.trim()).filter(Boolean);
  const allowed = new Set(configured.length ? configured : catalog.map(model => model.id));
  const models = catalog.filter(model => allowed.has(model.id));

  return NextResponse.json({
    models,
    configuredProvider: Boolean(process.env.OPENAI_API_KEY),
    provider: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
  }, { headers: { 'cache-control': 'no-store' } });
}
