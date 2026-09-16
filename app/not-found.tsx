import Link from 'next/link';

export default function NotFound() {
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#090b10', color: '#f4f5f7', fontFamily: 'system-ui, sans-serif' }}><section style={{ textAlign: 'center' }}><div style={{ fontSize: 44 }}>✦</div><h1>Page not found</h1><p style={{ color: '#9aa2b1' }}>That Dosthai workspace page does not exist.</p><Link href="/" style={{ color: '#a99fff' }}>Return to Dosthai</Link></section></main>;
}
