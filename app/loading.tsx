export default function Loading() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#090b10', color: '#f5f7fb', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }} role="status" aria-live="polite">
        <div style={{ width: 42, height: 42, margin: '0 auto 16px', border: '3px solid rgba(255,255,255,.14)', borderTopColor: '#8b7cff', borderRadius: '50%', animation: 'dosthai-spin .8s linear infinite' }} />
        <strong style={{ fontSize: 18 }}>Dosthai</strong>
        <p style={{ margin: '8px 0 0', color: '#9da5b4', fontSize: 13 }}>Preparing your workspace…</p>
        <style>{`@keyframes dosthai-spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </main>
  );
}
