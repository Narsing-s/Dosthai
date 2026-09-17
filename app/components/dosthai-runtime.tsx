'use client';

import { useEffect, useState } from 'react';

const DRAFT_KEY = 'dosthai-composer-draft';
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SUPPORTED_FILE = /\.(txt|md|csv|json|xml|yaml|yml|js|ts|tsx|jsx|java|py|sql|raml|dw)$/i;

function findComposer() {
  return document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Message Dosthai…"], textarea[placeholder="Ask Dosthai Agent…"]');
}

function setComposerValue(value: string) {
  const composer = findComposer();
  if (!composer) return;
  const prototype = Object.getPrototypeOf(composer) as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(composer, value);
  else composer.value = value;
  composer.dispatchEvent(new Event('input', { bubbles: true }));
  composer.focus();
}

function appendToComposer(value: string) {
  const composer = findComposer();
  if (!composer) return;
  const separator = composer.value.trim() ? '\n\n' : '';
  setComposerValue(`${composer.value}${separator}${value}`.slice(0, 30_000));
}

export default function DosthaiRuntime() {
  const [online, setOnline] = useState(true);
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [dropActive, setDropActive] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall as EventListener);

    const restoreDraft = () => {
      const composer = findComposer();
      if (!composer || composer.value || draftRestored) return;
      const draft = localStorage.getItem(DRAFT_KEY);
      if (!draft) return;
      setComposerValue(draft);
      setDraftRestored(true);
    };

    const saveDraft = () => {
      const composer = findComposer();
      if (!composer) return;
      const value = composer.value;
      if (value.trim()) localStorage.setItem(DRAFT_KEY, value.slice(0, 30_000));
      else localStorage.removeItem(DRAFT_KEY);
    };

    const onInput = () => saveDraft();
    document.addEventListener('input', onInput, true);
    const observer = new MutationObserver(restoreDraft);
    observer.observe(document.body, { childList: true, subtree: true });
    restoreDraft();

    let recognition: any = null;
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const voiceButton = () => document.querySelector<HTMLButtonElement>('button[aria-label="Voice input"]');
    const onVoiceClick = (event: Event) => {
      const button = voiceButton();
      if (!button || !Recognition || event.target !== button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (recognition) {
        try { recognition.stop(); } catch { /* already stopped */ }
        recognition = null;
        setVoiceActive(false);
        return;
      }
      recognition = new Recognition();
      recognition.lang = navigator.language || 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setVoiceActive(true);
      recognition.onresult = (result: any) => {
        const transcript = result?.results?.[0]?.[0]?.transcript;
        if (typeof transcript === 'string' && transcript.trim()) appendToComposer(transcript.trim());
      };
      recognition.onerror = () => setVoiceActive(false);
      recognition.onend = () => { recognition = null; setVoiceActive(false); };
      try { recognition.start(); } catch { recognition = null; setVoiceActive(false); }
    };
    document.addEventListener('click', onVoiceClick, true);

    const onDragOver = (event: DragEvent) => {
      if (!findComposer() || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      setDropActive(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget instanceof Node && document.body.contains(event.relatedTarget)) return;
      setDropActive(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!findComposer() || !event.dataTransfer?.files?.length) return;
      event.preventDefault();
      setDropActive(false);
      const file = Array.from(event.dataTransfer.files)[0];
      if (file.size > MAX_FILE_BYTES || !SUPPORTED_FILE.test(file.name)) return;
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result || '').slice(0, 30_000);
        appendToComposer(`Please analyze the attached file: ${file.name}\n\n\`\`\`\n${content}\n\`\`\``);
      };
      reader.readAsText(file);
    };
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);

    const onShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'Space') {
        event.preventDefault();
        findComposer()?.focus();
      }
    };
    window.addEventListener('keydown', onShortcut);
    window.addEventListener('pagehide', saveDraft);

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);

    return () => {
      try { recognition?.abort(); } catch { /* ignore cleanup errors */ }
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('click', onVoiceClick, true);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
      observer.disconnect();
      window.removeEventListener('keydown', onShortcut);
      window.removeEventListener('pagehide', saveDraft);
    };
  }, [draftRestored]);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setInstallEvent(null);
  }

  return <>
    {!online && <div style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 100, padding: '10px 14px', borderRadius: 12, background: '#3a1d1d', color: '#fff', fontSize: 13, textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}>You are offline. Existing conversations remain available; AI requests will resume when you reconnect.</div>}
    {online && draftRestored && <button onClick={() => { localStorage.removeItem(DRAFT_KEY); setComposerValue(''); setDraftRestored(false); }} style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 100, padding: '8px 12px', border: 0, borderRadius: 10, background: '#1d2430', color: '#fff', fontSize: 12, cursor: 'pointer', boxShadow: '0 8px 30px rgba(0,0,0,.2)' }}>Draft restored · clear</button>}
    {voiceActive && <div style={{ position: 'fixed', right: 12, bottom: 58, zIndex: 101, padding: '8px 12px', borderRadius: 10, background: '#1d2430', color: '#fff', fontSize: 12, boxShadow: '0 8px 30px rgba(0,0,0,.2)' }}>Listening… tap voice again to stop</div>}
    {dropActive && <div style={{ position: 'fixed', inset: 12, zIndex: 99, border: '2px dashed rgba(255,255,255,.55)', borderRadius: 18, background: 'rgba(20,24,32,.72)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, pointerEvents: 'none' }}>Drop a text/code file into Dosthai</div>}
    {installEvent && <button onClick={install} style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 101, padding: '9px 13px', border: 0, borderRadius: 10, background: '#fff', color: '#111', fontWeight: 700, fontSize: 12, cursor: 'pointer', boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}>Install Dosthai</button>}
  </>;
}
