'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Message = { role: 'user' | 'assistant'; content: string; createdAt?: number };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number };
type Model = { id: string; name: string; hint: string };

const suggestions = [
  ['💡', 'Explain a complex topic', 'Explain quantum computing simply'],
  ['💻', 'Help with code', 'Review this code and find bugs'],
  ['✍️', 'Write something', 'Write a professional email'],
  ['🧠', 'Think through a problem', 'Help me make a project plan'],
  ['🔎', 'Research a topic', 'Compare PostgreSQL and MongoDB for a new app'],
  ['📋', 'Analyze data', 'Create a practical analysis plan for this dataset']
];

const fallbackModels: Model[] = [{ id: '', name: 'Dosthai', hint: 'Configure a server AI model to start chatting' }];

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
  const [agentMode, setAgentMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [models, setModels] = useState<Model[]>(fallbackModels);
  const [selectedModel, setSelectedModel] = useState<Model>(fallbackModels[0]);
  const [dark, setDark] = useState(true);
  const [copied, setCopied] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [listening, setListening] = useState(false);
  const [capabilities, setCapabilities] = useState<Record<string, boolean>>({});
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
      if (model) setSelectedModel(current => ({ ...current, id: model }));
    } catch { /* ignore malformed browser storage */ }

    fetch('/api/models', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => {
      const available = Array.isArray(data?.models) ? data.models.filter((m: Model) => m?.id) : [];
      if (!available.length) return;
      setModels(available);
      setSelectedModel(current => available.find((m: Model) => m.id === current.id) || available[0]);
    }).catch(() => undefined);
    fetch('/api/capabilities', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => setCapabilities(data?.capabilities || {})).catch(() => undefined);
  }, []);

  useEffect(() => { localStorage.setItem('dosthai-conversations', JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { if (selectedModel.id) localStorage.setItem('dosthai-model', selectedModel.id); }, [selectedModel]);
  useEffect(() => { localStorage.setItem('dosthai-theme', dark ? 'dark' : 'light'); }, [dark]);
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

  function saveCurrent(nextMessages: Message[], id = conversationId) {
    if (!id || !nextMessages.length) return;
    setConversations(current => current.map(c => c.id === id ? {
      ...c,
      title: c.title === 'New conversation' && nextMessages[0]?.role === 'user' ? titleFor(nextMessages[0].content) : c.title,
      messages: nextMessages,
      updatedAt: Date.now()
    } : c));
  }

  async function send(value = input) {
    const text = value.trim();
    if (!text || busy) return;
    if (!selectedModel.id) { notify('AI is not configured yet. Add OPENAI_API_KEY and OPENAI_MODEL/DOSTHAI_MODELS on the server.'); return; }
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
      if (agentMode) {
        const response = await fetch('/api/agent', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ message: text, history: messages, model: selectedModel.id }), signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Agent request failed.');
        const answer = typeof data.answer === 'string' ? data.answer : 'The agent returned an empty response.';
        const sourceText = Array.isArray(data.sources) && data.sources.length ? `\n\nSources:\n${data.sources.map((s: any) => `- ${s.title}: ${s.url}`).join('\n')}` : '';
        const updated = next.concat({ role: 'assistant' as const, content: answer + sourceText, createdAt: Date.now() });
        setMessages(updated); saveCurrent(updated, id); return;
      }

      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, history: messages, model: selectedModel.id }), signal: controller.signal
      });
      if (!response.ok || !response.body) {
        const raw = await response.text(); let detail = raw;
        try { detail = JSON.parse(raw).error || raw; } catch { /* text response */ }
        throw new Error(detail);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffer = ''; let answer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n'); buffer = events.pop() || '';
        for (const event of events) for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim(); if (!data || data === '[DONE]') continue;
          try {
            const token = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (token) {
              answer += token;
              const updated = next.concat({ role: 'assistant' as const, content: answer, createdAt: Date.now() });
              setMessages(updated); saveCurrent(updated, id);
            }
          } catch { /* ignore incomplete SSE chunks */ }
        }
      }
      const updated = answer ? next.concat({ role: 'assistant' as const, content: answer, createdAt: Date.now() }) : next.concat({ role: 'assistant' as const, content: 'The model returned an empty response.', createdAt: Date.now() });
      setMessages(updated); saveCurrent(updated, id);
    } catch (error) {
      const updated = next.concat({ role: 'assistant' as const, content: error instanceof DOMException && error.name === 'AbortError' ? 'Generation stopped.' : `I couldn't reach the AI service. ${error instanceof Error ? error.message : 'Request failed'}`, createdAt: Date.now() });
      setMessages(updated); saveCurrent(updated, id);
    } finally { abortRef.current = null; setBusy(false); }
  }

  function stopGeneration() { abortRef.current?.abort(); }
  function newChat() { if (busy) stopGeneration(); setMessages([]); setConversationId(null); setInput(''); setMenuOpen(false); setSidebarOpen(false); }
  function openConversation(c: Conversation) { if (busy) return; setConversationId(c.id); setMessages(c.messages); setSidebarOpen(false); setMenuOpen(false); }
  function deleteConversation(id: string) { setConversations(current => current.filter(c => c.id !== id)); if (conversationId === id) newChat(); }
  function editUserMessage(index: number) {
    if (busy) return;
    const message = messages[index]; if (message.role !== 'user') return;
    setInput(message.content);
    const trimmed = messages.slice(0, index);
    setMessages(trimmed);
    saveCurrent(trimmed);
    notify('Message loaded into the composer. Edit it and send again.');
  }

  async function copyMessage(index: number, text: string) {
    await navigator.clipboard.writeText(text); setCopied(index); window.setTimeout(() => setCopied(null), 1400);
  }
  async function shareConversation(c: Conversation | null = conversationId ? conversations.find(x => x.id === conversationId) || null : null) {
    if (!c) { notify('Open a conversation before sharing it.'); return; }
    try {
      const response = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
      const data = await response.json(); if (!response.ok || !data.url) throw new Error(data.error || 'Unable to create share link.');
      await navigator.clipboard.writeText(data.url); notify('Share link copied.');
    } catch (e) { notify(e instanceof Error ? e.message : 'Unable to create share link.'); }
  }
  function exportConversation(c: Conversation | null = conversationId ? conversations.find(x => x.id === conversationId) || null : null) {
    if (!c) { notify('Open a conversation before exporting it.'); return; }
    const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `dosthai-${c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 35) || 'conversation'}.json`; a.click(); URL.revokeObjectURL(url);
  }
  function importConversations(file: File) {
    const reader = new FileReader(); reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '')); const items = Array.isArray(parsed) ? parsed : [parsed];
        const valid = items.filter((x): x is Conversation => x && typeof x.id === 'string' && typeof x.title === 'string' && Array.isArray(x.messages));
        if (!valid.length) throw new Error('No valid Dosthai conversation found.');
        setConversations(current => [...valid.map(x => ({ ...x, id: makeId() })), ...current]); notify(`${valid.length} conversation${valid.length > 1 ? 's' : ''} imported.`);
      } catch (e) { notify(e instanceof Error ? e.message : 'Invalid conversation file.'); }
    }; reader.readAsText(file);
  }
  function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) { notify('Files are limited to 2 MB in this version.'); return; }
    if (!/\.(txt|md|csv|json|xml|yaml|yml|js|ts|tsx|jsx|java|py|sql|raml|dw)$/i.test(file.name)) { notify('Attach a supported text/code file.'); return; }
    const reader = new FileReader(); reader.onload = () => { const content = String(reader.result || '').slice(0, 30000); setInput(current => `${current ? `${current}\n\n` : ''}Please analyze the attached file: ${file.name}\n\n\`\`\`\n${content}\n\`\`\``); notify(`${file.name} added to the message.`); }; reader.readAsText(file);
  }
  function startVoice() {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { notify('Voice input is not supported by this browser.'); return; } if (listening) return;
    const recognition = new Recognition(); recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true); recognition.onend = () => setListening(false); recognition.onerror = () => { setListening(false); notify('Voice input could not be started.'); };
    recognition.onresult = (event: any) => setInput(current => `${current}${current ? ' ' : ''}${event.results[0][0].transcript}`); recognition.start();
  }

  const sorted = useMemo(() => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt), [conversations]);
  const recent = useMemo(() => sorted.filter(c => !search.trim() || `${c.title} ${c.messages.map(m => m.content).join(' ')}`.toLowerCase().includes(search.toLowerCase())).slice(0, 20), [sorted, search]);

  return <main className={`dosthai ${dark ? '' : 'light'}`}>
    {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><span className="brandmark">D</span><span>Dosthai</span><button className="close-sidebar" onClick={() => setSidebarOpen(false)}>×</button></div>
      <button className="newchat" onClick={newChat}>＋ <span>New chat</span><kbd>Ctrl K</kbd></button>
      <button className="search-chat" onClick={() => setSearchOpen(!searchOpen)}>⌕ <span>Search chats</span><kbd>Ctrl F</kbd></button>
      {searchOpen && <div className="search-box"><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…" /><button onClick={() => { setSearch(''); setSearchOpen(false); }}>×</button></div>}
      <div className="navtitle">Recent</div>
      <div className="history-list">{recent.length ? recent.map(c => <div className={`history-row ${conversationId === c.id ? 'active' : ''}`} key={c.id}><button className="history" onClick={() => openConversation(c)}>◷ <span>{c.title}</span></button><button className="delete-chat" onClick={() => deleteConversation(c.id)} aria-label={`Delete ${c.title}`}>×</button></div>) : <div className="empty-history">{search ? 'No matching conversations.' : 'Your conversations will appear here.'}</div>}</div>
      <div className="sidebar-section"><div className="navtitle">Workspace</div><button className="sideitem" onClick={newChat}>⌘ <span>AI Chat</span></button><button className="sideitem" onClick={() => notify(capabilities.rag ? 'Knowledge base is enabled.' : 'Knowledge base is not configured on this server.')}>◫ <span>Files & knowledge</span></button><button className="sideitem" onClick={() => setSettingsOpen(true)}>⚙ <span>Settings</span></button></div>
      <div className="spacer" /><div className="account"><div className="avatar">N</div><div><strong>Narsing</strong><span>Personal workspace</span></div><button onClick={() => setMenuOpen(!menuOpen)}>•••</button></div>
    </aside>

    <section className="main">
      <header className="topbar"><button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">☰</button><div className="mobilebrand">Dosthai</div><button className="model" onClick={() => setModelOpen(!modelOpen)}>{selectedModel.name} <small>▾</small></button>
        <div className="topactions"><button className={agentMode ? 'active-mode' : ''} onClick={() => setAgentMode(v => !v)} title="Use the multi-step agent with tools">{agentMode ? 'Agent on' : 'Agent'}</button><button onClick={() => exportConversation()}>Export</button><button onClick={() => setMenuOpen(!menuOpen)} aria-label="More options">•••</button></div>
        {modelOpen && <div className="model-menu">{models.filter(m => m.id).map(model => <button key={model.id} className={selectedModel.id === model.id ? 'selected' : ''} onClick={() => { setSelectedModel(model); setModelOpen(false); }}><span><strong>{model.name}</strong><small>{model.hint}</small></span>{selectedModel.id === model.id && <b>✓</b>}</button>)}{models.every(m => !m.id) && <div className="model-empty">No server model configured.</div>}</div>}
        {menuOpen && <div className="menu"><button onClick={() => { shareConversation(); setMenuOpen(false); }}>Share conversation</button><button onClick={() => { exportConversation(); setMenuOpen(false); }}>Export JSON</button><button onClick={() => importRef.current?.click()}>Import JSON</button><button onClick={() => setSettingsOpen(true)}>Settings</button><button onClick={() => { setDark(v => !v); setMenuOpen(false); }}>Switch to {dark ? 'light' : 'dark'} mode</button></div>}
      </header>

      <div className="chat"><div className="center">
        {!messages.length ? <div className="hero"><div className="hero-icon">✦</div><h1>How can I help?</h1><p>Dosthai is your AI workspace for thinking, coding, writing, research, analysis, and everyday work.</p><div className="suggestions">{suggestions.map(([icon, title, prompt]) => <button key={prompt} onClick={() => send(prompt)}><span>{icon}</span><div><strong>{title}</strong><small>{prompt}</small></div><b>›</b></button>)}</div></div> : <div className="messages">{messages.map((message, index) => <article className={`message ${message.role}`} key={`${message.createdAt || index}-${index}`}><div className="role"><span className={message.role === 'assistant' ? 'ai-avatar' : 'user-avatar'}>{message.role === 'assistant' ? '✦' : 'N'}</span>{message.role === 'assistant' ? 'Dosthai' : 'You'}</div><div className="content">{message.content ? renderContent(message.content) : <span className="typing"><i/><i/><i/></span>}</div>{message.content && <div className="message-actions">{message.role === 'user' && !busy && <button onClick={() => editUserMessage(index)}>Edit</button>}{message.role === 'assistant' && <><button onClick={() => copyMessage(index, message.content)}>{copied === index ? 'Copied' : 'Copy'}</button><button onClick={() => { const prior = messages.slice(0, index).reverse().find(m => m.role === 'user'); if (prior && !busy) send(prior.content); }}>Regenerate</button></>}</div>}</article>)}<div ref={endRef}/></div>}
      </div></div>

      <div className="composer"><div className="composerbox"><button className="attach" onClick={() => fileRef.current?.click()} aria-label="Attach file">＋</button><textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={agentMode ? 'Ask Dosthai Agent…' : 'Message Dosthai…'} rows={1} /><button className={`voice ${listening ? 'active' : ''}`} onClick={startVoice} aria-label="Voice input">◉</button><button className={`send ${busy ? 'stop' : ''}`} onClick={busy ? stopGeneration : () => send()} disabled={!busy && !input.trim()} aria-label={busy ? 'Stop generation' : 'Send'}>{busy ? '■' : '↑'}</button></div><div className="composer-note">{agentMode ? 'Agent mode can use calculator and configured web research tools.' : 'Dosthai streams responses for fast feedback. It can make mistakes; check important information.'}</div></div>
    </section>

    <input ref={fileRef} hidden type="file" accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.java,.py,.sql,.raml,.dw" onChange={e => { const file = e.target.files?.[0]; if (file) handleFile(file); e.currentTarget.value = ''; }} />
    <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={e => { const file = e.target.files?.[0]; if (file) importConversations(file); e.currentTarget.value = ''; }} />
    {notice && <div className="toast">{notice}</div>}
    {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="settings-modal" onClick={e => e.stopPropagation()}><div className="modal-head"><h2>Dosthai settings</h2><button onClick={() => setSettingsOpen(false)}>×</button></div><div className="setting"><div><strong>Appearance</strong><small>Choose the interface theme.</small></div><div className="setting-actions"><button className="theme-toggle" onClick={() => setDark(true)}>Dark</button><button className="theme-toggle" onClick={() => setDark(false)}>Light</button></div></div><div className="setting"><div><strong>AI model</strong><small>{selectedModel.id ? `${selectedModel.name} · ${selectedModel.hint}` : 'No server model configured'}</small></div><button className="theme-toggle" onClick={() => { setSettingsOpen(false); setModelOpen(true); }}>Change</button></div><div className="setting"><div><strong>Agent mode</strong><small>Multi-step tool calling for calculator and configured research.</small></div><button className="theme-toggle" onClick={() => setAgentMode(v => !v)}>{agentMode ? 'On' : 'Off'}</button></div><div className="setting"><div><strong>Local privacy</strong><small>Browser conversation history is stored locally in this version.</small></div><button className="theme-toggle" onClick={() => { localStorage.removeItem('dosthai-conversations'); setConversations([]); notify('Local conversation history cleared.'); }}>Clear</button></div><div className="setting"><div><strong>Capabilities</strong><small>{Object.entries(capabilities).filter(([, value]) => value).length} advanced capabilities currently configured.</small></div><button className="theme-toggle" onClick={() => notify('Dosthai supports streaming chat, model routing, tools, agent workflows, files, voice input and configured research.')}>Details</button></div><div className="settings-footer">Dosthai AI · local-first workspace · optional cloud integrations activate only when configured on the server.</div></div></div>}
  </main>;
}
