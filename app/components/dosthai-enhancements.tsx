'use client';

import { useEffect, useRef, useState } from 'react';

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_CHARS = 7_000_000;
// Must exactly match the model ID shipped in @mlc-ai/web-llm 0.2.85.
const LOCAL_MODEL_ID = 'SmolLM2-360M-Instruct-q4f32_1-MLC';
const CPU_MODEL_REPO = 'tensorblock/SmolLM2-360M-Instruct-GGUF';
const CPU_MODEL_FILE = 'SmolLM2-360M-Instruct-Q2_K.gguf';

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
    // Use the prebuilt ESM entry explicitly. Turbopack can otherwise resolve the package root to TypeScript source.
    cpuEnginePromiseRef.current = Promise.all([import('@wllama/wllama/esm/index.js'), import('@wllama/wllama/esm/wasm-from-cdn.js')]).then(async ([wllamaModule, wasmModule]) => {
      const Wllama = (wllamaModule as any).Wllama;
      const WasmFromCDN = (wasmModule as any).default;
      const engine = new Wllama(WasmFromCDN, { parallelDownloads: 3, allowOffline: true, suppressNativeLog: true });
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
    }).catch(async error => {
      enginePromiseRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
      try { return await getCpuWasmEngine(); } catch {
        setLocalStatus('error');
        setLocalProgress(error instanceof Error ? error.message : 'Local AI could not start.');
        throw error;
      }
    });
    return enginePromiseRef.current;
  }

  function localStatusMessage() {
    if (localStatus === 'loading') return 'Preparing local AI on this device.';
    if (localStatus === 'cpu-wasm') return 'Using CPU-compatible local AI; no GPU required.';
    if (localStatus === 'ready') return 'Using private browser-local AI.';
    return 'Starting browser-local AI…';
  }

  async function runLocalCompletion(engine: any, messages: ChatMessage[]) {
    if (engine?.chat?.completions?.create) return engine.chat.completions.create({ messages, temperature: 0.7, top_p: 0.9, max_tokens: 768, stream: true });
    return engine.createChatCompletion({ messages, temperature: 0.7, top_p: 0.9, max_tokens: 768, stream: true });
  }

  function localSseStream(body: string): Response {
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        try {
          const payload = JSON.parse(body) as { message?: string; history?: ChatMessage[]; images?: unknown[] };
          const history = Array.isArray(payload.history) ? payload.history : [];
          const messages: ChatMessage[] = [
            { role: 'system', content: 'You are Dosthai, a helpful, concise AI assistant. Answer clearly, accurately, and use markdown when useful. Do not claim access to tools, files, websites, or live information unless the user actually supplied them.' },
            ...history.slice(-24).filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string').map(item => ({ role: item.role, content: item.content.slice(0, 16000) })),
            { role: 'user', content: String(payload.message || '') },
          ];
          if (Array.isArray(payload.images) && payload.images.length) {
            send('error', { error: 'This lightweight offline model is text-only. Remove the image or use a configured cloud vision model.' });
            controller.close(); return;
          }
          send('ready', { message: localStatusMessage() });
          const engine = await getLocalEngine();
          const response = await runLocalCompletion(engine, messages);
          for await (const chunk of response) {
            const token = chunk?.choices?.[0]?.delta?.content || '';
            if (token) send('token', { token });
          }
          send('done', { model: engine === cpuEngineRef.current ? 'dosthai-local-cpu-wasm' : LOCAL_MODEL_ID, local: true });
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Local AI request failed.';
          setLocalStatus('error');
          setLocalProgress(`${message} Retrying through the server fallback…`);
          const original = originalFetchRef.current;
          if (original) {
            try {
              const fallbackBody = JSON.parse(body); fallbackBody.model = 'dosthai-local';
              const fallback = await original('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(fallbackBody) });
              const reader = fallback.body?.getReader();
              if (reader) { while (true) { const { done, value } = await reader.read(); if (done) break; controller.enqueue(value); } controller.close(); return; }
            } catch {}
          }
          send('error', { error: message }); controller.close();
        }
      },
      cancel() { try { engineRef.current?.interruptGenerate?.(); } catch {} try { cpuEngineRef.current?.interruptGenerate?.(); } catch {} },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-dosthai-model': 'dosthai-local', 'x-dosthai-local-mode': 'true' } });
  }

  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"][accept*=".txt"]');
    if (!input) return;
    const previousAccept = input.accept;
    input.accept = `${previousAccept},image/png,image/jpeg,image/webp,image/gif`;
    const onChange = (event: Event) => {
      const target = event.currentTarget as HTMLInputElement;
      const file = target.files?.[0];
      if (!file || !file.type.startsWith('image/')) return;
      event.stopImmediatePropagation();
      if (file.size > IMAGE_MAX_BYTES) { window.alert('Images are limited to 2 MB.'); target.value = ''; return; }
      const reader = new FileReader();
      reader.onload = () => { const value = String(reader.result || ''); if (!value.startsWith('data:image/') || value.length > IMAGE_MAX_CHARS) { window.alert('That image is too large to send.'); return; } pendingImageRef.current = value; setImageAttached(true); target.value = ''; };
      reader.readAsDataURL(file);
    };
    input.addEventListener('change', onChange, true);
    return () => { input.accept = previousAccept; input.removeEventListener('change', onChange, true); };
  }, []);

  useEffect(() => {
    if (originalFetchRef.current) return;
    const original = window.fetch.bind(window);
    originalFetchRef.current = original;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString();
      if (url.endsWith('/api/chat') && init?.body) {
        try {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
          if (body && typeof body === 'object') {
            if (pendingImageRef.current) { body.images = [{ dataUrl: pendingImageRef.current, detail: 'auto' }]; pendingImageRef.current = null; setImageAttached(false); }
            if (body.model === 'dosthai-local' && !Array.isArray(body.images)) return localSseStream(JSON.stringify(body));
            init = { ...init, body: JSON.stringify(body) };
          }
        } catch {}
      }
      return original(input, init);
    };
    return () => {
      if (originalFetchRef.current === original) window.fetch = original;
      originalFetchRef.current = null;
      try { engineRef.current?.interruptGenerate?.(); } catch {}
      try { cpuEngineRef.current?.exit?.(); } catch {}
      workerRef.current?.terminate(); workerRef.current = null; engineRef.current = null; enginePromiseRef.current = null; cpuEngineRef.current = null; cpuEnginePromiseRef.current = null;
    };
  }, []);

  useEffect(() => {
    const addSpeechButtons = () => {
      document.querySelectorAll<HTMLElement>('.message.assistant .message-actions').forEach(actions => {
        if (actions.dataset.dosthaiTts === '1') return;
        actions.dataset.dosthaiTts = '1';
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Read aloud'; button.setAttribute('aria-label', 'Read aloud');
        button.onclick = async () => {
          const article = actions.closest('.message.assistant'); const text = article?.querySelector<HTMLElement>('.content')?.innerText?.trim();
          if (!text || text.length > 6000) return;
          try {
            setSpeaking(true); audioRef.current?.pause();
            const response = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
            if (!response.ok) throw new Error('Speech request failed.');
            const blob = await response.blob(); const url = URL.createObjectURL(blob); const audio = new Audio(url); audioRef.current = audio;
            audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); }; audio.onerror = () => { URL.revokeObjectURL(url); setSpeaking(false); }; await audio.play();
          } catch { setSpeaking(false); }
        };
        actions.appendChild(button);
      });
    };
    addSpeechButtons(); const observer = new MutationObserver(addSpeechButtons); observer.observe(document.body, { childList: true, subtree: true }); return () => observer.disconnect();
  }, []);

  const statusText = localStatus === 'cpu-wasm' ? '⚡ CPU-compatible local AI ready — no GPU required.' : localProgress;
  if (imageAttached) return <><div style={{ position: 'fixed', left: 20, bottom: 96, zIndex: 50, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', boxShadow: '0 8px 30px rgba(0,0,0,.28)', fontSize: 13 }}><span>🖼️ Image ready for the next message</span><button type="button" onClick={() => { pendingImageRef.current = null; setImageAttached(false); }} style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}>×</button></div>{speaking ? <div style={{ position: 'fixed', right: 20, bottom: 96, zIndex: 50, padding: '8px 12px', borderRadius: 12, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', fontSize: 13 }}>🔊 Reading aloud…</div> : null}</>;
  if (speaking) return <div style={{ position: 'fixed', left: 20, bottom: 96, zIndex: 50, padding: '8px 12px', borderRadius: 12, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', fontSize: 13 }}>🔊 Reading aloud…</div>;
  return localStatus !== 'idle' ? <div style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 50, maxWidth: 'min(520px, calc(100vw - 40px))', padding: '10px 14px', borderRadius: 14, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', boxShadow: '0 8px 30px rgba(0,0,0,.28)', fontSize: 13 }}><strong>🧠 Dosthai Local AI</strong><div style={{ marginTop: 4, opacity: .8 }}>{statusText}</div></div> : null;
}
