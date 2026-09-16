'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#090b10', color: '#f4f5f7', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ maxWidth: 560, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>✦</div>
        <h1 style={{ fontSize: 28, margin: '0 0 10px' }}>Dosthai hit an unexpected error</h1>
        <p style={{ color: '#9aa2b1', lineHeight: 1.6 }}>Your conversation data is stored separately from this page. Try again, and if the problem continues check the server logs.</p>
        <button onClick={() => reset()} style={{ marginTop: 14, border: 0, borderRadius: 10, padding: '10px 16px', background: '#eee', color: '#111', cursor: 'pointer', fontWeight: 700 }}>Try again</button>
      </section>
    </main>
  );
}
