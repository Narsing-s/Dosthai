'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string; createdAt?: number };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };

const suggestions = [
  ['💡', 'Explain a complex topic', 'Explain quantum computing simply'],
  ['💻', 'Help with code', 'Review this code and find bugs'],
  ['✍️', 'Write something', 'Write a professional email'],
  ['🧠', 'Think through a problem', 'Help me make a project plan']
];

const models = [
  { id: 'gpt-5-mini', name: 'Dosthai Fast', hint: 'Fast everyday help' },
  { id: 'gpt-5', name: 'Dosthai Pro', hint: 'More capable reasoning' },
  { id: 'gpt-5-mini', name: 'Dosthai Balanced', hint: 'Great general assistant' }
];

function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function titleFor(text: string) { return text.trim().replace(/\s+/g, ' ').slice(0, 42) || 'New conversation'; }

function renderContent(text: string) {
  const parts = text.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith('```')) {
      const lines = part.replace(/^```[\w-]*\n?/, '').replace(/```$/, '');
      return <pre className="codeblock" key={i}><code>{lines}</code></pre>;
    }
    return <span key={i}>{part.split(/(\*\*[^*]+\*\*)/g).map((x, j) => x.startsWith('**') ? <strong key={j}>{x.slice(2, -2)}</strong> : x)}</span>;
  });
}

export default function Home() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(models[0]);
  const [dark, setDark] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dosthai-conversations');
      const theme = localStorage.getItem('dosthai-theme');
      if (saved) setConversations(JSON.parse(saved));
      if (theme === 'light') setDark(false);
    } catch { /* ignore malformed browser storage */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('dosthai-conversations', JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); }
      if (e.key === 'Escape') { setMenuOpen(false); setModelOpen(false); setSettingsOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function saveCurrent(nextMessages: Message[]) {
    if (!conversationId || !nextMessages.length) return;
    setConversations(current => current.map(c => c.id === conversationId ? {
      ...c,
      title: c.title === 'New conversation' && nextMessages[0]?.role === 'user' ? titleFor(nextMessages[0].content) : c.title,
      messages: nextMessages,
      updatedAt: Date.now()
    } : c));
  }

  async function send(value = input) {
    const text = value.trim();
    if (!text || busy) return;
    const id = conversationId || makeId();
    if (!conversationId) {
      setConversationId(id);
      setConversations(current => [{ id, title: titleFor(text), messages: [], updatedAt: Date.now() }, ...current]);
    }
    const next = [...messages, { role: 'user' as const, content: text, createdAt: Date.now() }];
    setInput('');
    setMessages([...next, { role: 'assistant', content: '', createdAt: Date.now() }]);
    setBusy(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages, model: selectedModel.id })
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
                const updated = next.concat({ role: 'assistant' as const, content: answer, createdAt: Date.now() });
                setMessages(updated);
                saveCurrent(updated);
              }
            } catch { /* ignore incomplete SSE chunks */ }
          }
        }
      }
      if (!answer) {
        const updated = next.concat({ role: 'assistant' as const, content: 'The model returned an empty response.', createdAt: Date.now() });
        setMessages(updated); saveCurrent(updated);
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Request failed';
      const updated = next.concat({ role: 'assistant' as const, content: `I couldn't reach the AI service. ${detail}`, createdAt: Date.now() });
      setMessages(updated); saveCurrent(updated);
    } finally { setBusy(false); }
  }

  function newChat() {
    setMessages([]); setConversationId(null); setInput(''); setMenuOpen(false); setSidebarOpen(false);
  }

  function openConversation(c: Conversation) {
    if (busy) return;
    setConversationId(c.id); setMessages(c.messages); setSidebarOpen(false); setMenuOpen(false);
  }

  function deleteConversation(id: string) {
    setConversations(current => current.filter(c => c.id !== id));
    if (conversationId === id) newChat();
  }

  async function copyMessage(index: number, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(index); setTimeout(() => setCopied(null), 1400);
  }

  function handleFile(file: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setNotice('Files are limited to 2 MB in this version.'); return; }
    const allowed = /\.(txt|md|csv|json|xml|yaml|yml|js|ts|tsx|jsx|java|py|sql|raml|dw)$/i.test(file.name);
    if (!allowed) { setNotice('Attach a text/code file such as .txt, .md, .json, .csv, .dw or .java.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '').slice(0, 30000);
      setInput(current => `${current ? `${current}\n\n` : ''}Please analyze the attached file: ${file.name}\n\n\`\`\`\n${content}\n\`\`\``);
      setNotice(`${file.name} added to the message.`);
      setTimeout(() => setNotice(''), 2500);
    };
    reader.readAsText(file);
  }

  const sorted = useMemo(() => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt), [conversations]);
  const recent = sorted.slice(0, 12);

  return (
    <main className={`dosthai ${dark ? '' : 'light'}`}>
      {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><span className="brandmark">D</span><span>Dosthai</span><button className="close-sidebar" onClick={() => setSidebarOpen(false)}>×</button></div>
        <button className="newchat" onClick={newChat}>＋ <span>New chat</span><kbd>Ctrl K</kbd></button>
        <div className="navtitle">Recent</div>
        <div className="history-list">
          {recent.length ? recent.map(c => <div className={`history-row ${conversationId === c.id ? 'active' : ''}`} key={c.id}>
            <button className="history" onClick={() => openConversation(c)}>◷ <span>{c.title}</span></button>
            <button className="delete-chat" onClick={() => deleteConversation(c.id)} aria-label={`Delete ${c.title}`}>×</button>
          </div>) : <div className="empty-history">Your conversations will appear here.</div>}
        </div>
        <div className="sidebar-section"><div className="navtitle">Workspace</div><button className="sideitem" onClick={newChat}>⌘ <span>AI Chat</span></button><button className="sideitem" onClick={() => setNotice('Files & knowledge is being prepared for the next release.')}>◫ <span>Files & knowledge</span></button><button className="sideitem" onClick={() => setSettingsOpen(true)}>⚙ <span>Settings</span></button></div>
        <div className="spacer" />
        <div className="account"><div className="avatar">N</div><div><strong>Narsing</strong><span>Personal workspace</span></div><button onClick={() => setMenuOpen(!menuOpen)}>•••</button></div>
      </aside>

      <section className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">☰</button>
          <div className="mobilebrand">Dosthai</div>
          <button className="model" onClick={() => setModelOpen(!modelOpen)}>{selectedModel.name} <small>▾</small></button>
          <div className="topactions"><button onClick={() => setNotice('Share links will be available after cloud conversation sync is enabled.')}>Share</button><button onClick={() => setMenuOpen(!menuOpen)} aria-label="More options">•••</button></div>
          {modelOpen && <div className="model-menu">{models.map(m => <button key={m.id + m.name} onClick={() => { setSelectedModel(m); setModelOpen(false); }} className={selectedModel.name === m.name ? 'selected' : ''}><span><strong>{m.name}</strong><small>{m.hint}</small></span>{selectedModel.name === m.name && '✓'}</button>)}</div>}
        </header>
        <div className="chat"><div className="center">
          {messages.length === 0 ? <div className="hero"><div className="hero-icon">✦</div><h1>How can I help you today?</h1><p>Your AI companion for ideas, code, research, writing, and everyday problems.</p><div className="suggestions">{suggestions.map(([icon, title, prompt]) => <button key={title} onClick={() => send(prompt)}><span>{icon}</span><div><strong>{title}</strong><small>{prompt}</small></div><b>→</b></button>)}</div></div> : <div className="messages">{messages.map((m, i) => <article key={`${m.createdAt || i}-${i}`} className={`message ${m.role}`}><div className="role"><span className={m.role === 'assistant' ? 'ai-avatar' : 'user-avatar'}>{m.role === 'assistant' ? '✦' : 'N'}</span>{m.role === 'assistant' ? 'Dosthai AI' : 'You'}</div><div className="content">{m.content ? renderContent(m.content) : (busy && i === messages.length - 1 ? <span className="typing"><i /> <i /> <i /></span> : '')}</div>{m.role === 'assistant' && m.content && <div className="message-actions"><button onClick={() => copyMessage(i, m.content)}>{copied === i ? '✓ Copied' : 'Copy'}</button><button onClick={() => { const previous = messages[i - 1]; if (previous) send(previous.content); }}>Regenerate</button></div>}</article>)}</div>}
          <div ref={endRef} />
        </div></div>
        <div className="composer"><div className="composerbox"><button className="attach" onClick={() => fileRef.current?.click()} title="Attach a text or code file">＋</button><input ref={fileRef} type="file" hidden accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.java,.py,.sql,.raml,.dw" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} /><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message Dosthai AI…" rows={1} /><button className="send" disabled={!input.trim() || busy} onClick={() => send()}>{busy ? '…' : '↑'}</button></div><div className="composer-note">Dosthai AI can make mistakes. Check important information.</div></div>
        {notice && <div className="toast">{notice}</div>}
        {menuOpen && <div className="menu"><button onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}>Settings <span>⌘,</span></button><button onClick={() => setNotice('Enter sends. Shift + Enter creates a new line. Ctrl/⌘ + K starts a new chat.')}>Keyboard shortcuts <span>?</span></button><button onClick={newChat}>Start a new chat</button><button className="danger" onClick={() => { localStorage.removeItem('dosthai-conversations'); setConversations([]); newChat(); }}>Clear local history</button></div>}
        {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><div className="settings-modal" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><h2>Settings</h2><button onClick={() => setSettingsOpen(false)}>×</button></div><div className="setting"><div><strong>Theme</strong><small>Choose how Dosthai looks on this device.</small></div><button className="theme-toggle" onClick={() => { const next = !dark; setDark(next); localStorage.setItem('dosthai-theme', next ? 'dark' : 'light'); }}>{dark ? 'Dark' : 'Light'}</button></div><div className="setting"><div><strong>Local history</strong><small>Conversations are stored in this browser until cloud sync is enabled.</small></div><button className="theme-toggle" onClick={() => { localStorage.removeItem('dosthai-conversations'); setConversations([]); newChat(); }}>Clear</button></div><div className="settings-footer">Dosthai v0.3 · AI workspace</div></div></div>}
      </section>
    </main>
  );
}
