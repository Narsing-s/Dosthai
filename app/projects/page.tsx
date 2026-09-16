'use client';

import { useEffect, useMemo, useState } from 'react';

type Project = { id: string; name: string; instructions: string; createdAt: string };

const KEY = 'dosthai-projects';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    try { setProjects(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { setProjects([]); }
  }, []);

  const active = useMemo(() => projects.find((p) => p.id === selected) || projects[0], [projects, selected]);

  function save(next: Project[]) {
    setProjects(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  function createProject() {
    const value = name.trim();
    if (!value) return;
    const project = { id: crypto.randomUUID(), name: value, instructions: instructions.trim(), createdAt: new Date().toISOString() };
    save([project, ...projects]);
    setSelected(project.id);
    setName('');
    setInstructions('');
  }

  function removeProject(id: string) {
    save(projects.filter((p) => p.id !== id));
    if (selected === id) setSelected(null);
  }

  return <main className="projects"><header><a href="/">← Dosthai</a><div><strong>Projects</strong><small>Keep chats, instructions and context organized.</small></div></header><section className="layout"><aside><button className="create" onClick={() => document.getElementById('project-name')?.focus()}>＋ New project</button>{projects.length === 0 ? <p className="empty">Create a project for a long-running task.</p> : projects.map((p) => <button className={active?.id === p.id ? 'project active' : 'project'} key={p.id} onClick={() => setSelected(p.id)}><span>✦</span><div><b>{p.name}</b><small>{p.instructions || 'No instructions yet'}</small></div></button>)}</aside><article><div className="intro"><span>PROJECT WORKSPACE</span><h1>{active ? active.name : 'Create your first project'}</h1><p>{active ? 'Project-level instructions are saved locally in this version. Cloud synchronization is intentionally gated behind the production readiness checks.' : 'Projects give Dosthai a durable home for a body of work instead of forcing every chat to start from scratch.'}</p></div>{active ? <div className="card"><label>Project instructions</label><textarea value={active.instructions} onChange={(e) => { const next = projects.map((p) => p.id === active.id ? { ...p, instructions: e.target.value } : p); save(next); }} placeholder="Tell Dosthai how to work in this project…"/><div className="actions"><button onClick={() => removeProject(active.id)}>Delete project</button><a href="/">Open chat →</a></div></div> : <div className="card"><label id="project-name">Project name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MuleSoft Career"/><label>Instructions</label><textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="What should Dosthai know about this project?"/><button className="primary" onClick={createProject} disabled={!name.trim()}>Create project</button></div>}</article></section><style jsx>{`.projects{min-height:100vh;background:#090b10;color:#f4f5f7;font-family:Inter,system-ui,sans-serif}.projects header{height:64px;border-bottom:1px solid #20232d;display:flex;align-items:center;gap:24px;padding:0 24px;background:#0c0f15}.projects header a{color:#aeb5c3;text-decoration:none}.projects header div{display:flex;flex-direction:column}.projects header small{color:#737c8d;font-size:10px;margin-top:2px}.layout{max-width:1180px;margin:auto;display:grid;grid-template-columns:270px 1fr;gap:30px;padding:34px 24px}.layout aside{border-right:1px solid #20242d;padding-right:20px}.create,.project{width:100%;border:1px solid #292f3a;background:#11151d;color:#dce0e7;border-radius:11px;padding:11px;text-align:left}.create{margin-bottom:12px}.project{display:flex;gap:10px;margin:4px 0;border-color:transparent}.project.active,.project:hover{background:#171b24;border-color:#2a303c}.project span{color:#8e80ff}.project div{display:flex;flex-direction:column;min-width:0}.project b{font-size:12px}.project small{color:#717a8b;font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.empty{color:#666f80;font-size:11px;line-height:1.6}.intro span{font-size:10px;letter-spacing:.14em;color:#747d8e;font-weight:800}.intro h1{font-size:38px;letter-spacing:-1.5px;margin:9px 0}.intro p{max-width:700px;color:#8b94a4;line-height:1.7;font-size:13px}.card{margin-top:24px;background:#11151d;border:1px solid #292f3a;border-radius:16px;padding:18px;max-width:760px}.card label{display:block;color:#8f98a8;font-size:11px;margin:3px 0 7px}.card input,.card textarea{width:100%;box-sizing:border-box;background:#0b0e14;border:1px solid #292f3a;border-radius:10px;color:#f4f5f7;padding:12px;outline:none;margin-bottom:15px}.card textarea{min-height:150px;resize:vertical}.primary,.actions a{display:inline-block;background:#f0f1f3;color:#111;border:0;border-radius:9px;padding:9px 13px;text-decoration:none;font-size:11px;font-weight:700}.primary:disabled{opacity:.4}.actions{display:flex;justify-content:space-between;align-items:center}.actions button{background:transparent;border:0;color:#ff9b9b;font-size:11px}@media(max-width:760px){.layout{grid-template-columns:1fr;padding:20px 14px}.layout aside{border-right:0;border-bottom:1px solid #20242d;padding:0 0 15px}.intro h1{font-size:31px}}`}</style></main>;
}
