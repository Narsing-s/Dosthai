import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function normalizeResults(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item: any) => ({
    title: typeof item?.title === 'string' ? item.title.slice(0, 240) : 'Untitled result',
    url: typeof item?.url === 'string' ? item.url : '',
    snippet: typeof item?.snippet === 'string' ? item.snippet.slice(0, 1200) : typeof item?.text === 'string' ? item.text.slice(0, 1200) : ''
  })).filter((item: any) => item.url);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const query = typeof body.query === 'string' ? body.query.trim().slice(0, 1000) : '';
  if (!query) return NextResponse.json({ error: 'Research query is required.' }, { status: 400 });

  const endpoint = process.env.WEB_SEARCH_API_URL;
  const apiKey = process.env.WEB_SEARCH_API_KEY;
  if (!endpoint || !apiKey) {
    return NextResponse.json({
      error: 'Web research is not configured yet.',
      setup: 'Configure WEB_SEARCH_API_URL and WEB_SEARCH_API_KEY with your chosen search provider.'
    }, { status: 503 });
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, num_results: 8 }),
      cache: 'no-store'
    });
    if (!response.ok) return NextResponse.json({ error: `Search provider returned ${response.status}.` }, { status: 502 });
    const data = await response.json();
    const raw = data?.results ?? data?.items ?? data?.data ?? [];
    return NextResponse.json({ query, results: normalizeResults(raw), fetchedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Web research failed.' }, { status: 502 });
  }
}
