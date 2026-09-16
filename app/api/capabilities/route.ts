import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({
    app: 'Dosthai AI',
    version: '0.8.1',
    capabilities: {
      streamingChat: true,
      multipleModels: true,
      modelFallback: true,
      conversationSearch: true,
      localHistory: true,
      importExport: true,
      localProjects: true,
      localMemoryControls: true,
      voiceInput: true,
      fileContext: true,
      shareLinks: true,
      toolRegistry: true,
      calculatorTool: true,
      agentOrchestration: true,
      multiStepToolCalling: true,
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
      'Authenticated cloud conversations with account isolation',
      'Real web research with citations and source controls',
      'PDF, DOCX, spreadsheet and image ingestion with permission-aware RAG',
      'Expanded native tool calling and multi-step agent orchestration',
      'Sandboxed code execution with resource limits',
      'Multimodal image, audio and generated-file workflows',
      'GitHub and developer workflows with explicit authorization',
      'Long-running resumable agents, background jobs and observability'
    ]
  }, { headers: { 'cache-control': 'no-store' } });
}
