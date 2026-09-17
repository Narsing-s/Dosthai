import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const webResearch = Boolean(process.env.WEB_SEARCH_API_URL && process.env.WEB_SEARCH_API_KEY);
  const cloudPersistence = Boolean(process.env.DATABASE_URL);
  const authentication = Boolean(process.env.AUTH_SECRET);
  const models = (process.env.DOSTHAI_MODELS || process.env.OPENAI_MODEL || '').split(',').map(v => v.trim()).filter(Boolean);
  const provider = Boolean(process.env.OPENAI_API_KEY && models.length);
  const imageGeneration = Boolean(process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY);
  const imageModel = process.env.IMAGE_MODEL?.trim() || 'gpt-image-2';

  return NextResponse.json({
    app: 'Dosthai AI',
    version: '0.8.5',
    capabilities: {
      streamingChat: provider,
      fastFirstTokenPath: provider,
      multipleModels: models.length > 1,
      modelFallback: models.length > 1,
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
      structuredJsonTool: true,
      agentOrchestration: provider,
      multiStepToolCalling: provider,
      webResearch,
      cloudPersistence,
      authentication,
      objectStorage: Boolean(process.env.STORAGE_BUCKET),
      codeExecution: Boolean(process.env.CODE_EXECUTION_ENABLED),
      rag: Boolean(process.env.VECTOR_DATABASE_URL),
      imageGeneration,
      imageModelConfigured: imageGeneration,
      speech: Boolean(process.env.SPEECH_API_KEY),
      githubIntegration: Boolean(process.env.GITHUB_APP_ID || process.env.GITHUB_TOKEN),
      offlineAppShell: true,
      installableWebApp: true,
      productionSecurityHeaders: true
    },
    configured: { provider, models: models.length, webResearch, cloudPersistence, authentication, imageGeneration, imageModel },
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
