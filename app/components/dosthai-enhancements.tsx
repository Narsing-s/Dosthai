'use client';

import { useEffect, useRef, useState } from 'react';

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_CHARS = 7_000_000;

export default function DosthaiEnhancements() {
  const pendingImageRef = useRef<string | null>(null);
  const originalFetchRef = useRef<typeof window.fetch | null>(null);
  const [imageAttached, setImageAttached] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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
      if (file.size > IMAGE_MAX_BYTES) {
        window.alert('Images are limited to 2 MB.');
        target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || '');
        if (!value.startsWith('data:image/') || value.length > IMAGE_MAX_CHARS) {
          window.alert('That image is too large to send.');
          return;
        }
        pendingImageRef.current = value;
        setImageAttached(true);
        target.value = '';
      };
      reader.readAsDataURL(file);
    };

    input.addEventListener('change', onChange, true);
    return () => {
      input.accept = previousAccept;
      input.removeEventListener('change', onChange, true);
    };
  }, []);

  useEffect(() => {
    if (originalFetchRef.current) return;
    const original = window.fetch.bind(window);
    originalFetchRef.current = original;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : input.url;
      if (url.endsWith('/api/chat') && init?.body && pendingImageRef.current) {
        try {
          const body = typeof init.body === 'string' ? JSON.parse(init.body) : null;
          if (body && typeof body === 'object') {
            body.images = [{ dataUrl: pendingImageRef.current, detail: 'auto' }];
            init = { ...init, body: JSON.stringify(body) };
            pendingImageRef.current = null;
            setImageAttached(false);
          }
        } catch {}
      }
      return original(input, init);
    };
    return () => {
      if (originalFetchRef.current === original) window.fetch = original;
      originalFetchRef.current = null;
    };
  }, []);

  useEffect(() => {
    const addSpeechButtons = () => {
      document.querySelectorAll<HTMLElement>('.message.assistant .message-actions').forEach(actions => {
        if (actions.dataset.dosthaiTts === '1') return;
        actions.dataset.dosthaiTts = '1';
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Read aloud';
        button.setAttribute('aria-label', 'Read aloud');
        button.onclick = async () => {
          const article = actions.closest('.message.assistant');
          const text = article?.querySelector<HTMLElement>('.content')?.innerText?.trim();
          if (!text || text.length > 6000) return;
          try {
            setSpeaking(true);
            audioRef.current?.pause();
            const response = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text })
            });
            if (!response.ok) throw new Error('Speech request failed.');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.onended = () => { URL.revokeObjectURL(url); setSpeaking(false); };
            audio.onerror = () => { URL.revokeObjectURL(url); setSpeaking(false); };
            await audio.play();
          } catch {
            setSpeaking(false);
          }
        };
        actions.appendChild(button);
      });
    };
    addSpeechButtons();
    const observer = new MutationObserver(addSpeechButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return imageAttached ? (
    <div style={{ position: 'fixed', left: 20, bottom: 96, zIndex: 50, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', boxShadow: '0 8px 30px rgba(0,0,0,.28)', fontSize: 13 }}>
      <span>🖼️ Image ready for the next message</span>
      <button type="button" onClick={() => { pendingImageRef.current = null; setImageAttached(false); }} style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}>×</button>
    </div>
  ) : speaking ? <div style={{ position: 'fixed', left: 20, bottom: 96, zIndex: 50, padding: '8px 12px', borderRadius: 12, background: 'var(--panel, #171a21)', color: 'var(--text, #fff)', fontSize: 13 }}>🔊 Reading aloud…</div> : null;
}
