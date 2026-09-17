'use client';

import { useEffect, useRef, useState } from 'react';

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_CHARS = 7_000_000;
const LOCAL_MODEL_ID = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';

type LocalStatus = 'idle' | 'loading' | 'ready' | 'error';
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export default function DosthaiEnhancements() {
  const pendingImageRef = useRef<string | null>(null);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);
  const engineRef = useRef<any>(null);
  const enginePromiseRef = useRef<Promise<any> | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const [imageAttached, setImageAttached] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [localStatus, setLocalStatus] = useState<LocalStatus>('idle');
  const [localProgress, setLocalProgress] = useState('Local AI is ready when you need it.');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  async function getLocalEngine() {
    if (engineRef.current) return engineRef.current;
    if (enginePromiseRef.current) return enginePromiseRef.current;
    if (!('gpu' in navigator)) throw new Error('This browser does not expose WebGPU. Use a WebGPU-capable browser or configure a server model.');

    setLocalStatus('loading');
    setLocalProgress('Downloading the local AI model. The first run can take a while; later runs use the browser cache.');
    enginePromiseRef.current = import('@mlc-ai/web-llm').then(async webllm => {
      const worker = new Worker(new URL('../workers/dosthai-local-ai.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current = worker;
      const engine = await webllm.CreateWebWorkerMLCEngine(worker, LOCAL_MODEL_ID, {
        initProgressCallback: (report: { text?: string; progress?: number }) => {
          const progress = typeof report.progress === 'number' ? ` ${Math.round(report.progress * 100)}%` : '';
          setLocalProgress(`${report.text || 'Loading local AI…'}${progress}`);
        },
        logLevel: 'ERROR',
      }, { context_window_size: 4096 });
      engineRef.current = engine;
      setLocalStatus('ready');
      setLocalProgress('Local AI is ready.');
      return engine;
    }).catch(error => {
      enginePromiseRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
      setLocalStatus('error');
      setLocalProgress(error instanceof Error ? error.message : 'Local AI could not start.');
      throw error;
    });
    return enginePromiseRef.current;
  }

  function localStatusMessage() {
    if (localStatus === 'loading') return 'Loading your private browser-local AI…';
    if (localStatus === 'ready') return 'Using your private browser-local AI.';
    return 'Starting browser-local AI…';
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
            send('error', { error: 'The browser-local model currently supports text chat. Remove the image or configure a vision-capable server model.' });
            controller.close();
            return;
          }
          send('ready', { message: localStatusMessage() });
          const engine = await getLocalEngine();
          const response = await engine.chat.completions.create({ messages, temperature: 0.7, top_p: 0.9, max_tokens: 1024, stream: true });
          for await (const chunk of response) {
            const token = chunk?.choices?.[0]?.delta?.content || '';
            if (token) send('token', { token });
          }
          send('done', { model: LOCAL_MODEL_ID, local: true });
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Local AI request failed.';
          setLocalStatus('error');
          setLocalProgress(message);
          send('error', { error: message });
          controller.close();
        }
      },
      cancel() { try { engineRef.current?.interruptGenerate?.(); } catch {} },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-dosthai-model': LOCAL_MODEL_ID, 'x-dosthai-local-mode': 'true' } });
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
      reader.onload = () => {
        const value = String(reader.result || '');
        if (!value.startsWith('data:image/') || value.length > IMAGE_MAX_CHARS) { window.alert('That image is too large to send.'); return; }
        pendingImageRef.current = value;
        setImageAttached(true);
        target.value = '';
      };
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
            if (pendingImageRef.current) {
              body.images = [{ dataUrl: pendingImageRef.current, detail: 'auto' }];
              pendingImageRef.current = null;
              setImageAttached(false);
            }
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
      workerRef.current?.terminate();
      workerRef.current = null;
      engineRef.current = null;
      enginePromiseRef.current = null;
    };
  }, []);

  useEffect(() => {
    const addSpeechButtons = () => {
      document.querySelectorAll<HTMLElement>('.message.assistant .message-actions').forEach(actions => {
        if (actions.dataset.dosthaiTts === '1') return;
        actions.dataset.dosthaiTts = '1';
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = 'Read aloud'; button.setAttribute('aria-label', 'Read aloud');
        button.onclick = async () => {
          const article = actions.closest('.message.assistant');
          const text = article?.querySelector<HTMLElement>('.content')?.innerText?.trim();
          if (!text || text.length > 6000) return;
          try {
            setSpeaking(true); audioRef.current?.pause();
            const response = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
            if (!response.ok) throw new Error('Speech request failed.');
            const blob = await response.blob(); const url = URL.createObjectURL(blob); const audio = new Audio(url); audioRef.current = audio;
            audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); };
            audio.onerror = () => { URL.revokeObjectURL(url); setSpeaking(false); };
            await audio.play();
          } catch { setSpeaking(false); }
        };
        actions.appendChild(button);
      });
    };
    addSpeechButtons();
    const observer = new MutationObserver(addSpeechButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  if (imageAttached) return <><div style={{ position: 'fixed', left: 20, bottom: 96, zIndex: 50, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', boxShadow: '0 8px 30px rgba(0,0,0,.28)', fontSize: 13 }}><span>🖼️ Image ready for the next message</span><button type="button" onClick={() => { pendingImageRef.current = null; setImageAttached(false); }} style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}>×</button></div>{speaking ? <div style={{ position: 'fixed', right: 20, bottom: 96, zIndex: 50, padding: '8px 12px', borderRadius: 12, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', fontSize: 13 }}>🔊 Reading aloud…</div> : null}</>;
  if (speaking) return <div style={{ position: 'fixed', left: 20, bottom: 96, zIndex: 50, padding: '8px 12px', borderRadius: 12, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', fontSize: 13 }}>🔊 Reading aloud…</div>;
  return localStatus !== 'idle' ? <div style={{ position: 'fixed', left: 20, bottom: 20, zIndex: 50, maxWidth: 'min(520px, calc(100vw - 40px))', padding: '10px 14px', borderRadius: 14, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', boxShadow: '0 8px 30px rgba(0,0,0,.28)', fontSize: 13 }}><strong>🧠 Dosthai Local AI</strong><div style={{ marginTop: 4, opacity: .8 }}>{localProgress}</div></div> : null;
}
