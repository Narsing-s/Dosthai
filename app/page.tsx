'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string; createdAt?: number };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };

const suggestions = [
  ['💡', 'Explain a complex topic', 'Explain quantum computing simply'],
  ['💻', 'Help with code', 'Review this code and find bugs'],
  ['✍️', 'Write something', 'Write a professional email'],
  ['🧠', 'Think through a problem', 'Help me make a project plan'],
  ['🔎', 'Research a topic', 'Compare PostgreSQL and MongoDB for a new app'],
  ['📋', 'Analyze data', 'Create a practical analysis plan for this dataset']
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
      const language = part.match(/^```([\w-]*)/)?.[1] || '';
      const lines = part.replace(/^```[\w-]*\n?/, '').replace(/```$/, '');
      return <div className="code-wrap" key={i}><div className="code-head"><span>{language || 'code'}</span><button onClick={() => navigator.clipboard.writeText(lines)}>Copy</button></div><pre className="codeblock"><code>{lines}</code></pre></div>;
    }
    return <span key={i}>{part.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((x, j) => x.startsWith('**') ? <strong key={j}>{x.slice(2, -2)}</strong> : x.startsWith('`') ? <code className="inline-code" key={j}>{x.slice(1, -1)}</code> : x)}</span>;
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedModel, setSelectedModel] = useState(models[0]);
  const [dark, setDark] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('dosthai-conversations');
      const theme = localStorage.getItem('dosthai-theme');
      const model = localStorage.getItem('dosthai-model');
      if (saved) setConversations(JSON.parse(saved));
      if (theme === 'light') setDark(false);
      if (model) { const found = models.find(m => m.id === model); if (found) setSelectedModel(found); }
    } catch { /* ignore malformed browser storage */ }
  }, []);

  useEffect(() => { localStorage.setItem('dosthai-conversations', JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { localStorage.setItem('dosthai-model', selectedModel.id); }, [selectedModel]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); setSearchOpen(true); }
      if (e.key === 'Escape') { setMenuOpen(false); setModelOpen(false); setSettingsOpen(false); setSearchOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function notify(text: string) { setNotice(text); window.setTimeout(() => setNotice(''), 2600); }

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
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages, model: selectedModel.id }),
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        const raw = await response.text();
        let detail = raw;
        try { detail = JSON.parse(raw).error || raw; } catch { /* text response */ }
        throw new Error(detail);
      }
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
      if (error instanceof DOMException && error.name === 'AbortError') {
        const updated = next.concat({ role: 'assistant' as const, content: 'Generation stopped.', createdAt: Date.now() });
        setMessages(updated); saveCurrent(updated);
      } else {
        const detail = error instanceof Error ? error.message : 'Request failed';
        const updated = next.concat({ role: 'assistant' as const, content: `I couldn't reach the AI service. ${detail}`, createdAt: Date.now() });
        setMessages(updated); saveCurrent(updated);
      }
    } finally { abortRef.current = null; setBusy(false); }
  }

  function stopGeneration() { abortRef.current?.abort(); }
  function newChat() { if (busy) stopGeneration(); setMessages([]); setConversationId(null); setInput(''); setMenuOpen(false); setSidebarOpen(false); }
  function openConversation(c: Conversation) { if (busy) return; setConversationId(c.id); setMessages(c.messages); setSidebarOpen(false); setMenuOpen(false); }
  function deleteConversation(id: string) { setConversations(current => current.filter(c => c.id !== id)); if (conversationId === id) newChat(); }

  async function copyMessage(index: number, text: string) {
    await navigator.clipboard.writeText(text); setCopied(index); window.setTimeout(() => setCopied(null), 1400);
  }

  function exportConversation(c: Conversation | null = conversationId ? conversations.find(x => x.id === conversationId) || null : null) {
    if (!c) { notify('Open a conversation before exporting it.'); return; }
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `dosthai-${c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 35) || 'conversation'}.json`; a.click(); URL.revokeObjectURL(url);
  }

  function importConversations(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        const items = Array.isArray(parsed) ? parsed : [parsed];
        const valid = items.filter((x): x is Conversation => x && typeof x.id === 'string' && typeof x.title === 'string' && Array.isArray(x.messages));
        if (!valid.length) throw new Error('No valid Dosthai conversation found.');
        setConversations(current => [...valid.map(x => ({ ...x, id: makeId() })), ...current]);
        notify(`${valid.length} conversation${valid.length > 1 ? 's' : ''} imported.`);
      } catch (e) { notify(e instanceof Error ? e.message : 'Invalid conversation file.'); }
    };
    reader.readAsText(file);
  }

  function handleFile(file: File) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { notify('Files are limited to 2 MB in this version.'); return; }
    const allowed = /\.(txt|md|csv|json|xml|yaml|yml|js|ts|tsx|jsx|java|py|sql|raml|dw)$/i.test(file.name);
    if (!allowed) { notify('Attach a text/code file such as .txt, .md, .json, .csv, .dw or .java.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '').slice(0, 30000);
      setInput(current => `${current ? `${current}\n\n` : ''}Please analyze the attached file: ${file.name}\n\n\`\`\`\n${content}\n\`\`\``);
      notify(`${file.name} added to the message.`);
    };
    reader.readAsText(file);
  }

  function startVoice() {
    const SpeechRecognition = (window as Window & { SpeechRecognition?: new () => { lang: string; start: () => void; stop: () => void; onresult: (e: { results: { 0: { 0: { transcript: string } } }[] }) => void; onend: () => void; onerror: () => void } }).SpeechRecognition;
    if (!SpeechRecognition) { notify('Voice input is not supported by this browser.'); return; }
    if (listening) return;
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.onresult = e => setInput(current => `${current}${current ? ' ' : ''}${e.results[0][0].transcript}`);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); notify('Voice input could not be started.'); };
    setListening(true); recognition.start();
  }

  const sorted = useMemo(() => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt), [conversations]);
  const recent = useMemo(() => sorted.filter(c => !search.trim() || `${c.title} ${c.messages.map(m => m.content).join(' ')}`.toLowerCase().includes(search.toLowerCase())).slice(0, 20), [sorted, search]);

  return (
    <main className={`dosthai ${dark ? '' : 'light'}`}>
      {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand"><span className="brandmark">D</span><span>Dosthai</span><button className="close-sidebar" onClick={() => setSidebarOpen(false)}>×</button></div>
        <button className="newchat" onClick={newChat}>＋ <span>New chat</span><kbd>Ctrl K</kbd></button>
        <button className="search-chat" onClick={() => setSearchOpen(!searchOpen)}>⌕ <span>Search chats</span><kbd>Ctrl F</kbd></button>
        {searchOpen && <div className="search-box"><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…" /><button onClick={() => { setSearch(''); setSearchOpen(false); }}>×</button></div>}
        <div className="navtitle">Recent</div>
        <div className="history-list">
          {recent.length ? recent.map(c => <div className={`history-row ${conversationId === c.id ? 'active' : ''}`} key={c.id}>
            <button className="history" onClick={() => openConversation(c)}>◷ <span>{c.title}</span></button>
            <button className="delete-chat" onClick={() => deleteConversation(c.id)} aria-label={`Delete ${c.title}`}>×</button>
          </div>) : <div className="empty-history">{search ? 'No matching conversations.' : 'Your conversations will appear here.'}</div>}
        </div>
        <div className="sidebar-section"><div className="navtitle">Workspace</div><button className="sideitem" onClick={newChat}>⌘ <span>AI Chat</span></button><button className="sideitem" onClick={() => notify('Files & knowledge workspace is ready for the cloud/RAG integration stage.')}>◫ <span>Files & knowledge</span></button><button className="sideitem" onClick={() => setSettingsOpen(true)}>⚙ <span>Settings</span></button></div>
        <div className="spacer" />
        <div className="account"><div className="avatar">N</div><div><strong>Narsing</strong><span>Personal workspace</span></div><button onClick={() => setMenuOpen(!menuOpen)}>•••</button></div>
      </aside>

      <section className="main">
        <header className="topbar">
          <button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">☰</button>
          <div className="mobilebrand">Dosthai</div>
          <button className="model" onClick={() => setModelOpen(!modelOpen)}>{selectedModel.name} <small>▾</small></button>
          <div className="topactions"><button onClick={() => exportConversation()}>Export</button><button onClick={() => setMenuOpen(!menuOpen)} aria-label="More options">•••</button></div>
          {modelOpen && <div className="model-menu">{models.map(m => <button key={m.id + m.name} onClick={() => { setSelectedModel(m); setModelOpen(false); }} className={selectedModel.name === m.name ? 'selected' : ''}><span><strong>{m.name}</strong><small>{m.hint}</small></span>{selectedModel.name === m.name && '✓'}</button>)}</div>}
        </header>
        <div className="chat"><div className="center">
          {messages.length === 0 ? <div className="hero"><div className="hero-icon">✦</div><h1>How can I help you today?</h1><p>Your AI companion for ideas, code, research, writing, analysis, and everyday problems.</p><div className="suggestions">{suggestions.map(([icon, title, prompt]) => <button key={title} onClick={() => send(prompt)}><span>{icon}</span><div><strong>{title}</strong><small>{prompt}</small></div><b>→</b></button>)}</div></div> : <div className="messages">{messages.map((m, i) => <article key={`${m.createdAt || i}-${i}`} className={`message ${m.role}`}><div className="role"><span className={m.role === 'assistant' ? 'ai-avatar' : 'user-avatar'}>{m.role === 'assistant' ? '✦' : 'N'}</span>{m.role === 'assistant' ? 'Dosthai AI' : 'You'}</div><div className="content">{m.content ? renderContent(m.content) : (busy && i === messages.length - 1 ? <span className="typing"><i /> <i /> <i /></span> : '')}</div>{m.role === 'assistant' && m.content && <div className="message-actions"><button onClick={() => copyMessage(i, m.content)}>{copied === i ? '✓ Copied' : 'Copy'}</button><button onClick={() => { const previous = messages[i - 1]; if (previous) send(previous.content); }}>Regenerate</button><button onClick={() => exportConversation()}>Export chat</button></div>}</article>)}</div>}
          <div ref={endRef} />
        </div></div>
        <div className="composer"><div className="composerbox"><button className="attach" onClick={() => fileRef.current?.click()} title="Attach a text or code file">＋</button><input ref={fileRef} type="file" hidden accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.java,.py,.sql,.raml,.dw" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} /><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message Dosthai AI…" rows={1} /><button className={`voice ${listening ? 'active' : ''}`} onClick={startVoice} title="Voice input">{listening ? '●' : '◉'}</button>{busy ? <button className="send stop" onClick={stopGeneration} title="Stop generating">■</button> : <button className="send" disabled={!input.trim()} onClick={() => send()}>↑</button>}</div><div className="composer-note">Enter sends · Shift + Enter for a new line · Ctrl/⌘ + K for a new chat · Ctrl/⌘ + F to search</div></div>
        {notice && <div className="toast">{notice}</div>}
        {menuOpen && <div className="menu"><button onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}>Settings <span>⌘,</span></button><button onClick={() => { setSearchOpen(true); setMenuOpen(false); }}>Search chats <span>Ctrl F</span></button><button onClick={() => exportConversation()}>Export current chat</button><button onClick={() => importRef.current?.click()}>Import chats</button><input ref={importRef} type="file" hidden accept="application/json,.json" onChange={e => { const f = e.target.files?.[0]; if (f) importConversations(f); e.currentTarget.value = ''; }} /><button onClick={() => notify('Dosthai supports Enter to send, Shift + Enter for new lines, Ctrl/⌘ + K for new chat, and Ctrl/⌘ + F for search.')}>Keyboard shortcuts <span>?</span></button><button onClick={newChat}>Start a new chat</button><button className="danger" onClick={() => { localStorage.removeItem('dosthai-conversations'); setConversations([]); newChat(); }}>Clear local history</button></div>}
        {settingsOpen && <div className="modal-backdrop" onMouseDown={() => setSettingsOpen(false)}><div className="settings-modal" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><h2>Settings</h2><button onClick={() => setSettingsOpen(false)}>×</button></div><div className="setting"><div><strong>Theme</strong><small>Choose how Dosthai looks on this device.</small></div><button className="theme-toggle" onClick={() => { const next = !dark; setDark(next); localStorage.setItem('dosthai-theme', next ? 'dark' : 'light'); }}>{dark ? 'Dark' : 'Light'}</button></div><div className="setting"><div><strong>AI model</strong><small>Select the model profile used for new responses.</small></div><button className="theme-toggle" onClick={() => setModelOpen(true)}>{selectedModel.name}</button></div><div className="setting"><div><strong>Data</strong><small>Export or import your browser-stored conversations.</small></div><div className="setting-actions"><button className="theme-toggle" onClick={() => exportConversation()}>Export</button><button className="theme-toggle" onClick={() => importRef.current?.click()}>Import</button></div></div><div className="setting"><div><strong>Local history</strong><small>Conversations are stored in this browser until cloud sync is enabled.</small></div><button className="theme-toggle" onClick={() => { localStorage.removeItem('dosthai-conversations'); setConversations([]); newChat(); }}>Clear</button></div><div className="settings-footer">Dosthai · AI workspace · local-first conversation storage</div></div></div>}
      </section>
    </main>
  );
}
