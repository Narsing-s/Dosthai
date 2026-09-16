import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const tools = [
  { id: 'web-research', name: 'Web Research', description: 'Search current public information and return source metadata.', category: 'research', requires: 'WEB_SEARCH_API_URL + WEB_SEARCH_API_KEY', mode: 'read' },
  { id: 'calculator', name: 'Calculator', description: 'Perform deterministic arithmetic without asking the model to guess.', category: 'utility', requires: 'built-in', mode: 'read' },
  { id: 'structured-json', name: 'Structured JSON', description: 'Validate and transform JSON-oriented tasks.', category: 'developer', requires: 'built-in', mode: 'read' },
  { id: 'knowledge', name: 'Knowledge Base', description: 'Retrieve relevant user documents with semantic search.', category: 'knowledge', requires: 'VECTOR_DATABASE_URL', mode: 'read' },
  { id: 'code-sandbox', name: 'Code Sandbox', description: 'Execute generated code in an isolated environment.', category: 'developer', requires: 'CODE_EXECUTION_ENABLED', mode: 'execute' },
  { id: 'github', name: 'GitHub', description: 'Read and operate on authorized repositories, issues and pull requests.', category: 'developer', requires: 'GITHUB_APP / OAuth credentials', mode: 'execute' },
  { id: 'image', name: 'Image Generation', description: 'Generate or edit images from prompts.', category: 'multimodal', requires: 'IMAGE_API_KEY', mode: 'execute' },
  { id: 'voice', name: 'Voice', description: 'Speech transcription and text-to-speech.', category: 'multimodal', requires: 'SPEECH_API_KEY', mode: 'execute' }
] as const;

function configured(id: string) {
  switch (id) {
    case 'web-research': return Boolean(process.env.WEB_SEARCH_API_URL && process.env.WEB_SEARCH_API_KEY);
    case 'calculator':
    case 'structured-json': return true;
    case 'knowledge': return Boolean(process.env.VECTOR_DATABASE_URL);
    case 'code-sandbox': return process.env.CODE_EXECUTION_ENABLED === 'true';
    case 'github': return Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_TOKEN);
    case 'image': return Boolean(process.env.IMAGE_API_KEY);
    case 'voice': return Boolean(process.env.SPEECH_API_KEY);
    default: return false;
  }
}

export async function GET() {
  return NextResponse.json({
    tools: tools.map((tool) => ({
      ...tool,
      configured: configured(tool.id),
      available: configured(tool.id),
      status: configured(tool.id) ? 'ready' : 'integration-required',
    })),
    policy: {
      unavailableToolsAreNeverClaimedActive: true,
      externalActionsRequireApproval: true,
    },
  });
}
