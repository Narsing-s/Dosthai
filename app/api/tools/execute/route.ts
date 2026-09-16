import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function calculate(expression: string) {
  const normalized = expression.trim();
  if (!normalized || normalized.length > 300) throw new Error('Expression is empty or too long.');
  if (!/^[0-9+\-*/%().,\s^]+$/.test(normalized)) throw new Error('Only arithmetic expressions are supported.');
  const safe = normalized.replace(/,/g, '').replace(/\^/g, '**');
  if (/\*\*/.test(safe) && /\*\*[^\d\s.(+-]/.test(safe)) throw new Error('Invalid exponent expression.');
  const result = Function(`"use strict"; return (${safe})`)();
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('Expression did not produce a finite number.');
  return result;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return json({ error: 'Invalid JSON request body.' }, 400);
  const tool = typeof (body as any).tool === 'string' ? (body as any).tool : '';
  const input = (body as any).input;

  if (tool === 'calculator') {
    try {
      const expression = typeof input === 'string' ? input : String(input?.expression || '');
      return json({ tool, result: calculate(expression) });
    } catch (error) {
      return json({ tool, error: error instanceof Error ? error.message : 'Calculation failed.' }, 400);
    }
  }

  return json({ error: 'Unknown or unavailable tool.' }, 404);
}
