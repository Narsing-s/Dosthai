import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const features = [
  { id: 'chat', name: 'Chat', status: 'core' },
  { id: 'models', name: 'Multi-model routing', status: 'core' },
  { id: 'projects', name: 'Projects', status: 'local-available' },
  { id: 'memory', name: 'Memory controls', status: 'local-available' },
  { id: 'research', name: 'Web research with citations', status: 'available-when-configured' },
  { id: 'agents', name: 'Multi-step agents', status: 'available-when-configured' },
  { id: 'coding', name: 'Coding workspace', status: 'available-when-configured' },
  { id: 'knowledge', name: 'Files and knowledge/RAG', status: 'integration-required' },
  { id: 'voice', name: 'Voice', status: 'integration-required' },
  { id: 'image', name: 'Image generation/editing', status: 'integration-required' },
  { id: 'artifacts', name: 'Generated artifacts', status: 'planned' },
  { id: 'github', name: 'GitHub workflows', status: 'integration-required' },
  { id: 'automation', name: 'Automation/background work', status: 'planned' },
  { id: 'cloud', name: 'Accounts and cloud sync', status: 'integration-required' },
  { id: 'privacy', name: 'Export and deletion controls', status: 'core' },
  { id: 'observability', name: 'Usage and observability', status: 'planned' }
] as const;

export async function GET() {
  return NextResponse.json({
    product: 'Dosthai AI',
    version: '0.8.1',
    philosophy: 'Every visible capability must map to a real, tested backend capability.',
    features,
    release: {
      deployment: 'deferred',
      productionGate: '/api/readiness',
      browserVerificationRequired: true,
      securityReviewRequired: true,
      contractCheck: 'npm run quality:contract'
    }
  }, { headers: { 'cache-control': 'no-store' } });
}
