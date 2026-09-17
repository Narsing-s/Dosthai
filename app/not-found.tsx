import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#090b10', color: '#f5f7fb', fontFamily: 'system-ui, sans-serif' }}>
      <section style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -3 }}>404</div>
        <h1 style={{ margin: '8px 0', fontSize: 24 }}>Page not found</h1>
        <p style={{ color: '#9da5b4', marginBottom: 20 }}>That Dosthai workspace route does not exist.</p>
        <Link href="/" style={{ display: 'inline-block', padding: '10px 15px', borderRadius: 10, background: '#f5f7fb', color: '#111', textDecoration: 'none', fontWeight: 700 }}>Open Dosthai</Link>
      </section>
    </main>
  );
}
