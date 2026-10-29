"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, Lightbulb, MessagesSquare, Plus, Sparkles, Trash, Wand2 } from "lucide-react";
import type { Job } from "@resume/shared/schema/job";
import type { Story, StoryInput } from "@resume/shared/schema/story";
import type { PrepQuestion, QuestionKind } from "@resume/shared/interview";
import { COMPETENCIES } from "@resume/shared/interview";
import type { ResumeSummary } from "@resume/shared/types/api";
import { api, ApiError } from "@/lib/api-client";
import { Badge, Modal, Notice, Spinner } from "../ui";

interface Candidate {
  text: string;
  where: string;
  current: boolean;
  tags: string[];
}
interface Prep {
  job: { id: string; title: string; company: string } | null;
  questions: PrepQuestion[];
  candidates: Candidate[];
}

const KINDS: { id: QuestionKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "technical", label: "Technical" },
  { id: "gap", label: "Gaps to address" },
  { id: "resume", label: "About your resume" },
  { id: "behavioural", label: "Behavioural" },
  { id: "motivation", label: "Motivation" },
];
const KIND_TONE: Record<QuestionKind, "blue" | "amber" | "violet" | "green" | "slate"> = {
  technical: "blue",
  gap: "amber",
  resume: "violet",
  behavioural: "green",
  motivation: "slate",
};

const PRACTISED_KEY = "rb:practised";
function loadPractised(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PRACTISED_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function InterviewPrep({ resumes, jobs, aiAvailable }: { resumes: ResumeSummary[]; jobs: Job[]; aiAvailable: boolean }) {
  const [resumeId, setResumeId] = useState(resumes[0]?.id ?? "");
  const [jobId, setJobId] = useState(resumes[0]?.jobId ?? "");
  const [prep, setPrep] = useState<Prep | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [kind, setKind] = useState<QuestionKind | "all">("all");
  const [openQ, setOpenQ] = useState<string | null>(null);
  const [practised, setPractised] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<(StoryInput & { id?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setPractised(loadPractised()), []);
  useEffect(() => {
    api<{ stories: Story[] }>("/api/stories").then((r) => setStories(r.stories)).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    try {
      setPrep(await api<Prep>(`/api/interview/prep?resumeId=${encodeURIComponent(resumeId)}${jobId ? `&jobId=${encodeURIComponent(jobId)}` : ""}`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't build your prep.");
    } finally {
      setLoading(false);
    }
  }, [resumeId, jobId]);
  useEffect(() => {
    load();
  }, [load]);

  const togglePractised = (q: PrepQuestion) => {
    const key = `${resumeId}:${q.question}`;
    setPractised((p) => {
      const n = new Set(p);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      try {
        localStorage.setItem(PRACTISED_KEY, JSON.stringify([...n].slice(-500)));
      } catch {
        /* private mode */
      }
      return n;
    });
  };

  const shown = prep?.questions.filter((q) => kind === "all" || q.kind === kind) ?? [];
  const done = prep?.questions.filter((q) => practised.has(`${resumeId}:${q.question}`)).length ?? 0;
  const storiesFor = (q: PrepQuestion) => stories.filter((s) => q.tags.some((t) => s.tags.includes(t)));
  const covered = useMemo(() => new Set(stories.flatMap((s) => s.tags)), [stories]);

  async function draftFrom(c: Candidate, useAi = false) {
    setError(null);
    try {
      const r = await api<{ story: StoryInput; notice?: string; warnings: string[] }>("/api/interview/star", { body: { bullet: c.text, where: c.where, useAi } });
      setEditing({ ...r.story, resumeId });
      if (r.notice) setError(r.notice);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't draft the story.");
    }
  }

  if (!resumes.length)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <MessagesSquare className="mx-auto h-10 w-10 text-brand-500" aria-hidden />
        <h1 className="mt-3 text-2xl font-extrabold">Interview prep</h1>
        <p className="mt-2 text-slate-600">Create a resume first. Questions and stories are built from what your resume says.</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold">Interview prep</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Likely questions built from your resume and the job posting, each with the reason it's likely. Turn your strongest bullets into STAR stories you can tell out loud.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs font-semibold text-slate-500">
            Resume
            <select className="field mt-1 min-w-48" value={resumeId} onChange={(e) => { setResumeId(e.target.value); setJobId(resumes.find((r) => r.id === e.target.value)?.jobId ?? ""); }}>
              {resumes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-500">
            Job
            <select className="field mt-1 min-w-48" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">No job (general prep)</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{[j.title || "Untitled", j.company].filter(Boolean).join(" · ")}</option>)}
            </select>
          </label>
        </div>
      </div>
      {error ? <div className="mt-4"><Notice tone="warn">{error}</Notice></div> : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="q-h" className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="q-h" className="text-lg font-bold">Questions to practise</h2>
            {prep ? <span className="text-xs font-semibold text-slate-500">{done} of {prep.questions.length} practised</span> : null}
          </div>
          {prep ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all" style={{ width: `${prep.questions.length ? (done / prep.questions.length) * 100 : 0}%` }} />
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter questions">
            {KINDS.map((k) => {
              const count = k.id === "all" ? prep?.questions.length ?? 0 : prep?.questions.filter((q) => q.kind === k.id).length ?? 0;
              if (k.id !== "all" && !count) return null;
              return (
                <button key={k.id} onClick={() => setKind(k.id)} aria-pressed={kind === k.id}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${kind === k.id ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>
                  {k.label} <span className="opacity-70">{count}</span>
                </button>
              );
            })}
          </div>
          {loading && !prep ? <div className="py-10"><Spinner /></div> : null}
          <ul className="mt-4 space-y-2">
            {shown.map((q) => {
              const key = `${resumeId}:${q.question}`;
              const isOpen = openQ === q.id;
              const ready = storiesFor(q);
              return (
                <li key={q.id} className={`rounded-xl border transition ${isOpen ? "border-brand-200 bg-brand-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-start gap-3 p-3">
                    <button
                      onClick={() => togglePractised(q)}
                      aria-pressed={practised.has(key)}
                      aria-label={practised.has(key) ? "Mark as not practised" : "Mark as practised"}
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${practised.has(key) ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 hover:border-brand-400"}`}
                    >
                      {practised.has(key) ? <Check className="h-3.5 w-3.5" /> : null}
                    </button>
                    <button className="min-w-0 flex-1 text-left" onClick={() => setOpenQ(isOpen ? null : q.id)} aria-expanded={isOpen}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Badge tone={KIND_TONE[q.kind]}>{KINDS.find((k) => k.id === q.kind)?.label}</Badge>
                        {ready.length ? <Badge tone="green"><BookOpen className="h-3 w-3" />Story ready</Badge> : null}
                      </span>
                      <span className={`mt-1 block text-sm font-semibold ${practised.has(key) ? "text-slate-500" : ""}`}>{q.question}</span>
                    </button>
                    <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                  </div>
                  {isOpen ? (
                    <div className="space-y-2 border-t border-slate-100 px-11 py-3 text-sm">
                      <p className="text-slate-600"><span className="font-semibold text-slate-800">Why it's likely: </span>{q.why}</p>
                      <p className="flex gap-1.5 text-slate-700"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden />{q.hint}</p>
                      {q.source ? <blockquote className="border-l-2 border-slate-200 pl-3 text-xs text-slate-500">{q.source}</blockquote> : null}
                      {ready.length ? (
                        <div>
                          <p className="text-xs font-semibold text-slate-500">Stories that fit</p>
                          <ul className="mt-1 flex flex-wrap gap-1.5">
                            {ready.map((s) => <li key={s.id}><button className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100" onClick={() => setEditing(s)}>{s.title || "Untitled story"}</button></li>)}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="bank-h" className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="bank-h" className="text-lg font-bold">Story bank</h2>
              <button className="btn-secondary h-8 text-xs" onClick={() => setEditing({ resumeId, sourceText: "", title: "", situation: "", task: "", action: "", result: "", tags: [] })}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> New
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">Aim for 5–8 stories that cover these themes. A story can answer several questions.</p>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Themes covered">
              {COMPETENCIES.map((c) => (
                <li key={c} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${covered.has(c) ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-400"}`}>
                  {covered.has(c) ? "✓ " : ""}{c}
                </li>
              ))}
            </ul>
            <ul className="mt-4 space-y-2">
              {stories.map((s) => (
                <li key={s.id}>
                  <button className="w-full rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-200 hover:shadow-sm" onClick={() => setEditing(s)}>
                    <span className="block text-sm font-semibold">{s.title || "Untitled story"}</span>
                    <span className="mt-1 line-clamp-2 block text-xs text-slate-500">{s.action || s.situation}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1">{s.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span>
                  </button>
                </li>
              ))}
              {!stories.length ? <li className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">No stories yet. Start from one of your bullets below.</li> : null}
            </ul>
          </section>

          {prep?.candidates.length ? (
            <section aria-labelledby="cand-h" className="card p-5">
              <h2 id="cand-h" className="text-lg font-bold">Bullets worth a story</h2>
              <p className="mt-1 text-xs text-slate-500">Your strongest bullets for this job. Drafting splits each into Action and Result in your own words; you add the Situation and Task.</p>
              <ul className="mt-3 space-y-2">
                {prep.candidates.map((c, i) => (
                  <li key={i} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="text-slate-800">{c.text}</p>
                    <p className="mt-1 text-xs text-slate-500">{c.where}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button className="btn-secondary h-8 text-xs" onClick={() => draftFrom(c)}><Wand2 className="h-3.5 w-3.5" aria-hidden /> Draft STAR</button>
                      {aiAvailable ? <button className="btn-ghost h-8 text-xs" onClick={() => draftFrom(c, true)}><Sparkles className="h-3.5 w-3.5" aria-hidden /> Draft with AI</button> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>

      {editing ? (
        <StoryEditor
          story={editing}
          onClose={() => setEditing(null)}
          onSaved={(s) => {
            setStories((xs) => [s, ...xs.filter((x) => x.id !== s.id)]);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setStories((xs) => xs.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

const STAR_PARTS = [
  { key: "situation", label: "Situation", hint: "Where were you, and what was going on? One or two sentences of context." },
  { key: "task", label: "Task", hint: "What were you responsible for, or what needed to change?" },
  { key: "action", label: "Action", hint: "What did you do? Say “I”, not “we”, so your part is clear." },
  { key: "result", label: "Result", hint: "What changed because of it? Use real numbers only if you know them." },
] as const;

function StoryEditor({ story, onClose, onSaved, onDeleted }: { story: StoryInput & { id?: string }; onClose: () => void; onSaved: (s: Story) => void; onDeleted: (id: string) => void }) {
  const [s, setS] = useState(story);
  const [tagText, setTagText] = useState(story.tags.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const words = [s.situation, s.task, s.action, s.result].join(" ").split(/\s+/).filter(Boolean).length;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body = { ...s, tags: tagText.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12) };
      const { story: saved } = await api<{ story: Story }>(s.id ? `/api/stories/${s.id}` : "/api/stories", { method: s.id ? "PUT" : "POST", body });
      onSaved(saved);
    } catch (e) {
      setError(e instanceof ApiError ? [e.message, ...(e.issues ?? [])].join(" ") : "Couldn't save the story.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={s.id ? "Edit story" : "New STAR story"} wide>
      <div className="space-y-3 text-sm">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {s.sourceText ? <blockquote className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="font-semibold">From your resume: </span>{s.sourceText}</blockquote> : null}
        <div>
          <label className="label" htmlFor="st-title">Title</label>
          <input id="st-title" className="field" value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} placeholder="e.g. Payments migration to Kubernetes" />
        </div>
        {STAR_PARTS.map((p) => (
          <div key={p.key}>
            <label className="label" htmlFor={`st-${p.key}`}><span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-md bg-brand-600 text-[11px] font-bold text-white">{p.label[0]}</span>{p.label}</label>
            <textarea id={`st-${p.key}`} className="field" rows={p.key === "action" ? 4 : 2} value={s[p.key]} placeholder={p.hint} onChange={(e) => setS({ ...s, [p.key]: e.target.value })} />
          </div>
        ))}
        <div>
          <label className="label" htmlFor="st-tags">Themes (comma-separated)</label>
          <input id="st-tags" className="field" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder={COMPETENCIES.slice(0, 4).join(", ")} />
          <p className="mt-1 text-xs text-slate-500">Themes link this story to behavioural questions: {COMPETENCIES.join(", ")}.</p>
        </div>
        <p className="text-xs text-slate-500">{words} words · about {Math.max(1, Math.round(words / 140))} min spoken. Aim for 1–2 minutes.</p>
        <div className="flex flex-wrap justify-between gap-2">
          {s.id ? (
            <button className="btn-danger" onClick={async () => { if (confirm("Delete this story?")) { await api(`/api/stories/${s.id}`, { method: "DELETE" }); onDeleted(s.id!); } }}>
              <Trash className="h-4 w-4" aria-hidden /> Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save story"}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
