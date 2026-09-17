'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Source = { title?: string; url: string; snippet?: string };
type Message = { role: 'user' | 'assistant'; content: string; createdAt?: number; sources?: Source[]; feedback?: 'up' | 'down' | null; image?: string };
type Conversation = { id: string; title: string; messages: Message[]; updatedAt: number; pinned?: boolean; archived?: boolean };
type Model = { id: string; name: string; hint: string };

const suggestions = [
  ['💡', 'Explain a complex topic', 'Explain quantum computing simply'],
  ['💻', 'Help with code', 'Review this code and find bugs'],
  ['✍️', 'Write something', 'Write a professional email'],
  ['🧠', 'Think through a problem', 'Help me make a project plan'],
  ['🔎', 'Research a topic', 'Compare PostgreSQL and MongoDB for a new app'],
  ['📋', 'Analyze data', 'Create a practical analysis plan for this dataset'],
  ['🎨', 'Create an image', '/image A cinematic futuristic city at sunset']
];
const fallbackModels: Model[] = [{ id: 'dosthai-local', name: 'Dosthai Local', hint: 'Browser-local WebGPU AI — no API key required' }];
function makeId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function titleFor(text: string) { return text.trim().replace(/\s+/g, ' ').replace(/^\/image\s+/i, '').slice(0, 42) || 'New conversation'; }

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
  useEffect(() => { try { localStorage.setItem('dosthai-conversations', JSON.stringify(conversations)); } catch { notify('Local storage is full. Large generated images are kept for the current session only.'); } }, [conversations]);
  useEffect(() => { if (selectedModel.id) localStorage.setItem('dosthai-model', selectedModel.id); }, [selectedModel]);
  useEffect(() => { localStorage.setItem('dosthai-theme', dark ? 'dark' : 'light'); }, [dark]);
  useEffect(() => () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: busy ? 'auto' : 'smooth' }); }, [messages, busy]);
  useEffect(() => { if (!busy) requestAnimationFrame(() => composerRef.current?.focus()); }, [busy]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); newChat(); }
      if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); setSearchOpen(true); requestAnimationFrame(() => document.querySelector<HTMLInputElement>('.search-box input')?.focus()); }
      if (e.key === 'Escape') { setMenuOpen(false); setModelOpen(false); setSettingsOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2600); };
  function persistableMessages(next: Message[]): Message[] { return next.map(m => m.image?.startsWith('data:') ? { ...m, image: undefined } : m); }
  function saveCurrent(next: Message[], id = conversationId) { if (!id || !next.length) return; const saved = persistableMessages(next); setConversations(items => items.map(c => c.id === id ? { ...c, title: c.title === 'New conversation' ? titleFor(next[0].content) : c.title, messages: saved, updatedAt: Date.now() } : c)); }
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
  async function generateImage(prompt: string) {
    const clean = prompt.replace(/^\/image\s*/i, '').trim();
    if (!clean) { notify('Use /image followed by a description.'); return; }
    const id = conversationId || makeId();
    if (!conversationId) { setConversationId(id); setConversations(items => [{ id, title: titleFor(clean), messages: [], updatedAt: Date.now() }, ...items]); }
    const base = [...messages, { role: 'user' as const, content: `/image ${clean}`, createdAt: Date.now() }];
    setInput(''); setMessages([...base, { role: 'assistant', content: 'Creating your image…', createdAt: Date.now() }]); setBusy(true); setStatus('Creating image…');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await fetch('/api/image', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: clean }), signal: controller.signal });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.image) throw new Error(data?.error || 'Image generation failed.');
      const final = base.concat({ role: 'assistant', content: 'Generated image', image: data.image, createdAt: Date.now() });
      setMessages(final); scheduleSave(final, id, true);
    } catch (e) {
      const content = e instanceof DOMException && e.name === 'AbortError' ? 'Image generation stopped.' : `I couldn't create the image. ${e instanceof Error ? e.message : 'Request failed'}`;
      const next = base.concat({ role: 'assistant', content, createdAt: Date.now() }); setMessages(next); scheduleSave(next, id, true);
    } finally { abortRef.current = null; setBusy(false); setStatus(''); }
  }
  async function send(value = input, historyOverride?: Message[]) {
    const text = value.trim(); if (!text || busy) return;
    if (/^\/image\b/i.test(text)) { if (!capabilities.imageGeneration) return notify('Image generation is not configured on this server.'); await generateImage(text); return; }
    if (!selectedModel.id) { notify('Browser-local AI is ready in supported WebGPU browsers. A cloud provider is optional.'); return; }
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
  async function copyMessage(i: number, text: string) { try { await navigator.clipboard.writeText(text); setCopied(i); window.setTimeout(() => setCopied(null), 1500); } catch { notify('Copy failed.'); } }
  async function handleFile(file: File) { if (!file) return; if (file.size > 5 * 1024 * 1024) return notify('Files are limited to 5 MB.'); const text = await file.text(); setInput(v => `${v}${v ? '\n\n' : ''}[File: ${file.name}]\n${text.slice(0, 20000)}`); }
  function startVoice() { const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition; if (!SpeechRecognition) return notify('Voice input is not supported by this browser.'); const recognition = new SpeechRecognition(); recognition.lang = 'en-IN'; recognition.continuous = false; recognition.interimResults = false; setListening(true); recognition.onresult = (e: any) => setInput(v => `${v}${v ? ' ' : ''}${e.results?.[0]?.[0]?.transcript || ''}`); recognition.onerror = () => setListening(false); recognition.onend = () => setListening(false); recognition.start(); }
  function exportChats() { const blob = new Blob([JSON.stringify(conversations, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'dosthai-conversations.json'; a.click(); URL.revokeObjectURL(url); }
  function importChats(file: File) { const reader = new FileReader(); reader.onload = () => { try { const data = JSON.parse(String(reader.result)); if (!Array.isArray(data)) throw new Error(); setConversations(data.filter((c: any) => c?.id && Array.isArray(c.messages))); notify('Conversations imported.'); } catch { notify('Invalid conversation export.'); } }; reader.readAsText(file); }
  const visibleChats = useMemo(() => conversations.filter(c => !c.archived && (!search || `${c.title} ${c.messages.map(m => m.content).join(' ')}`.toLowerCase().includes(search.toLowerCase()))).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt), [conversations, search]);
  return (
    <main className={dark ? 'app dark' : 'app'}>
      <header className="topbar"><button className="icon-btn" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}>☰</button><button className="brand" onClick={newChat}>Dosthai</button><div className="top-actions"><button className="model-btn" onClick={() => setModelOpen(v => !v)}>{selectedModel.name}⌄</button><button className="icon-btn" aria-label="New chat" onClick={newChat}>＋</button><button className="icon-btn" aria-label="Menu" onClick={() => setMenuOpen(v => !v)}>⋯</button></div></header>
      {modelOpen && <div className="model-popover">{models.map(m => <button key={m.id} className={m.id === selectedModel.id ? 'model-item active' : 'model-item'} onClick={() => { setSelectedModel(m); setModelOpen(false); notify(m.hint); }}><strong>{m.name}</strong><span>{m.hint}</span></button>)}</div>}
      {menuOpen && <div className="menu-popover"><button onClick={() => { setSearchOpen(true); setMenuOpen(false); }}>Search chats</button><button onClick={exportChats}>Export chats</button><button onClick={() => importRef.current?.click()}>Import chats</button><button onClick={() => setDark(v => !v)}>{dark ? 'Light theme' : 'Dark theme'}</button><button onClick={() => { setSettingsOpen(true); setMenuOpen(false); }}>Settings</button></div>}
      <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}><div className="side-head"><strong>Chats</strong><button className="icon-btn" onClick={() => setSidebarOpen(false)}>×</button></div><button className="new-chat" onClick={newChat}>＋ New chat</button>{visibleChats.map(c => <div className={c.id === conversationId ? 'chat-row active' : 'chat-row'} key={c.id}><button onClick={() => openChat(c)}>{c.pinned ? '📌 ' : ''}{c.title}</button><span><button onClick={() => renameChat(c.id)}>✎</button><button onClick={() => togglePin(c.id)}>📌</button><button onClick={() => toggleArchive(c.id)}>▢</button><button onClick={() => deleteChat(c.id)}>×</button></span></div>)}</aside>
      {searchOpen && <div className="search-box"><input autoFocus placeholder="Search conversations" value={search} onChange={e => setSearch(e.target.value)} /><button onClick={() => { setSearch(''); setSearchOpen(false); }}>×</button></div>}
      <section className="chat-shell"><div className="messages">{messages.length === 0 ? <div className="welcome"><div className="logo-mark">✦</div><h1>How can I help?</h1><p>Chat with Dosthai using browser-local AI. No OpenAI key is required.</p><div className="suggestions">{suggestions.map(([icon, label, prompt]) => <button key={prompt} onClick={() => send(prompt)}><span>{icon}</span><b>{label}</b><small>{prompt}</small></button>)}</div></div> : messages.map((m, i) => <article key={`${m.createdAt}-${i}`} className={`message ${m.role}`}>{m.role === 'assistant' && <div className="avatar">✦</div>}<div className="bubble">{m.image ? <img src={m.image} alt="Generated" /> : <div className="content">{renderContent(m.content)}</div>}{m.sources?.length ? <div className="sources">{m.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>)}</div> : null}{m.role === 'assistant' && <div className="message-actions"><button onClick={() => copyMessage(i, m.content)}>{copied === i ? 'Copied' : 'Copy'}</button><button onClick={() => regenerate(i)}>Regenerate</button></div>}{m.role === 'user' && <div className="message-actions"><button onClick={() => editMessage(i)}>Edit</button></div>}</div></article>)}<div ref={endRef} /></div>
        <div className="composer-wrap"><div className="composer-tools"><button onClick={() => fileRef.current?.click()}>＋</button><button onClick={startVoice}>{listening ? '●' : '🎙'}</button><button className={agentMode ? 'tool-active' : ''} onClick={() => setAgentMode(v => !v)}>Agent</button></div><textarea ref={composerRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message Dosthai…" rows={1} /><button className="send-btn" disabled={busy || !input.trim()} onClick={() => busy ? stop() : send()}>{busy ? '■' : '↑'}</button><div className="composer-meta">{status || `${selectedModel.name} • ${agentMode ? 'agent mode' : 'chat mode'}`}</div></div>
      </section>
      <input ref={fileRef} hidden type="file" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }} /><input ref={importRef} hidden type="file" accept="application/json" onChange={e => { const f = e.target.files?.[0]; if (f) importChats(f); e.currentTarget.value = ''; }} />
      {settingsOpen && <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}><button className="close" onClick={() => setSettingsOpen(false)}>×</button><h2>Dosthai settings</h2><p><strong>Local AI:</strong> Browser WebGPU inference is available without an API key.</p><p><strong>Cloud AI:</strong> Optional; configure a provider only if you need larger hosted models or additional server-side capabilities.</p><p><strong>Storage:</strong> Conversations are stored locally in this browser.</p><p><strong>Privacy:</strong> Local conversations stay in this browser unless you use a configured server capability that sends data externally.</p></div></div>}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}
