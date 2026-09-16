'use client';

import { useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string };

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text })
      });
      const data = await response.json();
      setMessages((m) => [...m, { role: 'assistant', content: data.message ?? 'I could not generate a response.' }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'The AI service is not configured yet. Add a model provider key and connect the provider in the server configuration.' }]);
    } finally { setBusy(false); }
  }

  return (
    <main className="dosthai">
      <aside className="sidebar">
        <div className="brand">Dosthai <span>AI</span></div>
        <button className="newchat" onClick={() => setMessages([])}>＋ New chat</button>
        <div className="navtitle">Chats</div>
        <div className="history active">New conversation</div>
        <div className="spacer" />
        <div className="account">Personal AI workspace<br /><span>More capabilities will be added here.</span></div>
      </aside>
      <section className="main">
        <header className="topbar"><div className="model">Dosthai AI</div><div className="status">AI workspace</div></header>
        <div className="chat"><div className="center">
          {messages.length === 0 && <div className="hero"><h1>How can I help you?</h1><p>Ask questions, write code, analyze ideas, or solve problems.</p></div>}
          {messages.map((m, i) => <div key={i} className={`message ${m.role}`}><div className="role">{m.role === 'user' ? 'You' : 'Dosthai AI'}</div><div>{m.content}</div></div>)}
          {busy && <div className="message assistant"><div className="role">Dosthai AI</div><div>Thinking…</div></div>}
        </div></div>
        <div className="composer"><div className="composerbox"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message Dosthai AI…" rows={1} /><button className="send" onClick={send}>Send</button></div></div>
      </section>
    </main>
  );
}
