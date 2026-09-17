'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dosthai global error', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', background: '#090b10', color: '#f5f7fb', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={{ width: 'min(560px, 100%)', padding: 28, border: '1px solid rgba(255,255,255,.12)', borderRadius: 20, background: 'rgba(255,255,255,.045)', boxShadow: '0 20px 70px rgba(0,0,0,.35)' }}>
            <div style={{ fontSize: 13, opacity: .65, marginBottom: 10 }}>DOSTHAI AI</div>
            <h1 style={{ margin: '0 0 10px', fontSize: 28 }}>Dosthai needs a quick restart</h1>
            <p style={{ margin: '0 0 22px', lineHeight: 1.6, opacity: .78 }}>
              An unexpected application error occurred. Your locally saved conversations are not intentionally cleared by this recovery screen.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{ border: 0, borderRadius: 12, padding: '11px 16px', fontWeight: 700, cursor: 'pointer', background: '#fff', color: '#111' }}
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
