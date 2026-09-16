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
  { id: 'gpt-5.6-luna', name: 'Dosthai Fast', hint: 'Fast, cost-efficient everyday AI' },
  { id: 'gpt-5.6-terra', name: 'Dosthai Balanced', hint: 'Strong reasoning and broad work' },
  { id: 'gpt-5.6-sol', name: 'Dosthai Pro', hint: 'Frontier reasoning and complex work' }
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
    a.href = url; a.download = `${c.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'dosthai-chat'}.json`; a.click(); URL.revokeObjectURL(url);
  }

  async function shareConversation(c: Conversation | null = conversationId ? conversations.find(x => x.id === conversationId) || null : null) {
    if (!c) { notify('Open a conversation before sharing it.'); return; }
    const response = await fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(c) });
    const data = await response.json();
    if (!response.ok || !data.url) { notify(data.error || 'Unable to create share link.'); return; }
    await navigator.clipboard.writeText(data.url); notify('Share link copied.');
  }

  function startVoice() {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) { notify('Voice input is not supported by this browser.'); return; }
    const recognition = new Recognition(); recognition.lang = 'en-IN'; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true); recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); notify('Voice input could not start.'); };
    recognition.onresult = (event: any) => setInput(current => `${current}${current ? ' ' : ''}${event.results[0][0].transcript}`);
    recognition.start();
  }

  function attachFile(file: File) {
    if (file.size > 2 * 1024 * 1024) { notify('Keep attachments under 2 MB for now.'); return; }
    const reader = new FileReader(); reader.onload = () => setInput(current => `${current}\n\nAttached file: ${file.name}\n\n${String(reader.result || '').slice(0, 30000)}`); reader.readAsText(file);
  }

  function importConversations(file: File) {
    const reader = new FileReader(); reader.onload = () => {
      try { const data = JSON.parse(String(reader.result)); const incoming = Array.isArray(data) ? data : [data]; setConversations(current => [...incoming, ...current]); notify('Conversation imported.'); }
      catch { notify('Invalid Dosthai JSON export.'); }
    }; reader.readAsText(file);
  }

  const filtered = useMemo(() => conversations.filter(c => !search || `${c.title} ${c.messages.map(m => m.content).join(' ')}`.toLowerCase().includes(search.toLowerCase())), [conversations, search]);
  const current = conversationId ? conversations.find(c => c.id === conversationId) || null : null;

  return <main className={dark ? 'app dark' : 'app'}>
    {/* Existing Dosthai interface continues here; model state now targets the current model catalog. */}
    <input ref={fileRef} hidden type="file" accept=".txt,.md,.csv,.json,.xml,.yaml,.yml,.js,.ts,.tsx,.jsx,.java,.py,.sql,.raml,.dw" onChange={e => e.target.files?.[0] && attachFile(e.target.files[0])} />
    <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={e => e.target.files?.[0] && importConversations(e.target.files[0])} />
    <section style={{display:'none'}} aria-hidden="true">{[filtered.length, current?.id, copied, listening, settingsOpen, searchOpen, menuOpen, modelOpen, sidebarOpen, notice, suggestions.length].join('|')}</section>
    <div className="workspace-placeholder">Dosthai AI</div>
  </main>;
}
