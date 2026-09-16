'use client';

import { useMemo, useState } from 'react';

type Step = { id: string; label: string; detail: string; state: 'queued' | 'running' | 'done' };
type Source = { title?: string; url?: string; snippet?: string };

const modes = [
  { id: 'agent', icon: '✦', title: 'Agent', text: 'Plan, use tools, and complete multi-step work.' },
  { id: 'research', icon: '⌕', title: 'Research', text: 'Investigate with web sources and evidence.' },
  { id: 'code', icon: '⌘', title: 'Code', text: 'Reason about code and developer workflows.' },
  { id: 'create', icon: '✎', title: 'Create', text: 'Draft documents, plans, and deliverables.' }
];

export default function AgentWorkspace() {
  const [mode, setMode] = useState('agent');
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Source[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const modeInfo = useMemo(() => modes.find((item) => item.id === mode) ?? modes[0], [mode]);

  async function run() {
    const value = prompt.trim();
    if (!value || running) return;
    setRunning(true);
    setError('');
    setAnswer('');
    setSources([]);
    setSteps([
      { id: 'plan', label: 'Understand & plan', detail: 'Breaking the goal into safe, useful steps.', state: 'running' },
      { id: 'execute', label: 'Execute tools', detail: 'Using only configured tools that are available.', state: 'queued' },
      { id: 'review', label: 'Review & deliver', detail: 'Checking the result before returning it.', state: 'queued' }
    ]);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: value, history: [], model: 'gpt-5.6-terra' })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Agent request failed');
      setAnswer(data.answer || 'No answer was returned.');
      setSources(Array.isArray(data.sources) ? data.sources : []);
      setSteps((current) => current.map((step) => ({ ...step, state: 'done' })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Agent request failed');
      setSteps((current) => current.map((step) => ({ ...step, state: step.id === 'plan' ? 'done' : 'queued' })));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="agent-page">
      <header className="agent-header">
        <a className="agent-brand" href="/" aria-label="Back to Dosthai">D<span>✦</span> Dosthai</a>
        <div className="agent-title"><strong>Work</strong><small>Agent workspace</small></div>
        <a className="back-chat" href="/">← Chat</a>
      </header>

      <section className="agent-shell">
        <aside className="mode-rail">
          <div className="rail-label">Modes</div>
          {modes.map((item) => (
            <button key={item.id} className={mode === item.id ? 'mode active' : 'mode'} onClick={() => setMode(item.id)}>
              <span>{item.icon}</span><b>{item.title}</b><small>{item.text}</small>
            </button>
          ))}
          <div className="rail-card"><strong>Control stays with you</strong><p>Dosthai shows the work plan, tool results, and sources. Stop or change the task whenever you want.</p></div>
        </aside>

        <div className="agent-main">
          <div className="work-intro">
            <div className="eyebrow">DOSTHAI WORK</div>
            <h1>{modeInfo.title} mode</h1>
            <p>{modeInfo.text} Give Dosthai the outcome you want; it can plan first instead of treating every request as a single-turn answer.</p>
          </div>

          <div className="task-card">
            <div className="task-head"><span>Task</span><span className="status">{running ? '● Working' : 'Ready'}</span></div>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') run(); }} placeholder="Describe the outcome you want Dosthai to achieve…" />
            <div className="task-foot"><small>Ctrl/Cmd + Enter to run</small><button onClick={run} disabled={running || !prompt.trim()}>{running ? 'Working…' : 'Start task →'}</button></div>
          </div>

          {steps.length > 0 && <div className="steps-card"><div className="section-title">Execution plan</div>{steps.map((step) => <div className="step" key={step.id}><span className={`step-dot ${step.state}`}>{step.state === 'done' ? '✓' : step.state === 'running' ? '•' : '·'}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div><small>{step.state}</small></div>)}</div>}

          {error && <div className="error-card"><strong>Task could not run</strong><p>{error}</p><a href="/">Return to chat</a></div>}
          {answer && <article className="result-card"><div className="section-title">Result</div><div className="result">{answer}</div>{sources.length > 0 && <div className="sources"><div className="section-title">Sources</div>{sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url || '#'} target="_blank" rel="noreferrer"><strong>{source.title || source.url || `Source ${index + 1}`}</strong><small>{source.snippet || source.url}</small></a>)}</div>}</article>}
        </div>
      </section>

      <style jsx>{`
        .agent-page{min-height:100vh;background:#080a0f;color:#f4f5f7;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.agent-header{height:64px;border-bottom:1px solid #20242e;display:flex;align-items:center;padding:0 24px;gap:24px;background:#0b0e14ee;backdrop-filter:blur(16px);position:sticky;top:0;z-index:10}.agent-brand{font-size:18px;font-weight:850;color:#fff;text-decoration:none}.agent-brand span{color:#8d7cff}.agent-title{display:flex;flex-direction:column;gap:2px}.agent-title strong{font-size:13px}.agent-title small{color:#747d8d;font-size:10px}.back-chat{margin-left:auto;color:#aab1bf;text-decoration:none;font-size:12px;padding:8px 11px;border:1px solid #2a2f3a;border-radius:9px}.agent-shell{max-width:1220px;margin:0 auto;display:grid;grid-template-columns:280px 1fr;gap:34px;padding:38px 28px 70px}.mode-rail{display:flex;flex-direction:column;gap:7px}.rail-label,.eyebrow{color:#71798a;font-size:10px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.mode{border:1px solid transparent;background:transparent;color:#b9bfca;border-radius:12px;padding:12px;text-align:left;display:grid;grid-template-columns:28px 1fr;column-gap:8px;cursor:pointer}.mode>span{grid-row:span 2;font-size:17px}.mode b{font-size:12px}.mode small{font-size:10px;color:#6f7787;line-height:1.4;margin-top:2px}.mode:hover,.mode.active{background:#151922;border-color:#2c3240}.mode.active b{color:#fff}.rail-card{margin-top:14px;border:1px solid #252a35;border-radius:13px;background:#10141c;padding:14px}.rail-card strong{font-size:11px}.rail-card p{font-size:10px;color:#737c8c;line-height:1.6;margin:7px 0 0}.agent-main{max-width:820px}.work-intro{padding:16px 0 25px}.work-intro h1{font-size:38px;letter-spacing:-1.5px;margin:8px 0 9px}.work-intro p{color:#8c95a5;line-height:1.7;font-size:13px;max-width:680px}.task-card,.steps-card,.result-card,.error-card{border:1px solid #292f3a;background:#10141c;border-radius:16px;box-shadow:0 18px 55px #0004}.task-card{padding:15px}.task-head,.task-foot{display:flex;align-items:center;justify-content:space-between}.task-head{font-size:11px;color:#858e9e;padding:2px 3px 9px}.status{color:#7f88a0}.task-card textarea{width:100%;min-height:145px;resize:vertical;border:0;outline:0;background:#0b0e14;border:1px solid #252b36;border-radius:11px;color:#f4f5f7;padding:13px;font:13px/1.6 inherit}.task-foot{padding-top:9px}.task-foot small{color:#626b7b;font-size:10px}.task-foot button{border:0;border-radius:9px;background:#f1f2f4;color:#111;padding:9px 13px;font-size:11px;font-weight:750}.task-foot button:disabled{opacity:.4;cursor:not-allowed}.steps-card,.result-card,.error-card{margin-top:14px;padding:16px}.section-title{font-size:10px;color:#777f90;text-transform:uppercase;letter-spacing:.12em;font-weight:800;margin-bottom:11px}.step{display:grid;grid-template-columns:25px 1fr auto;gap:9px;align-items:start;padding:10px 0;border-top:1px solid #222733}.step-dot{width:22px;height:22px;border-radius:7px;display:grid;place-items:center;background:#191e28;color:#737c8c;font-size:11px}.step-dot.running{color:#b7adff;background:#282344}.step-dot.done{color:#9fe0b1;background:#193025}.step strong{font-size:11px}.step p{margin:3px 0 0;color:#747d8c;font-size:10px;line-height:1.5}.step>small{color:#626b7a;font-size:9px}.result{white-space:pre-wrap;line-height:1.75;font-size:13px;color:#dfe2e8}.sources{margin-top:20px;border-top:1px solid #242a35;padding-top:15px;display:grid;gap:7px}.sources a{display:flex;flex-direction:column;gap:3px;padding:9px;border:1px solid #252b36;border-radius:9px;text-decoration:none;color:#cfd4dc}.sources a:hover{background:#151922}.sources small{color:#717a8a;font-size:9px}.error-card{border-color:#4a2d34}.error-card strong{font-size:12px;color:#ffb2bc}.error-card p{font-size:11px;color:#a7828a}.error-card a{font-size:11px;color:#b8b0ff}.error-card{color:#fff}@media(max-width:800px){.agent-shell{grid-template-columns:1fr;padding:22px 15px 50px}.mode-rail{display:grid;grid-template-columns:1fr 1fr}.rail-label,.rail-card{grid-column:1/-1}.agent-main{max-width:none}.work-intro h1{font-size:31px}.agent-header{padding:0 15px}.agent-title{display:none}}
      `}</style>
    </main>
  );
}
