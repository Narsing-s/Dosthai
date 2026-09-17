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
  const speech = Boolean(process.env.SPEECH_API_KEY || process.env.OPENAI_API_KEY);
  const adaptiveReasoning = provider && models.some(model => /^(gpt-(?:5\.6|6)|o[1-9])(?:-|$)/i.test(model));

  return NextResponse.json({
    app: 'Dosthai AI', version: '0.8.8',
    capabilities: {
      streamingChat: true, fastFirstTokenPath: true, localAiMode: true,
      adaptiveReasoning, multimodalChat: provider, multipleModels: models.length > 1,
      modelFallback: models.length > 1, conversationSearch: true, localHistory: true,
      importExport: true, localProjects: true, localMemoryControls: true, voiceInput: true,
      textToSpeech: speech, fileContext: true, shareLinks: true, toolRegistry: true,
      calculatorTool: true, structuredJsonTool: true, agentOrchestration: provider,
      multiStepToolCalling: provider, webResearch, cloudPersistence, authentication,
      objectStorage: Boolean(process.env.STORAGE_BUCKET), codeExecution: Boolean(process.env.CODE_EXECUTION_ENABLED),
      rag: Boolean(process.env.VECTOR_DATABASE_URL), imageGeneration, imageModelConfigured: imageGeneration,
      speech, githubIntegration: Boolean(process.env.GITHUB_APP_ID || process.env.GITHUB_TOKEN),
      offlineAppShell: true, installableWebApp: true, productionSecurityHeaders: true
    },
    configured: { provider, localAiMode: true, models: models.length, webResearch, cloudPersistence, authentication, imageGeneration, imageModel, speech, adaptiveReasoning },
    next: provider ? [
      'Authenticated cloud conversations with account isolation',
      'Real web research with citations and source controls',
      'PDF, DOCX, spreadsheet and image ingestion with permission-aware RAG',
      'Expanded native tool calling and multi-step agent orchestration',
      'Sandboxed code execution with resource limits',
      'Long-running resumable agents, background jobs and observability'
    ] : [
      'Browser-local WebGPU generative AI is active with no API key',
      'Optional cloud models can add stronger hosted reasoning and multimodal capabilities',
      'Real web research with citations and source controls',
      'Expanded native tool calling and multi-step agent orchestration when a cloud provider is configured'
    ]
  }, { headers: { 'cache-control': 'no-store' } });
}
