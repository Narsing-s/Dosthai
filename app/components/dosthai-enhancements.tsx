'use client';

import { useEffect, useRef, useState } from 'react';

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_CHARS = 7_000_000;
// Must exactly match the model ID shipped in @mlc-ai/web-llm 0.2.85.
const LOCAL_MODEL_ID = 'SmolLM2-360M-Instruct-q4f32_1-MLC';
const CPU_MODEL_REPO = 'tensorblock/SmolLM2-360M-Instruct-GGUF';
const CPU_MODEL_FILE = 'SmolLM2-360M-Instruct-Q2_K.gguf';
// Keep the WASM loader local to this app so Turbopack does not need to resolve
// the package's optional subpath export.
const WASM_FROM_CDN = {
  default: 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/src/wasm/wllama.wasm',
};

type LocalStatus = 'idle' | 'loading' | 'ready' | 'cpu-wasm' | 'error';
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export default function DosthaiEnhancements() {
  const pendingImageRef = useRef<string | null>(null);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);
  const engineRef = useRef<any>(null);
  const enginePromiseRef = useRef<Promise<any> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const cpuEngineRef = useRef<any>(null);
  const cpuEnginePromiseRef = useRef<Promise<any> | null>(null);
  const [imageAttached, setImageAttached] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [localStatus, setLocalStatus] = useState<LocalStatus>('idle');
  const [localProgress, setLocalProgress] = useState('Local AI is ready when you need it.');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function getCpuWasmEngine() {
    if (cpuEngineRef.current) return cpuEngineRef.current;
    if (cpuEnginePromiseRef.current) return cpuEnginePromiseRef.current;
    setLocalStatus('loading');
    setLocalProgress('Starting CPU-compatible browser AI…');
    // Import the prebuilt ESM entry explicitly. Turbopack can otherwise resolve
    // the package root to TypeScript source. The WASM URL is supplied directly
    // to avoid the package's optional wasm-from-cdn subpath resolution issue.
    cpuEnginePromiseRef.current = import('@wllama/wllama/esm/index.js').then(async wllamaModule => {
      const Wllama = (wllamaModule as any).Wllama;
      const engine = new Wllama(WASM_FROM_CDN, { parallelDownloads: 3, allowOffline: true, suppressNativeLog: true });
      setLocalProgress('Downloading the lightweight CPU model (first use only)…');
      await engine.loadModelFromHF({ repo: CPU_MODEL_REPO, file: CPU_MODEL_FILE }, {
        n_gpu_layers: 0,
        n_threads: Math.max(1, Math.min(4, Math.floor((navigator.hardwareConcurrency || 2) / 2))),
        n_ctx: 2048,
        progressCallback: ({ loaded, total }: { loaded: number; total: number }) => {
          if (total > 0) setLocalProgress(`Downloading CPU model… ${Math.round((loaded / total) * 100)}%`);
        },
      });
      cpuEngineRef.current = engine;
      setLocalStatus('cpu-wasm');
      setLocalProgress('CPU-compatible local AI is ready.');
      return engine;
    }).catch(error => {
      cpuEnginePromiseRef.current = null;
      setLocalStatus('error');
      setLocalProgress(error instanceof Error ? error.message : 'CPU-compatible local AI could not start.');
      throw error;
    });
    return cpuEnginePromiseRef.current;
  }

  async function getLocalEngine() {
    if (engineRef.current) return engineRef.current;
    if (enginePromiseRef.current) return enginePromiseRef.current;
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<any> } }).gpu;
    if (!gpu?.requestAdapter) return getCpuWasmEngine();
    const adapter = await gpu.requestAdapter();
    if (!adapter) return getCpuWasmEngine();
    setLocalStatus('loading');
    setLocalProgress('Starting private browser-local AI…');
    enginePromiseRef.current = import('@mlc-ai/web-llm').then(async webllm => {
      const engineConfig = {
        initProgressCallback: (report: { text?: string; progress?: number }) => {
          const progress = typeof report.progress === 'number' ? ` ${Math.round(report.progress * 100)}%` : '';
          setLocalProgress(`${report.text || 'Loading local AI…'}${progress}`);
        },
        logLevel: 'ERROR' as const,
      };
      try {
        setLocalProgress('Starting the AI worker…');
        const worker = new Worker(new URL('../workers/dosthai-local-ai.worker.ts', import.meta.url), { type: 'module' });
        workerRef.current = worker;
        const engine = await webllm.CreateWebWorkerMLCEngine(worker, LOCAL_MODEL_ID, engineConfig, { context_window_size: 4096 });
        engineRef.current = engine;
        setLocalStatus('ready');
        setLocalProgress('GPU-accelerated local AI is ready.');
        return engine;
      } catch {
        workerRef.current?.terminate();
        workerRef.current = null;
        setLocalProgress('GPU local AI could not start; switching to CPU-compatible browser AI…');
        try {
          return await getCpuWasmEngine();
        } catch {
          const engine = await webllm.CreateMLCEngine(LOCAL_MODEL_ID, engineConfig, { context_window_size: 4096 });
          engineRef.current = engine;
          setLocalStatus('ready');
          setLocalProgress('GPU local AI is ready.');
          return engine;
        }
      }
    });
    return enginePromiseRef.current;
  }
