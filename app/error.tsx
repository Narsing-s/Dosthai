'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Dosthai route error', error); }, [error]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#090b10', color: '#f5f7fb', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ width: 'min(520px, 100%)', padding: 28, border: '1px solid #252b38', borderRadius: 18, background: '#10131b' }}>
        <div style={{ fontSize: 13, color: '#9da5b4', marginBottom: 10 }}>DOSTHAI</div>
        <h1 style={{ margin: '0 0 10px', fontSize: 26 }}>Something went wrong</h1>
        <p style={{ margin: '0 0 20px', color: '#aeb5c2', lineHeight: 1.6 }}>The workspace hit an unexpected error. Your browser-stored conversations are not intentionally cleared by this screen.</p>
        <button onClick={() => reset()} style={{ padding: '10px 15px', border: 0, borderRadius: 10, background: '#f5f7fb', color: '#111', fontWeight: 700, cursor: 'pointer' }}>Try again</button>
      </section>
    </main>
  );
}
