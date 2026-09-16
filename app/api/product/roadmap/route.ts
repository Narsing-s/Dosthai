import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const roadmap = [
  { id: 'chat', title: 'Chat', features: ['streaming', 'stop', 'retry', 'regenerate', 'branching', 'temporary-chat', 'search', 'export'] },
  { id: 'projects', title: 'Projects', features: ['persistent-context', 'instructions', 'project-memory', 'files', 'chat-organization', 'permissions'] },
  { id: 'memory', title: 'Memory', features: ['saved-memory', 'memory-review', 'memory-delete', 'history-retrieval', 'project-scope', 'temporary-chat-isolation'] },
  { id: 'research', title: 'Research', features: ['web-search', 'deep-research', 'research-plan', 'citations', 'source-controls', 'interrupt-resume'] },
  { id: 'agents', title: 'Agents', features: ['planning', 'tools', 'approvals', 'browser', 'code', 'progress', 'background-jobs', 'scheduling'] },
  { id: 'files', title: 'Files & Knowledge', features: ['pdf', 'docx', 'xlsx', 'pptx', 'images', 'ocr', 'rag', 'file-citations', 'permissions'] },
  { id: 'artifacts', title: 'Artifacts', features: ['documents', 'spreadsheets', 'presentations', 'charts', 'code', 'images', 'versioning'] },
  { id: 'developer', title: 'Developer', features: ['sandbox', 'tests', 'github', 'pull-requests', 'diff-review', 'approval'] },
  { id: 'multimodal', title: 'Multimodal', features: ['voice', 'speech', 'image-understanding', 'image-generation', 'audio'] },
  { id: 'cloud', title: 'Cloud & Collaboration', features: ['auth', 'sync', 'shared-projects', 'roles', 'audit', 'export', 'deletion'] },
  { id: 'trust', title: 'Trust & Safety', features: ['secret-isolation', 'prompt-injection-defense', 'ssrf-protection', 'upload-validation', 'sandboxing', 'rate-limits', 'csrf'] },
  { id: 'reliability', title: 'Reliability', features: ['timeouts', 'fallbacks', 'idempotency', 'durable-jobs', 'observability', 'usage', 'health'] },
] as const;

export async function GET() {
  return NextResponse.json({
    product: 'Dosthai',
    goal: 'ChatGPT-class unified AI workspace',
    roadmap,
    completionRule: 'A feature is complete only when its UI, server behavior, failure paths, security, tests, browser verification and documentation are complete.',
    releaseOrder: ['implementation', 'tests', 'production-build', 'browser-e2e', 'security-review', 'ci', 'staging', 'acceptance', 'production-release'],
    vercel: { allowedBeforeFinalAcceptance: false },
  }, { headers: { 'cache-control': 'no-store' } });
}
