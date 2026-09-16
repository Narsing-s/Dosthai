import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    models: [
      { id: 'gpt-5-mini', name: 'Dosthai Fast', description: 'Fast everyday conversations' },
      { id: 'gpt-5', name: 'Dosthai Pro', description: 'Deeper reasoning and complex work' }
    ],
    configuredProvider: Boolean(process.env.OPENAI_API_KEY)
  });
}
