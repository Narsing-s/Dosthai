import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    app: 'Dosthai AI',
    version: '0.6.0',
    capabilities: {
      streamingChat: true,
      multipleModels: true,
      conversationSearch: true,
      localHistory: true,
      importExport: true,
      voiceInput: true,
      fileContext: true,
      shareLinks: true,
      toolRegistry: true,
      webResearch: Boolean(process.env.WEB_SEARCH_API_URL && process.env.WEB_SEARCH_API_KEY),
      cloudPersistence: Boolean(process.env.DATABASE_URL),
      authentication: Boolean(process.env.AUTH_SECRET),
      objectStorage: Boolean(process.env.STORAGE_BUCKET),
      codeExecution: Boolean(process.env.CODE_EXECUTION_ENABLED),
      rag: Boolean(process.env.VECTOR_DATABASE_URL),
      imageGeneration: Boolean(process.env.IMAGE_API_KEY),
      speech: Boolean(process.env.SPEECH_API_KEY),
      githubIntegration: Boolean(process.env.GITHUB_APP_ID || process.env.GITHUB_TOKEN),
      productionSecurityHeaders: true
    },
    next: [
      'Cloud conversations and authentication',
      'Real web research with citations',
      'Document knowledge bases and RAG',
      'Tool calling and autonomous agents',
      'Sandboxed code execution',
      'Multimodal image and voice workflows',
      'GitHub and developer workflows',
      'Long-running resumable agents and background jobs'
    ]
  });
}
