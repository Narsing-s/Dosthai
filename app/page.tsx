'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Source = { title?: string; url: string; snippet?: string };
type Message = { role: 'user' | 'assistant'; content: string; createdAt?: number; sources?: Source[]; feedback?: 'up' | 'down' | null };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number; pinned?: boolean; archived?: boolean };
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
  return text.split(/(```[\s\S]*?```)/g).map((part, i) => {
    if (part.startsWith('```')) {
      const language = part.match(/^```([\w-]*)/)?.[1] || '';
      const code = part.replace(/^```[\w-]*\n?/, '').replace(/```$/, '');
      return <div className="code-wrap" key={i}><div className="code-head"><span>{language || 'code'}</span><button onClick={() => navigator.clipboard.writeText(code)}>Copy</button></div><pre className="codeblock"><code>{code}</code></pre></div>;
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
  const [status, setStatus] = useState('');
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
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dosthai-conversations') || '[]');
      if (Array.isArray(saved)) setConversations(saved.map((c: Conversation) => ({ ...c, messages: Array.isArray(c.messages) ? c.messages : [] })));
      if (localStorage.getItem('dosthai-theme') === 'light') setDark(false);
      const model = localStorage.getItem('dosthai-model'); if (model) setSelectedModel(m => ({ ...m, id: model }));
    } catch {}
    fetch('/api/models', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => { const list = Array.isArray(data?.models) ? data.models.filter((m: Model) => m?.id) : []; if (list.length) { setModels(list); setSelectedModel(current => list.find((m: Model) => m.id === current.id) || list[0]); } }).catch(() => undefined);
    fetch('/api/capabilities', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(data => setCapabilities(data?.capabilities || {})).catch(() => undefined);
  }, []);
  useEffect(() => { localStorage.setItem('dosthai-conversations', JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { if (selectedModel.id) localStorage.setItem('dosthai-model', selectedModel.id); }, [selectedModel]);
  useEffect(() => { localStorage.setItem('dosthai-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: busy ? 'auto' : 'smooth' }); }, [messages, busy]);
  useEffect(() => { if (!busy) requestAnimationFrame(() => composerRef.current?.focus()); }, [busy]);

  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2600); };
  function saveCurrent(next: Message[], id = conversationId) { if (!id || !next.length) return; setConversations(items => items.map(c => c.id === id ? { ...c, title: c.title === 'New conversation' ? titleFor(next[0].content) : c.title, messages: next, updatedAt: Date.now() } : c)); }
  function scheduleSave(next: Message[], id: string, immediate = false) { if (saveTimer.current) window.clearTimeout(saveTimer.current); saveTimer.current = null; if (immediate) { saveCurrent(next, id); return; } saveTimer.current = window.setTimeout(() => { saveTimer.current = null; saveCurrent(next, id); }, 400); }
  function parseEvent(event: string, token: (s: string) => void, error: (s: string) => void, status?: (s: string) => void, meta?: (x: any) => void) {
    let type = 'message'; const lines: string[] = [];
    for (const line of event.replace(/\r/g, '').split('\n')) { if (line.startsWith(':')) continue; if (line.startsWith('event:')) type = line.slice(6).trim(); if (line.startsWith('data:')) lines.push(line.slice(5).trimStart()); }
    const raw = lines.join('\n').trim(); if (!raw || raw === '[DONE]') return;
    if (type === 'error') { try { const x = JSON.parse(raw); error(x?.error || 'The AI stream failed.'); } catch { error(raw); } return; }
    try { const x = JSON.parse(raw); if (type === 'ready') status?.(x?.message || 'Working…'); else if (type === 'meta') meta?.(x); else if (type === 'token') token(x?.token || ''); else token(x?.choices?.[0]?.delta?.content || ''); } catch {}
  }
  async function stream(response: Response, base: Message[], id: string, agent: boolean) {
    if (!response.body) throw new Error('Streaming response unavailable.');
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let answer = ''; let failure = ''; let meta: any = null;
    const handle = (event: string) => parseEvent(event, t => { answer += t; const next = base.concat({ role: 'assistant', content: answer, createdAt: Date.now() }); setMessages(next); scheduleSave(next, id); }, e => { failure = e; }, s => { if (!answer) setStatus(s); }, x => { meta = x; });
    while (true) { const { value, done } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n').replace(/\r/g, '\n'); const events = buffer.split('\n\n'); buffer = events.pop() || ''; for (const e of events) handle(e); if (failure) { await reader.cancel(); throw new Error(failure); } }
    buffer += decoder.decode(); if (buffer.trim()) handle(buffer); if (failure) throw new Error(failure);
    const sources: Source[] = Array.isArray(meta?.sources) ? meta.sources.filter((s: any) => s?.url).slice(0, 8) : [];
    const final = base.concat({ role: 'assistant', content: answer || (agent ? 'The agent returned an empty response.' : 'The model returned an empty response.'), createdAt: Date.now(), sources: sources.length ? sources : undefined });
    setMessages(final); scheduleSave(final, id, true);
  }
  async function send(value = input, historyOverride?: Message[]) {
    const text = value.trim(); if (!text || busy) return;
    if (!selectedModel.id) { notify('AI is not configured yet. Add OPENAI_API_KEY and OPENAI_MODEL/DOSTHAI_MODELS on the server.'); return; }
    const history = historyOverride ?? messages; const id = conversationId || makeId();
    if (!conversationId) { setConversationId(id); setConversations(items => [{ id, title: titleFor(text), messages: [], updatedAt: Date.now() }, ...items]); }
    const base = [...history, { role: 'user' as const, content: text, createdAt: Date.now() }];
    setInput(''); setMessages([...base, { role: 'assistant', content: '', createdAt: Date.now() }]); setBusy(true); setStatus(agentMode ? 'Starting agent…' : 'Generating…');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch(agentMode ? '/api/agent/stream' : '/api/chat', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: JSON.stringify({ message: text, history, model: selectedModel.id }), signal: controller.signal });
      if (!response.ok || !response.body) { const raw = await response.text(); let detail = raw; try { detail = JSON.parse(raw).error || raw; } catch {} throw new Error(detail || 'Request failed.'); }
      await stream(response, base, id, agentMode);
    } catch (e) { const content = e instanceof DOMException && e.name === 'AbortError' ? 'Generation stopped.' : `I couldn't reach the AI service. ${e instanceof Error ? e.message : 'Request failed'}`; const next = base.concat({ role: 'assistant', content, createdAt: Date.now() }); setMessages(next); scheduleSave(next, id, true); }
    finally { abortRef.current = null; setBusy(false); setStatus(''); }
  }
  function stop() { abortRef.current?.abort(); }
  function newChat() { if (busy) stop(); setMessages([]); setConversationId(null); setInput(''); setStatus(''); setMenuOpen(false); setSidebarOpen(false); }
  function openChat(c: Conversation) { if (busy) return; setConversationId(c.id); setMessages(c.messages); setSidebarOpen(false); setMenuOpen(false); }
  function deleteChat(id: string) { const c = conversations.find(x => x.id === id); if (!c || !window.confirm(`Delete “${c.title}”? This only removes the local copy.`)) return; setConversations(items => items.filter(x => x.id !== id)); if (id === conversationId) newChat(); }
  function renameChat(id: string) { const c = conversations.find(x => x.id === id); if (!c) return; const name = window.prompt('Conversation name', c.title)?.trim(); if (name) setConversations(items => items.map(x => x.id === id ? { ...x, title: name.slice(0, 80) } : x)); }
  function togglePin(id: string) { setConversations(items => items.map(x => x.id === id ? { ...x, pinned: !x.pinned } : x)); }
  function toggleArchive(id: string) { setConversations(items => items.map(x => x.id === id ? { ...x, archived: !x.archived } : x)); }
  function editMessage(i: number) { if (busy || messages[i]?.role !== 'user') return; const text = messages[i].content; const next = messages.slice(0, i); setMessages(next); saveCurrent(next); setInput(text); requestAnimationFrame(() => composerRef.current?.focus()); }
  function regenerate(i: number) { if (busy || messages[i]?.role !== 'assistant') return; const user = messages.slice(0, i).map((m, n) => m.role === 'user' ? n : -1).filter(n => n >= 0).pop(); if (user === undefined) return; const text = messages[user].content; const base = messages.slice(0, user); setMessages(base); saveCurrent(base); send(text, base); }
  async function copyMessage(i: number, text: string) { await navigator.clipboard.writeText(text); setCopied(i); window.setTimeout(() => setCopied(null), 1400); }
  function feedback(i: number, value: 'up' | 'down') { const next = messages.map((m, n) => n === i ? { ...m, feedback: m.feedback === value ? null : value } : m); setMessages(next); saveCurrent(next); try { localStorage.setItem('dosthai-feedback', JSON.stringify(next.reduce((a, m, n) => ({ ...a, [`${conversationId}:${n}`]: m.feedback || null }), {}))); } catch {} }
  async function share() { const c = conversationId ? conversations.find(x => x.id === conversationId) : null; if (!c) return notify('Open a conversation before sharing it.'); try { const r = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Unable to create share link.'); await navigator.clipboard.writeText(d.url); notify('Share link copied.'); } catch (e) { notify(e instanceof Error ? e.message : 'Unable to share.'); } }
  function exportChat() { const c = conversationId ? conversations.find(x => x.id === conversationId) : null; if (!c) return notify('Open a conversation before exporting it.'); const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `dosthai-${c.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 35) || 'conversation'}.json`; a.click(); URL.revokeObjectURL(url); }
  function importChats(file: File) { const r = new FileReader(); r.onload = () => { try { const parsed = JSON.parse(String(r.result || '')); const list = Array.isArray(parsed) ? parsed : [parsed]; const valid = list.filter((x: any) => x && typeof x.title === 'string' && Array.isArray(x.messages)); if (!valid.length) throw new Error('No valid Dosthai conversations found.'); setConversations(items => [...valid.map((x: any) => ({ ...x, id: makeId() })), ...items]); notify(`${valid.length} conversation${valid.length > 1 ? 's' : ''} imported.`); } catch (e) { notify(e instanceof Error ? e.message : 'Invalid JSON.'); } }; r.readAsText(file); }
  function attach(file: File) { if (file.size > 2 * 1024 * 1024) return notify('Files are limited to 2 MB.'); if (!/\.(txt|md|csv|json|xml|yaml|yml|js|ts|tsx|jsx|java|py|sql|raml|dw)$/i.test(file.name)) return notify('Attach a supported text/code file.'); const r = new FileReader(); r.onload = () => { const content = String(r.result || '').slice(0, 30000); setInput(x => `${x ? `${x}\n\n` : ''}Please analyze the attached file: ${file.name}\n\n\`\`\`\n${content}\n\`\`\``); notify(`${file.name} added.`); }; r.readAsText(file); }
  function voice() { const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!R) return notify('Voice input is not supported by this browser.'); if (listening) return; const r = new R(); r.lang = navigator.language || 'en-US'; r.interimResults = false; r.maxAlternatives = 1; r.onstart = () => setListening(true); r.onend = () => setListening(false); r.onerror = () => { setListening(false); notify('Voice input could not be started.'); }; r.onresult = (e: any) => setInput(x => `${x}${x ? ' ' : ''}${e.results[0][0].transcript}`); r.start(); }
  const recent = useMemo(() => [...conversations].filter(c => !c.archived && (!search || `${c.title} ${c.messages.map(m => m.content).join(' ')}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.updatedAt - a.updatedAt).slice(0, 20), [conversations, search]);

  return <main className={`dosthai ${dark ? '' : 'light'}`}>
    {sidebarOpen && <button className="mobile-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar" />}
    <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="brand"><span className="brandmark">D</span><span>Dosthai</span><button className="close-sidebar" onClick={() => setSidebarOpen(false)}>×</button></div>
      <button className="newchat" onClick={newChat}>＋ <span>New chat</span><kbd>Ctrl K</kbd></button>
      <button className="search-chat" onClick={() => setSearchOpen(v => !v)}>⌕ <span>Search chats</span><kbd>Ctrl F</kbd></button>
      {searchOpen && <div className="search-box"><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search conversations…"/><button onClick={() => {setSearch('');setSearchOpen(false);}}>×</button></div>}
      <div className="navtitle">Recent</div><div className="history-list">{recent.length ? recent.map(c => <div className={`history-row ${conversationId === c.id ? 'active' : ''}`} key={c.id}><button className="history" onClick={() => openChat(c)}>◷ <span>{c.pinned ? '📌 ' : ''}{c.title}</span></button><button className="delete-chat" onClick={() => renameChat(c.id)} aria-label="Rename">✎</button><button className="delete-chat" onClick={() => togglePin(c.id)} aria-label="Pin">☆</button><button className="delete-chat" onClick={() => toggleArchive(c.id)} aria-label="Archive">□</button><button className="delete-chat" onClick={() => deleteChat(c.id)} aria-label="Delete">×</button></div>) : <div className="empty-history">Your conversations will appear here.</div>}</div>
      <div className="sidebar-section"><div className="navtitle">Workspace</div><button className="sideitem" onClick={newChat}>⌘ <span>AI Chat</span></button><button className="sideitem" onClick={() => notify(capabilities.rag ? 'Knowledge base is enabled.' : 'Knowledge base is not configured on this server.')}>◫ <span>Files & knowledge</span></button><button className="sideitem" onClick={() => setSettingsOpen(true)}>⚙ <span>Settings</span></button></div>
      <div className="spacer"/><div className="account"><div className="avatar">N</div><div><strong>Narsing</strong><span>Personal workspace</span></div><button onClick={() => setMenuOpen(v => !v)}>•••</button></div>
    </aside>
    <section className="main">
      <header className="topbar"><button className="hamburger" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">☰</button><div className="mobilebrand">Dosthai</div><button className="model" onClick={() => setModelOpen(v => !v)}>{selectedModel.name} <small>▾</small></button><div className="topactions"><button className={agentMode ? 'active-mode' : ''} onClick={() => setAgentMode(v => !v)}>{agentMode ? 'Agent on' : 'Agent'}</button><button onClick={exportChat}>Export</button><button onClick={() => setMenuOpen(v => !v)}>•••</button></div>
        {modelOpen && <div className="model-menu">{models.filter(m => m.id).map(m => <button key={m.id} className={selectedModel.id === m.id ? 'selected' : ''} onClick={() => {setSelectedModel(m);setModelOpen(false);}}><span><strong>{m.name}</strong><small>{m.hint}</small></span>{selectedModel.id === m.id && <b>✓</b>}</button>)}{models.every(m => !m.id) && <div className="model-empty">No server model configured.</div>}</div>}
        {menuOpen && <div className="menu"><button onClick={() => {share();setMenuOpen(false);}}>Share conversation</button><button onClick={() => {exportChat();setMenuOpen(false);}}>Export JSON</button><button onClick={() => importRef.current?.click()}>Import JSON</button><button onClick={() => setSettingsOpen(true)}>Settings</button><button onClick={() => {setDark(v => !v);setMenuOpen(false);}}>Switch to {dark ? 'light' : 'dark'} mode</button></div>}
      </header>
      {status && <div className="stream-status"><span className="status-dot"/>{status}</div>}
      <div className="chat"><div className="center">{!messages.length ? <div className="hero"><div className="hero-icon">✦</div><h1>How can I help?</h1><p>Dosthai is your AI workspace for thinking, coding, writing, research, analysis, and everyday work.</p><div className="suggestions">{suggestions.map(([icon,title,prompt]) => <button key={prompt} onClick={() => send(prompt)}><span>{icon}</span><div><strong>{title}</strong><small>{prompt}</small></div><b>›</b></button>)}</div></div> : <div className="messages">{messages.map((m,i) => <article className={`message ${m.role}`} key={`${m.createdAt || i}-${i}`}><div className="role"><span className={m.role === 'assistant' ? 'ai-avatar' : 'user-avatar'}>{m.role === 'assistant' ? '✦' : 'N'}</span>{m.role === 'assistant' ? 'Dosthai' : 'You'}</div><div className="content">{m.content ? renderContent(m.content) : <span className="typing"><i/><i/><i/></span>}</div>{m.sources?.length ? <div className="source-cards"><div className="source-title">Sources</div>{m.sources.map((s,n) => <a className="source-card" href={s.url} target="_blank" rel="noreferrer" key={`${s.url}-${n}`}><strong>{s.title || s.url}</strong><span>{s.url}</span>{s.snippet && <small>{s.snippet}</small>}</a>)}</div> : null}{m.content && <div className="message-actions">{m.role === 'user' && !busy && <button onClick={() => editMessage(i)}>Edit</button>}{m.role === 'assistant' && <><button onClick={() => copyMessage(i,m.content)}>{copied === i ? 'Copied' : 'Copy'}</button><button onClick={() => regenerate(i)} disabled={busy}>Regenerate</button><button className={m.feedback === 'up' ? 'feedback-active' : ''} onClick={() => feedback(i,'up')}>👍</button><button className={m.feedback === 'down' ? 'feedback-active' : ''} onClick={() => feedback(i,'down')}>👎</button></>}</div>}</article>)}<div ref={endRef}/></div>}</div></div>
      <div className="composer"><div className="composerbox"><button className="attach" onClick={() => fileRef.current?.click()} aria-label="Attach file">＋</button><textarea ref={composerRef} value={input} onChange={e => {setInput(e.target.value);e.currentTarget.style.height='auto';e.currentTarget.style.height=`${Math.min(e.currentTarget.scrollHeight,180)}px`;}} onKeyDown={e => {if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} placeholder={agentMode ? 'Ask Dosthai Agent…' : 'Message Dosthai…'} rows={1}/><button className={`voice ${listening ? 'active' : ''}`} onClick={voice} aria-label="Voice input">◉</button><button className={`send ${busy ? 'stop' : ''}`} onClick={busy ? stop : () => send()} disabled={!busy && !input.trim()}>{busy ? '■' : '↑'}</button></div><div className="composer-note">{agentMode ? 'Agent mode can use calculator and configured web research tools.' : 'Dosthai streams responses for fast feedback. Check important information.'}</div></div>
    </section>
    <input ref={fileRef} hidden type="file" accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.java,.py,.sql,.raml,.dw" onChange={e => {const f=e.target.files?.[0];if(f)attach(f);e.currentTarget.value='';}}/><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={e => {const f=e.target.files?.[0];if(f)importChats(f);e.currentTarget.value='';}}/>
    {notice && <div className="toast">{notice}</div>}
    {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="settings-modal" onClick={e => e.stopPropagation()}><div className="modal-head"><h2>Dosthai settings</h2><button onClick={() => setSettingsOpen(false)}>×</button></div><div className="setting"><div><strong>Appearance</strong><small>Choose the interface theme.</small></div><div className="setting-actions"><button className="theme-toggle" onClick={() => setDark(true)}>Dark</button><button className="theme-toggle" onClick={() => setDark(false)}>Light</button></div></div><div className="setting"><div><strong>AI model</strong><small>{selectedModel.id ? `${selectedModel.name} · ${selectedModel.hint}` : 'No server model configured'}</small></div><button className="theme-toggle" onClick={() => {setSettingsOpen(false);setModelOpen(true);}}>Change</button></div><div className="setting"><div><strong>Agent mode</strong><small>Multi-step tool calling for calculator and configured research.</small></div><button className="theme-toggle" onClick={() => setAgentMode(v => !v)}>{agentMode ? 'On' : 'Off'}</button></div><div className="setting"><div><strong>Local privacy</strong><small>Browser conversation history is stored locally.</small></div><button className="theme-toggle" onClick={() => {localStorage.removeItem('dosthai-conversations');setConversations([]);notify('Local conversation history cleared.');}}>Clear</button></div><div className="settings-footer">Dosthai AI · local-first workspace · optional integrations activate only when configured on the server.</div></div></div>}
  </main>;
}
