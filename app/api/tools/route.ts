import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const tools = [
  { id: 'web-research', name: 'Web Research', description: 'Search current public information and return source metadata.', category: 'research', requires: 'WEB_SEARCH_API_URL + WEB_SEARCH_API_KEY' },
  { id: 'calculator', name: 'Calculator', description: 'Perform deterministic arithmetic without asking the model to guess.', category: 'utility', requires: 'built-in' },
  { id: 'structured-json', name: 'Structured JSON', description: 'Validate and transform JSON-oriented tasks.', category: 'developer', requires: 'built-in' },
  { id: 'knowledge', name: 'Knowledge Base', description: 'Retrieve relevant user documents with semantic search.', category: 'knowledge', requires: 'VECTOR_DATABASE_URL' },
  { id: 'code-sandbox', name: 'Code Sandbox', description: 'Execute generated code in an isolated environment.', category: 'developer', requires: 'CODE_EXECUTION_ENABLED' },
  { id: 'github', name: 'GitHub', description: 'Read and operate on authorized repositories, issues and pull requests.', category: 'developer', requires: 'GITHUB_APP / OAuth credentials' },
  { id: 'image', name: 'Image Generation', description: 'Generate or edit images from prompts.', category: 'multimodal', requires: 'IMAGE_API_KEY' },
  { id: 'voice', name: 'Voice', description: 'Speech transcription and text-to-speech.', category: 'multimodal', requires: 'SPEECH_API_KEY' }
];

export async function GET() {
  return NextResponse.json({ tools });
}
