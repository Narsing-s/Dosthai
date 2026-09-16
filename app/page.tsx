'use client';

import { useEffect, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };

const suggestions = [
  ['💡', 'Explain a complex topic', 'Explain quantum computing simply'],
  ['💻', 'Help with code', 'Review this code and find bugs'],
  ['✍️', 'Write something', 'Write a professional email'],
  ['🧠', 'Think through a problem', 'Help me make a project plan']
];

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  async function send(value = input) {
    const text = value.trim();
    if (!text || busy) return;
    const next = [...messages, { role: 'user' as const, content: text }];
    setInput('');
    setMessages([...next, { role: 'assistant', content: '' }]);
    setBusy(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages })
      });
      if (!response.ok || !response.body) throw new Error(await response.text());
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let answer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const event of events) {
          for (const line of event.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const token = JSON.parse(data)?.choices?.[0]?.delta?.content;
              if (token) {
                answer += token;
                setMessages((current) => current.map((m, i) => i === current.length - 1 ? { ...m, content: answer } : m));
              }
            } catch { /* ignore incomplete SSE chunks */ }
          }
        }
      }
      if (!answer) setMessages((current) => current.map((m, i) => i === current.length - 1 ? { ...m, content: 'The model returned an empty response.' } : m));
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Request failed';
      setMessages((current) => current.map((m, i) => i === current.length - 1 ? { ...m, content: `I couldn't reach the AI service. ${detail}` } : m));
    } finally { setBusy(false); }
  }

  function newChat() { setMessages([]); setInput(''); setMenuOpen(false); }

  return (
    <main className="dosthai">
      <aside className="sidebar">
        <div className="brand"><span className="brandmark">D</span><span>Dosthai</span></div>
        <button className="newchat" onClick={newChat}>＋ <span>New chat</span><kbd>Ctrl K</kbd></button>
        <div className="navtitle">Today</div>
        <button className="history active">New conversation</button>
        <div className="sidebar-section"><div className="navtitle">Workspace</div><button className="sideitem">⌘ <span>AI Chat</span></button><button className="sideitem">◫ <span>Files & knowledge</span><span className="soon">Soon</span></button><button className="sideitem">⚙ <span>Settings</span><span className="soon">Soon</span></button></div>
        <div className="spacer" />
        <div className="account"><div className="avatar">N</div><div><strong>Narsing</strong><span>Personal workspace</span></div><button onClick={() => setMenuOpen(!menuOpen)}>•••</button></div>
      </aside>

      <section className="main">
        <header className="topbar"><div className="mobilebrand">Dosthai</div><div className="model">Dosthai <span>AI</span> <small>▾</small></div><div className="topactions"><button>Share</button><button onClick={() => setMenuOpen(!menuOpen)} aria-label="More options">•••</button></div></header>
        <div className="chat"><div className="center">
          {messages.length === 0 ? <div className="hero"><div className="hero-icon">✦</div><h1>How can I help you today?</h1><p>Your AI companion for ideas, code, research, writing, and everyday problems.</p><div className="suggestions">{suggestions.map(([icon, title, prompt]) => <button key={title} onClick={() => send(prompt)}><span>{icon}</span><div><strong>{title}</strong><small>{prompt}</small></div><b>→</b></button>)}</div></div> : <div className="messages">{messages.map((m, i) => <article key={i} className={`message ${m.role}`}><div className="role"><span className={m.role === 'assistant' ? 'ai-avatar' : 'user-avatar'}>{m.role === 'assistant' ? '✦' : 'N'}</span>{m.role === 'assistant' ? 'Dosthai AI' : 'You'}</div><div className="content">{m.content || (busy && i === messages.length - 1 ? <span className="typing"><i /> <i /> <i /></span> : '')}</div></article>)}</div>}
          <div ref={endRef} />
        </div></div>
        <div className="composer"><div className="composerbox"><button className="attach" title="Attachments coming soon">＋</button><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message Dosthai AI…" rows={1} /><button className="send" disabled={!input.trim() || busy} onClick={() => send()}>{busy ? '…' : '↑'}</button></div><div className="composer-note">Dosthai AI can make mistakes. Check important information.</div></div>
        {menuOpen && <div className="menu"><button>Settings <span>⌘,</span></button><button>Keyboard shortcuts <span>?</span></button><button onClick={newChat}>Start a new chat</button></div>}
      </section>
    </main>
  );
}
