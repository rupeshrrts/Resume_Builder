"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Briefcase, CheckCircle2, Circle, CloudUpload, Copy, FileText, Layers, Pencil, Plus, Send, Sparkles, Target, Trash } from "lucide-react";
import type { ResumeScore, ResumeSummary } from "@resume/shared/types/api";
import type { Job, JobStatus } from "@resume/shared/schema/job";
import { PRESETS, TEMPLATES } from "@resume/shared/render/templates";


import { api, ApiError } from "@/lib/api-client";
import { UPLOAD_AND_AI_ANALYSIS } from "@/lib/features";
import { Badge, Modal, Notice, ScoreRing } from "./ui";
import { JobForm } from "./JobForm";
import { ReviewCard } from "./ReviewCard";

const STATUSES: { id: JobStatus; label: string; tone: string }[] = [
  { id: "saved", label: "Saved", tone: "bg-slate-100 text-slate-700" },
  { id: "applied", label: "Applied", tone: "bg-brand-50 text-brand-700" },
  { id: "interviewing", label: "Interviewing", tone: "bg-violet-50 text-violet-700" },
  { id: "offer", label: "Offer", tone: "bg-emerald-50 text-emerald-700" },
  { id: "rejected", label: "Rejected", tone: "bg-red-50 text-red-700" },
  { id: "withdrawn", label: "Withdrawn", tone: "bg-slate-100 text-slate-500" },
];

function when(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} h ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function Dashboard({
  email,
  fullName,
  resumes: initial,
  jobs: initialJobs,
  scores,
}: {
  email: string;
  fullName: string;
  resumes: ResumeSummary[];
  jobs: Job[];
  scores: Record<string, ResumeScore>;
}) {
  const router = useRouter();
  const [resumes, setResumes] = useState(initial);
  const [jobs, setJobs] = useState(initialJobs);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("My resume");
  const [preset, setPreset] = useState("experienced");
  const [renaming, setRenaming] = useState<ResumeSummary | null>(null);
  const [deleting, setDeleting] = useState<ResumeSummary | null>(null);
  const [addingJob, setAddingJob] = useState(false);
  const [filter, setFilter] = useState<JobStatus | "all">("all");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  // Re-fetch from the server page so new copies get scores too.
  const reload = async () => {
    setResumes((await api<{ resumes: ResumeSummary[] }>("/api/resumes")).resumes);
    router.refresh();
  };

  const masters = resumes.filter((r) => r.kind === "master");
  const tailored = resumes.filter((r) => r.kind === "tailored");
  const orphans = tailored.filter((r) => !resumes.some((m) => m.id === r.parentId));
  const jobName = (id: string | null) => {
    const j = jobs.find((x) => x.id === id);
    return j ? [j.title, j.company].filter(Boolean).join(" · ") : null;
  };
  const active = jobs.filter((j) => j.status === "applied" || j.status === "interviewing").length;
  const shownJobs = filter === "all" ? jobs : jobs.filter((j) => j.status === filter);
  const firstName = (fullName.trim() || Object.values(scores).find((s) => s.name)?.name || "").split(" ")[0];
  const empty = resumes.length === 0 && jobs.length === 0;
  const first = masters[0] ?? resumes[0];
  const firstHref = first ? `/resumes/${first.id}` : "/wizard";
  const steps = [
    { label: "Create your resume", hint: UPLOAD_AND_AI_ANALYSIS ? "Use the guide, or import your old PDF or Word file." : "Answer simple questions in the step-by-step guide.", href: "/wizard", done: resumes.length > 0 },
    { label: "Reach an ATS score of 75+", hint: "The editor's checks show exactly what to fix.", href: firstHref, done: Object.values(scores).some((s) => s.ats >= 75) },
    { label: "Save a job you want", hint: "Paste its description to see how well you match.", href: "/applications", done: jobs.length > 0 },
    { label: "Tailor a copy for that job", hint: "Your master resume stays untouched.", href: firstHref, done: tailored.length > 0 },
    { label: "Track your application", hint: "Mark it applied on the board.", href: "/applications", done: jobs.some((j) => j.status !== "saved") },
  ];
  const doneCount = steps.filter((st) => st.done).length;

  const RowActions = ({ r }: { r: ResumeSummary }) => (
    <div className="flex shrink-0 items-center gap-0.5">
      <button className="btn-ghost h-8 w-8 p-0" title="Rename" aria-label={`Rename ${r.name}`} onClick={() => setRenaming(r)}><Pencil className="h-4 w-4" /></button>
      <button
        className="btn-ghost h-8 w-8 p-0"
        title="Duplicate"
        aria-label={`Duplicate ${r.name}`}
        disabled={busy}
        onClick={() => run(async () => { await api(`/api/resumes/${r.id}/duplicate`, { body: {} }); await reload(); })}
      >
        <Copy className="h-4 w-4" />
      </button>
      <button className="btn-ghost h-8 w-8 p-0 hover:bg-red-50 hover:text-red-700" title="Delete" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}><Trash className="h-4 w-4" /></button>
    </div>
  );

  const ResumeCard = ({ m }: { m: ResumeSummary }) => {
    const s = scores[m.id];
    const copies = tailored.filter((t) => t.parentId === m.id);
    return (
      <li className="card card-hover flex flex-col overflow-hidden">
        <div className="flex gap-4 p-5">
          <Link href={`/resumes/${m.id}`} className="group relative block h-28 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-2 shadow-sm" aria-label={`Open ${m.name}`}>
            {/* Miniature page sketch */}
            <span className="block h-1.5 w-10 rounded bg-slate-800" />
            <span className="mt-1 block h-1 w-12 rounded bg-slate-300" />
            {[0, 1, 2].map((i) => (
              <span key={i} className="mt-2 block">
                <span className="block h-1 w-8 rounded bg-brand-400" />
                <span className="mt-1 block h-0.5 w-14 rounded bg-slate-200" />
                <span className="mt-0.5 block h-0.5 w-12 rounded bg-slate-200" />
              </span>
            ))}
            <span className="absolute inset-0 flex items-center justify-center bg-brand-600/0 text-white opacity-0 transition group-hover:bg-brand-600/80 group-hover:opacity-100">
              <Pencil className="h-5 w-5" aria-hidden />
            </span>
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/resumes/${m.id}`} className="block truncate text-base font-bold text-slate-900 hover:text-brand-700">{m.name}</Link>
                <p className="truncate text-sm text-slate-500">{s?.headline || s?.name || "Untitled"}</p>
              </div>
              {s ? <ScoreRing score={s.overall} size={52} label={`${m.name} quality score`} /> : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge tone="blue">Master</Badge>
              {s ? <Badge>{TEMPLATES[s.template].label}</Badge> : null}
              {s ? <Badge tone={s.ats >= 75 ? "green" : "amber"}>ATS {s.ats}</Badge> : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">Edited {when(m.updatedAt)}</p>
          </div>
        </div>
        {copies.length ? (
          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Tailored copies</p>
            <ul className="space-y-1">
              {copies.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-sm shadow-[0_1px_2px_rgb(15_23_42/0.05)]">
                  <Link href={`/resumes/${t.id}`} className="flex min-w-0 items-center gap-2 hover:text-brand-700">
                    <Target className="h-3.5 w-3.5 shrink-0 text-violet-500" aria-hidden />
                    <span className="truncate">{jobName(t.jobId) ?? t.name}</span>
                  </Link>
                  <span className="flex items-center gap-1">
                    {scores[t.id]?.match != null ? <Badge tone={scores[t.id].match! >= 75 ? "green" : scores[t.id].match! >= 50 ? "amber" : "red"}>Match {scores[t.id].match}</Badge> : null}
                    <RowActions r={t} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-2.5">
          <RowActions r={m} />
          <div className="flex items-center gap-1.5">
            {/* A low score gets a direct route to the ranked fixes (and AI rewrites) in the Score tab. */}
            {s && s.overall < 80 ? (
              <Link href={`/resumes/${m.id}?tab=score`} className="btn-primary h-8 text-xs" title="See what's weak and how to fix it">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> Improve score
              </Link>
            ) : null}
            <Link href={`/resumes/${m.id}`} className="btn-secondary h-8 text-xs">Edit <ArrowRight className="h-3.5 w-3.5" aria-hidden /></Link>
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {error ? <div className="mb-4"><Notice tone="error">{error}</Notice></div> : null}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="animate-fade-up">
          <h1 className="text-3xl font-extrabold">{firstName ? `Hi, ${firstName}` : "Your workspace"}</h1>
          <p className="mt-1 text-sm text-slate-600">Signed in as {email}</p>
        </div>
        {/* With no resumes yet, the empty-state card below offers the same actions. */}
        {resumes.length ? <div className="flex flex-wrap gap-2">
          <Link href="/wizard" className="btn-primary" title="Answer a few simple questions, step by step"><Sparkles className="h-4 w-4" aria-hidden /> Create new resume</Link>
          {UPLOAD_AND_AI_ANALYSIS ? (
            <Link href="/import" className="btn-secondary" title="Upload a PDF or Word resume to edit it here"><CloudUpload className="h-4 w-4" aria-hidden /> Upload resume</Link>
          ) : (
            <span className="btn-secondary cursor-not-allowed opacity-60" aria-disabled="true" title="Coming soon"><CloudUpload className="h-4 w-4" aria-hidden /> Upload &amp; analyse with AI <Badge tone="violet">Soon</Badge></span>
          )}
          <button className="btn-secondary" title="Save a job description to check your match" onClick={() => setAddingJob(true)}><Briefcase className="h-4 w-4" aria-hidden /> Add a job</button>
        </div> : null}
      </div>

      {empty ? null : <dl className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: FileText, label: "Master resumes", value: masters.length, tone: "from-brand-500 to-brand-700" },
          { icon: Layers, label: "Tailored copies", value: tailored.length, tone: "from-violet-500 to-fuchsia-500" },
          { icon: Briefcase, label: "Jobs tracked", value: jobs.length, tone: "from-sky-500 to-cyan-500" },
          { icon: Send, label: "Active applications", value: active, tone: "from-emerald-500 to-teal-500" },
        ].map(({ icon: Icon, label, value, tone }, i) => (
          <div key={label} className="card flex animate-fade-up items-center gap-3 p-4" style={{ animationDelay: `${i * 60}ms` }}>
            <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md`}><Icon className="h-5 w-5" aria-hidden /></span>
            <div>
              <dd className="font-display text-2xl font-extrabold tabular-nums">{value}</dd>
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
            </div>
          </div>
        ))}
      </dl>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-8">
          <section aria-labelledby="resumes-h">
            <h2 id="resumes-h" className="mb-3 text-lg font-bold">Resumes</h2>
            {resumes.length === 0 ? (
              <div className="card px-5 py-8 sm:px-8">
                <h3 className="text-center text-lg font-bold">How do you want to start your resume?</h3>
                <p className="mx-auto mt-1 max-w-md text-center text-sm text-slate-600">Pick one. You can change everything later.</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    { href: "/wizard", icon: Sparkles, title: "Create step by step", text: "Answer simple questions. We turn them into a clean, ATS-friendly resume.", best: true, soon: false },
                    { href: "/import", icon: CloudUpload, title: "Upload & analyse with AI", text: "Have one already? Upload the PDF or Word file. AI checks it and shows what to fix.", best: false, soon: !UPLOAD_AND_AI_ANALYSIS },
                    { href: null, icon: Plus, title: "Start from blank", text: "For experienced users: fill in each section yourself in the editor.", best: false, soon: false },
                  ].map(({ href, icon: Icon, title, text, best, soon }) => {
                    const body = (
                      <>
                        <span className="flex items-center justify-between">
                          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${best ? "bg-gradient-to-br from-brand-500 to-violet-500 text-white" : "bg-slate-100 text-slate-600"}`}><Icon className="h-5 w-5" aria-hidden /></span>
                          {best ? <Badge tone="blue">Recommended</Badge> : soon ? <Badge tone="violet">Coming soon</Badge> : null}
                        </span>
                        <span className="mt-3 block font-semibold text-slate-900">{title}</span>
                        <span className="mt-1 block text-xs leading-relaxed text-slate-600">{text}</span>
                      </>
                    );
                    if (soon) return <div key={title} aria-disabled="true" className="block h-full cursor-not-allowed rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-left opacity-75">{body}</div>;
                    const cls = `block h-full rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${best ? "border-brand-300 bg-brand-50/50 ring-1 ring-brand-100" : "border-slate-200 bg-white hover:border-slate-300"}`;
                    return href ? (
                      <Link key={title} href={href} className={cls}>{body}</Link>
                    ) : (
                      <button key={title} type="button" className={cls} onClick={() => setCreating(true)}>{body}</button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <ul className="grid gap-4 xl:grid-cols-2">
                {masters.map((m) => <ResumeCard key={m.id} m={m} />)}
                {orphans.map((m) => <ResumeCard key={m.id} m={m} />)}
              </ul>
            )}
          </section>

          <section aria-labelledby="jobs-h" className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="jobs-h" className="text-lg font-bold">Applications</h2>
              <div className="flex gap-2">
                <Link className="btn-ghost h-8 text-xs" href="/applications">Open board</Link>
                <button className="btn-secondary h-8 text-xs" onClick={() => setAddingJob(true)}><Plus className="h-3.5 w-3.5" aria-hidden /> Add job</button>
              </div>
            </div>
            {jobs.length ? <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
              {[{ id: "all" as const, label: "All", tone: "" }, ...STATUSES].map((s) => {
                const count = s.id === "all" ? jobs.length : jobs.filter((j) => j.status === s.id).length;
                const on = filter === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setFilter(s.id)}
                    aria-pressed={on}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                  >
                    {s.label}
                    <span className={`rounded-full px-1.5 tabular-nums ${on ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>
                  </button>
                );
              })}
            </div> : null}
            {shownJobs.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                {jobs.length ? "No jobs with this status." : "Save job descriptions here to match them against your resume and track your applications."}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {shownJobs.map((j) => {
                  const linked = resumes.filter((r) => r.jobId === j.id);
                  const st = STATUSES.find((s) => s.id === j.status)!;
                  return (
                    <li key={j.id} className="flex flex-wrap items-center gap-3 py-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 font-display text-sm font-bold text-slate-600">
                        {(j.company || j.title || "?").slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{j.title || "Untitled role"}</p>
                        <p className="truncate text-xs text-slate-500">
                          {j.company || "Company not set"}
                          {linked.length ? <> · {linked.map((r, i) => <Link key={r.id} href={`/resumes/${r.id}`} className="text-brand-700 hover:underline">{i ? ", " : ""}{r.name}</Link>)}</> : null}
                        </p>
                      </div>
                      <label className="sr-only" htmlFor={`st-${j.id}`}>Status for {j.title}</label>
                      <select
                        id={`st-${j.id}`}
                        className={`rounded-full border-0 py-1 pl-3 pr-7 text-xs font-semibold ${st.tone} focus:ring-2 focus:ring-brand-200`}
                        value={j.status}
                        onChange={(e) =>
                          run(async () => {
                            const status = e.target.value as JobStatus;
                            const appliedAt = status === "applied" && !j.appliedAt ? new Date().toISOString().slice(0, 10) : j.appliedAt;
                            const { job } = await api<{ job: Job }>(`/api/jobs/${j.id}`, { method: "PUT", body: { status, appliedAt } });
                            setJobs((js) => js.map((x) => (x.id === job.id ? job : x)));
                          })
                        }
                      >
                        {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                      <label className="sr-only" htmlFor={`ap-${j.id}`}>Applied on</label>
                      <input
                        id={`ap-${j.id}`}
                        type="date"
                        className="field w-36 py-1 text-xs"
                        value={j.appliedAt}
                        title="Date applied"
                        onChange={(e) =>
                          run(async () => {
                            const { job } = await api<{ job: Job }>(`/api/jobs/${j.id}`, { method: "PUT", body: { appliedAt: e.target.value } });
                            setJobs((js) => js.map((x) => (x.id === job.id ? job : x)));
                          })
                        }
                      />
                      <button
                        className="btn-ghost h-8 w-8 p-0 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Delete job ${j.title}`}
                        title="Delete job"
                        onClick={() => confirm("Delete this job? Linked resumes are kept.") && run(async () => { await api(`/api/jobs/${j.id}`, { method: "DELETE" }); setJobs((js) => js.filter((x) => x.id !== j.id)); })}
                      >
                        <Trash className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4" aria-label="Your progress">
          <section className="card p-5 text-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">Your next steps</h2>
              <span className="text-xs font-semibold text-slate-500">{doneCount}/{steps.length} done</span>
            </div>
            <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
              <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
            </div>
            <ol className="space-y-1">
              {steps.map((st) => (
                <li key={st.label}>
                  <Link
                    href={st.href}
                    className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition ${st.done ? "text-slate-400" : "text-slate-800 hover:bg-slate-50"}`}
                  >
                    {st.done ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-label="Done" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                    )}
                    <span className={st.done ? "line-through" : ""}>
                      <span className="font-medium">{st.label}</span>
                      {!st.done ? <span className="block text-xs text-slate-500">{st.hint}</span> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
          {/* Asked once they've actually built something. */}
          {resumes.length ? <ReviewCard /> : null}
          <p className="px-1 text-xs leading-relaxed text-slate-500">
            Scores estimate how clearly your resume shows the skills a role needs, using documented rules. They aren&apos;t any employer&apos;s ATS score and don&apos;t guarantee interviews.
          </p>
        </aside>
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New master resume" wide>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const { resume } = await api<{ resume: { id: string } }>("/api/resumes", { body: { name: newName, presetId: preset } });
              router.push(`/resumes/${resume.id}`);
            });
          }}
        >
          <div>
            <label className="label" htmlFor="nr-name">Name</label>
            <input id="nr-name" className="field" value={newName} onChange={(e) => setNewName(e.target.value)} />
          </div>
          <fieldset>
            <legend className="label">Who is this resume for?</legend>
            <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 scroll-thin sm:grid-cols-3">
              {PRESETS.map((p) => (
                <label key={p.id} className={`cursor-pointer rounded-xl border p-3 text-sm transition ${preset === p.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="radio" name="preset" value={p.id} checked={preset === p.id} onChange={() => setPreset(p.id)} className="sr-only" />
                  <span className="block font-semibold">{p.label}</span>
                  <span className="block text-xs text-slate-500">{p.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
            <button className="btn-primary" disabled={busy}>Create resume</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!renaming} onClose={() => setRenaming(null)} title="Rename resume">
        {renaming ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get("name") ?? "");
              run(async () => {
                const cur = await api<{ resume: { revision: number } }>(`/api/resumes/${renaming.id}`);
                await api(`/api/resumes/${renaming.id}`, { method: "PUT", body: { name, baseRevision: cur.resume.revision } });
                setRenaming(null);
                await reload();
              });
            }}
          >
            <label className="label" htmlFor="rn">Name</label>
            <input id="rn" name="name" className="field" defaultValue={renaming.name} autoFocus />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRenaming(null)}>Cancel</button>
              <button className="btn-primary" disabled={busy}>Save</button>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete resume?">
        {deleting ? (
          <div className="space-y-4 text-sm">
            <p>
              <strong>{deleting.name}</strong> and its version history will be permanently deleted.
              {deleting.kind === "master" && resumes.some((r) => r.parentId === deleting.id) ? " Tailored copies made from it are kept." : ""}
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
              <button
                className="btn-danger"
                disabled={busy}
                onClick={() => run(async () => { await api(`/api/resumes/${deleting.id}`, { method: "DELETE" }); setDeleting(null); await reload(); })}
              >
                Delete permanently
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={addingJob} onClose={() => setAddingJob(false)} title="Add a job" wide>
        <JobForm
          onCancel={() => setAddingJob(false)}
          onSaved={(job) => {
            setJobs((js) => [job, ...js]);
            setAddingJob(false);
          }}
        />
      </Modal>
    </div>
  );
}
