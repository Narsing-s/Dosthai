import Link from 'next/link';

function decodeShare(id: string) {
  try {
    const json = Buffer.from(id, 'base64url').toString('utf8');
    const value = JSON.parse(json);
    if (!value || typeof value !== 'object' || typeof value.title !== 'string' || !Array.isArray(value.messages)) return null;
    return value as { title: string; messages: Array<{ role: string; content: string }> };
  } catch {
    return null;
  }
}

export default async function SharedConversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversation = decodeShare(id);

  if (!conversation) {
    return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#090b10', color: '#f4f5f7', padding: 24, fontFamily: 'system-ui' }}><div style={{ maxWidth: 620, width: '100%', border: '1px solid #2a2e39', borderRadius: 18, padding: 28, background: '#11151d' }}><h1>Shared conversation unavailable</h1><p style={{ color: '#9aa2b1' }}>This share link is invalid or the conversation could not be decoded.</p><Link href="/" style={{ color: '#a99cff' }}>Open Dosthai</Link></div></main>;
  }

  return <main style={{ minHeight: '100vh', background: '#090b10', color: '#f4f5f7', padding: '32px 18px', fontFamily: 'system-ui' }}><div style={{ maxWidth: 860, margin: '0 auto' }}><header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 28 }}><div><strong style={{ fontSize: 20 }}>✦ Dosthai</strong><h1 style={{ fontSize: 30, margin: '14px 0 0' }}>{conversation.title}</h1></div><Link href="/" style={{ color: '#c3bbff', textDecoration: 'none' }}>Start a chat →</Link></header>{conversation.messages.map((message, index) => <article key={index} style={{ marginBottom: 22, padding: message.role === 'user' ? 18 : 4, borderRadius: 16, background: message.role === 'user' ? '#191d26' : 'transparent', border: message.role === 'user' ? '1px solid #262b35' : '0' }}><div style={{ fontSize: 12, color: '#8e96a6', marginBottom: 8 }}>{message.role === 'user' ? 'You' : 'Dosthai AI'}</div><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, overflowWrap: 'anywhere' }}>{message.content}</div></article>)}</div></main>;
}
