'use client';

import { useEffect, useState } from 'react';

const DRAFT_KEY = 'dosthai-composer-draft';

function findComposer() {
  return document.querySelector<HTMLTextAreaElement>('textarea[placeholder="Message Dosthai…"], textarea[placeholder="Ask Dosthai Agent…"]');
}

export default function DosthaiRuntime() {
  const [online, setOnline] = useState(true);
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [draftRestored, setDraftRestored] = useState(false);

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
      composer.value = draft;
      composer.dispatchEvent(new Event('input', { bubbles: true }));
      setDraftRestored(true);
    };

    const saveDraft = () => {
      const composer = findComposer();
      if (!composer) return;
      const value = composer.value;
      if (value.trim()) localStorage.setItem(DRAFT_KEY, value.slice(0, 30000));
      else localStorage.removeItem(DRAFT_KEY);
    };

    const onInput = () => saveDraft();
    document.addEventListener('input', onInput, true);
    const observer = new MutationObserver(restoreDraft);
    observer.observe(document.body, { childList: true, subtree: true });
    restoreDraft();

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
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall as EventListener);
      document.removeEventListener('input', onInput, true);
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
    {online && draftRestored && <button onClick={() => { localStorage.removeItem(DRAFT_KEY); const composer = findComposer(); if (composer) { composer.value = ''; composer.dispatchEvent(new Event('input', { bubbles: true })); } setDraftRestored(false); }} style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 100, padding: '8px 12px', border: 0, borderRadius: 10, background: '#1d2430', color: '#fff', fontSize: 12, cursor: 'pointer', boxShadow: '0 8px 30px rgba(0,0,0,.2)' }}>Draft restored · clear</button>}
    {installEvent && <button onClick={install} style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 101, padding: '9px 13px', border: 0, borderRadius: 10, background: '#fff', color: '#111', fontWeight: 700, fontSize: 12, cursor: 'pointer', boxShadow: '0 8px 30px rgba(0,0,0,.25)' }}>Install Dosthai</button>}
  </>;
}
