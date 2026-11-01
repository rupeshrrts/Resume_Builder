"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { newId, normalizeSectionOrder, type ResumeData, type ResumeSettings, type SectionKey } from "@resume/shared/schema/resume";
import type { Job } from "@resume/shared/schema/job";
import type { Issue } from "@resume/shared/analysis/ats";
import type { TextLocation } from "@resume/shared/analysis/text";
import { scoreResume } from "@resume/shared/analysis/quality";
import { api, ApiError } from "@/lib/api-client";
import { ArrowLeft, Check, Clock, Download, Eye, Gauge, Mail, Palette, Redo2, ScanSearch, Target, Undo2, type LucideIcon } from "lucide-react";
import { SECTION_LABELS } from "@resume/shared/schema/resume";
import { Badge, Notice, ScoreRing } from "../ui";
import { useHistory } from "./useHistory";
import { EditorContext, type EditorCtx } from "./context";
import { AdditionalForm, CertificationsForm, ContactForm, EducationForm, ExperienceForm, ProjectsForm, SkillsForm, SummaryForm, type Update } from "./Sections";
import { ScorePanel } from "./ScorePanel";
import { AtsPanel } from "./AtsPanel";
import { JobPanel } from "./JobPanel";
import { DesignPanel } from "./DesignPanel";
import { ExportPanel } from "./ExportPanel";
import { DownloadMenu, ReadyBanner } from "./DownloadMenu";
import { ExactPdfPreview } from "./ExactPdfPreview";
import { VersionsModal } from "./VersionsModal";
import { TailorReview } from "./TailorReview";
import { LettersPanel } from "./LettersPanel";

type Doc = { data: ResumeData; settings: ResumeSettings };
type Tab = "preview" | "score" | "ats" | "job" | "letters" | "design" | "export";
type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export interface EditorProps {
  resume: { id: string; name: string; kind: "master" | "tailored"; jobId: string | null; revision: number; data: ResumeData; settings: ResumeSettings; parentId: string | null };
  parentName: string | null;
  jobs: Job[];
  ai: { available: boolean; model: string | null };
}

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "preview", label: "Preview", icon: Eye },
  { id: "score", label: "Score", icon: Gauge },
  { id: "ats", label: "ATS", icon: ScanSearch },
  { id: "job", label: "Job match", icon: Target },
  { id: "letters", label: "Letters", icon: Mail },
  { id: "design", label: "Design", icon: Palette },
  { id: "export", label: "Export", icon: Download },
];

type SectionStatus = "done" | "partial" | "empty";

/** How complete each section is, for the section navigator. */
function sectionStatus(d: ResumeData, key: SectionKey | "contact"): SectionStatus {
  const filled = (b: { text: string }[]) => b.filter((x) => x.text.trim()).length;
  switch (key) {
    case "contact": {
      const n = [d.contact.fullName, d.contact.email, d.contact.phone].filter((x) => x.trim()).length;
      return n === 3 ? "done" : n || d.contact.location ? "partial" : "empty";
    }
    case "summary": {
      const w = d.summary.text.trim().split(/\s+/).filter(Boolean).length;
      return w >= 25 ? "done" : w ? "partial" : "empty";
    }
    case "experience":
      if (!d.experience.length) return "empty";
      return d.experience.every((e) => e.title && e.company && e.startDate && filled(e.bullets) >= 2) ? "done" : "partial";
    case "projects":
      if (!d.projects.length) return "empty";
      return d.projects.every((p) => p.name && filled(p.bullets) >= 1) ? "done" : "partial";
    case "skills": {
      const n = d.skills.reduce((a, g) => a + g.items.length, 0);
      return n >= 6 ? "done" : n ? "partial" : "empty";
    }
    case "education":
      if (!d.education.length) return "empty";
      return d.education.every((e) => e.degree && e.institution) ? "done" : "partial";
    case "certifications":
      return d.certifications.some((c) => c.name) ? "done" : "empty";
    case "additional":
      return d.additional.some((a) => a.title && filled(a.bullets)) ? "done" : "empty";
  }
}

export function Editor({ resume, parentName, jobs: initialJobs, ai }: EditorProps) {
  const router = useRouter();
  const hist = useHistory<Doc>({ data: resume.data, settings: resume.settings });
  const { data, settings } = hist.present;
  const [name, setName] = useState(resume.name);
  const [jobId, setJobId] = useState<string | null>(resume.jobId);
  const [jobs, setJobs] = useState(initialJobs);
  const [metaVersion, setMetaVersion] = useState(0);
  const [tab, setTab] = useState<Tab>(resume.jobId ? "job" : "preview");
  const [mobileView, setMobileView] = useState<"edit" | "panel">("edit");
  // Arriving from the guided builder's "Create my resume" (?created=1): offer the download straight away.
  const [justCreated, setJustCreated] = useState(false);
  useEffect(() => {
    const url = new URL(window.location.href);
    // ?tab=score (the dashboard's "Improve score") opens that panel, also on phones.
    const wanted = url.searchParams.get("tab") as Tab | null;
    if (wanted && TABS.some((t) => t.id === wanted)) {
      setTab(wanted);
      setMobileView("panel");
      url.searchParams.delete("tab");
    }
    if (url.searchParams.get("created") === "1") {
      setJustCreated(true);
      url.searchParams.delete("created");
    }
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);
  const [mode, setMode] = useState<"beginner" | "advanced">("beginner");
  const [assistTarget, setAssistTarget] = useState<string | null>(null);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [tailorOpen, setTailorOpen] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [spelling, setSpelling] = useState<Issue[]>([]);
  const [spellingPending, setSpellingPending] = useState(false);
  const [status, setStatus] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---- persistence ----
  const counter = hist.version + metaVersion;
  const revisionRef = useRef(resume.revision);
  const savedCounterRef = useRef(counter);
  const latest = useRef({ doc: hist.present, name, jobId, counter });
  latest.current = { doc: hist.present, name, jobId, counter };
  const inflight = useRef<Promise<number | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocked = status === "conflict";

  const saveNow = useCallback(async (): Promise<number | null> => {
    if (inflight.current) await inflight.current;
    const snap = latest.current;
    if (snap.counter === savedCounterRef.current) return revisionRef.current;
    setStatus("saving");
    const p = (async () => {
      try {
        const { resume: r } = await api<{ resume: { revision: number } }>(`/api/resumes/${resume.id}`, {
          method: "PUT",
          body: { baseRevision: revisionRef.current, name: snap.name, data: snap.doc.data, settings: snap.doc.settings, jobId: snap.jobId },
        });
        revisionRef.current = r.revision;
        savedCounterRef.current = snap.counter;
        setSaveError(null);
        setStatus(latest.current.counter === snap.counter ? "saved" : "dirty");
        return r.revision;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("Couldn't save.", 0);
        setStatus(err.status === 409 ? "conflict" : "error");
        setSaveError(err.issues?.length ? `${err.message} ${err.issues.join("; ")}` : err.message);
        return null;
      }
    })();
    inflight.current = p;
    const out = await p;
    inflight.current = null;
    return out;
  }, [resume.id]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (latest.current.counter === savedCounterRef.current) return revisionRef.current;
    const r = await saveNow();
    if (r !== null && latest.current.counter !== savedCounterRef.current) return saveNow();
    return r;
  }, [saveNow]);

  useEffect(() => {
    if (counter === savedCounterRef.current || blocked) return;
    setStatus((s) => (s === "saving" ? s : "dirty"));
    timer.current = setTimeout(() => void saveNow(), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [counter, saveNow, blocked]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (latest.current.counter !== savedCounterRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  useEffect(() => {
    try {
      const m = localStorage.getItem("rb-mode");
      if (m === "advanced" || m === "beginner") setMode(m);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // ---- editing ----
  const update: Update = useCallback(
    (fn, structural) =>
      hist.set(
        (prev) => {
          const data = structuredClone(prev.data);
          fn(data);
          return { ...prev, data };
        },
        { coalesce: !structural },
      ),
    [hist.set],
  );
  const updateSettings = useCallback(
    (fn: (s: ResumeSettings) => void, structural?: boolean) =>
      hist.set(
        (prev) => {
          const settings = structuredClone(prev.settings);
          fn(settings);
          return { ...prev, settings };
        },
        { coalesce: !structural },
      ),
    [hist.set],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        hist.undo();
      } else if (k === "y" || (k === "z" && e.shiftKey)) {
        e.preventDefault();
        hist.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hist.undo, hist.redo]);

  // ---- analysis (recomputed as you edit) ----
  const deferred = useDeferredValue(hist.present);
  const job = jobs.find((j) => j.id === jobId) ?? null;

  // Arriving from "Tailor a copy for this job": open the review straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tailor") === "1" && job) {
      setTab("job");
      setTailorOpen(true);
      params.delete("tailor");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const report = useMemo(
    () => scoreResume(deferred.data, deferred.settings, { jobDescription: job?.description ?? null, spelling }),
    [deferred, job?.description, spelling],
  );

  useEffect(() => {
    setSpellingPending(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ issues: Issue[] }>("/api/analyze/spelling", { body: { data: deferred.data, market: deferred.settings.market }, signal: ctrl.signal })
        .then((r) => setSpelling(r.issues))
        .catch(() => undefined)
        .finally(() => setSpellingPending(false));
    }, 2000);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [deferred.data, deferred.settings.market]);

  // ---- navigation from findings to the editor ----
  const goTo = useCallback((loc: TextLocation) => {
    setMobileView("edit");
    const id = loc.bulletId ? `b-${loc.bulletId}` : loc.entryId ? `e-${loc.entryId}` : `s-${loc.section}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-amber-400", "rounded-md");
      setTimeout(() => el.classList.remove("ring-2", "ring-amber-400"), 1800);
      (el.querySelector("textarea, input") as HTMLElement | null)?.focus({ preventScroll: true });
    });
  }, []);

  const dataRef = useRef(data);
  dataRef.current = data;
  const ctx: EditorCtx = useMemo(
    () => ({ ai, jobId, style: settings.writingStyle, mode, getData: () => dataRef.current, assistTarget, setAssistTarget }),
    [ai, jobId, settings.writingStyle, mode, assistTarget],
  );

  const sectionForms: Record<SectionKey, React.ReactNode> = {
    summary: <SummaryForm data={data} update={update} />,
    experience: <ExperienceForm data={data} update={update} />,
    projects: <ProjectsForm data={data} update={update} />,
    skills: <SkillsForm data={data} update={update} />,
    education: <EducationForm data={data} update={update} />,
    certifications: <CertificationsForm data={data} update={update} />,
    additional: <AdditionalForm data={data} update={update} />,
  };

  const statusText: Record<SaveState, string> = { saved: "Saved", dirty: "Unsaved", saving: "Saving…", error: "Save failed", conflict: "Changed elsewhere" };

  const optional = new Set<string>(["summary", "projects", "certifications", "additional"]);
  const navItems = [
    { key: "contact", label: "Contact", status: sectionStatus(data, "contact"), optional: false, hidden: false },
    ...normalizeSectionOrder(settings.sectionOrder).map((k) => ({
      key: k,
      label: SECTION_LABELS[k],
      status: sectionStatus(data, k),
      optional: optional.has(k),
      hidden: settings.hiddenSections.includes(k),
    })),
  ];
  const completeCount = navItems.filter((i) => i.status === "done").length;

  return (
    <EditorContext.Provider value={ctx}>
      <div className="sticky top-16 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-4 py-2">
          <Link href="/dashboard" className="btn-ghost h-9 w-9 p-0" aria-label="Back to dashboard"><ArrowLeft className="h-4 w-4" /></Link>
          <label className="sr-only" htmlFor="resume-name">Resume name</label>
          <input
            id="resume-name"
            className="min-w-0 max-w-xs flex-1 rounded-lg border border-transparent px-2 py-1 font-display text-base font-bold hover:border-slate-200 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setMetaVersion((v) => v + 1);
            }}
          />
          {resume.kind === "master" ? (
            <Badge tone="blue" title="Your full source resume. Tailored copies are made from it and never overwrite it.">Master</Badge>
          ) : (
            <Badge tone="violet" title="A copy for one application. Editing it does not change the master.">Tailored{parentName ? ` from ${parentName}` : ""}</Badge>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                status === "error" || status === "conflict" ? "bg-red-50 text-red-700" : status === "saved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
              }`}
              role="status"
              aria-live="polite"
            >
              {status === "saving" ? (
                <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-amber-300 border-t-amber-700" aria-hidden />
              ) : status === "saved" ? (
                <Check className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <span className="h-2 w-2 rounded-full bg-current" aria-hidden />
              )}
              {statusText[status]}
            </span>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-[0_1px_2px_rgb(15_23_42/0.05)]">
              <button className="btn-ghost h-7 w-8 p-0" onClick={hist.undo} disabled={!hist.canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
              <button className="btn-ghost h-7 w-8 p-0" onClick={hist.redo} disabled={!hist.canRedo} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
            </div>
            <DownloadMenu
              resumeId={resume.id}
              flush={flush}
              onMore={() => {
                setTab("export");
                setMobileView("panel");
              }}
            />
            <button className="btn-secondary h-9" onClick={() => setVersionsOpen(true)}><Clock className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Versions</span></button>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold" role="radiogroup" aria-label="Editing mode">
              {(["beginner", "advanced"] as const).map((m) => (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  className={`rounded-md px-2.5 py-1 transition ${mode === m ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                  onClick={() => {
                    setMode(m);
                    try {
                      localStorage.setItem("rb-mode", m);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {m === "beginner" ? "Guided" : "Advanced"}
                </button>
              ))}
            </div>
          </div>
        </div>
        {status === "error" || status === "conflict" ? (
          <div className="mx-auto max-w-[1500px] px-4 pb-2">
            <Notice tone="error">
              {saveError}{" "}
              {status === "conflict" ? (
                <button className="underline" onClick={() => window.location.reload()}>Reload latest</button>
              ) : (
                <button className="underline" onClick={() => void saveNow()}>Retry</button>
              )}
            </Notice>
          </div>
        ) : null}
        <div className="flex gap-1 border-t border-slate-100 p-1.5 lg:hidden" role="tablist" aria-label="Editor view">
          {(["edit", "panel"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={mobileView === v}
              className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${mobileView === v ? "bg-brand-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}
              onClick={() => setMobileView(v)}
            >
              {v === "edit" ? "Edit" : `Preview & checks · ${report.overall}`}
            </button>
          ))}
        </div>
      </div>

      {justCreated ? <ReadyBanner resumeId={resume.id} flush={flush} onClose={() => setJustCreated(false)} /> : null}

      {/* The preview/checks panel gets a little over half the width so the page is readable at a glance. */}
      <div className="mx-auto grid max-w-[1600px] grid-cols-[minmax(0,1fr)] gap-5 px-4 py-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:grid-cols-[190px_minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <nav className="sticky top-[132px] hidden self-start xl:block" aria-label="Resume sections">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <ScoreRing score={report.overall} size={52} label="Overall resume score" />
              <div className="text-xs leading-tight">
                <p className="font-bold text-slate-900">Resume score</p>
                <p className="text-slate-500">{completeCount} of {navItems.length} sections done</p>
              </div>
            </div>
            <ol className="mt-4 space-y-0.5">
              {navItems.map((it) => (
                <li key={it.key}>
                  <button
                    onClick={() => goTo({ section: it.key as TextLocation["section"], label: it.label })}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        it.status === "done" ? "bg-emerald-500 text-white" : it.status === "partial" ? "border-2 border-amber-400 bg-amber-50" : "border-2 border-slate-200 bg-white"
                      }`}
                      aria-hidden
                    >
                      {it.status === "done" ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : null}
                    </span>
                    <span className={`flex-1 truncate ${it.hidden ? "text-slate-400 line-through" : ""}`}>{it.label}</span>
                    <span className="sr-only">{it.status === "done" ? "complete" : it.status === "partial" ? "in progress" : it.optional ? "optional, empty" : "empty"}</span>
                    {it.optional && it.status === "empty" ? <span className="text-[10px] text-slate-400" aria-hidden>optional</span> : null}
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <div className={`min-w-0 space-y-5 ${mobileView === "edit" ? "" : "hidden lg:block"}`}>
          {mode === "beginner" ? (
            <Notice>
              Fill in each section with your real experience. Scores and suggestions update as you type. Text marked <Badge tone="violet">✦ AI-assisted</Badge> was rewritten
              with AI and accepted by you; <Badge>Imported</Badge> came from your uploaded file.
            </Notice>
          ) : null}
          <div className="card p-5">
            <ContactForm data={data} update={update} />
          </div>
          {normalizeSectionOrder(settings.sectionOrder).map((k) => (
            <div key={k} className={`card p-5 ${settings.hiddenSections.includes(k) ? "opacity-60" : ""}`}>
              {settings.hiddenSections.includes(k) ? <p className="mb-2 text-xs font-medium text-slate-500">Hidden from exports (Design → Section order)</p> : null}
              {sectionForms[k]}
            </div>
          ))}
        </div>

        <aside
          className={`min-w-0 ${mobileView === "panel" ? "" : "hidden lg:block"} scroll-thin lg:sticky lg:top-[132px] lg:max-h-[calc(100vh-144px)] lg:self-start lg:overflow-y-auto lg:rounded-2xl`}
          aria-label="Preview and checks"
        >
          <div className="card">
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 p-1.5 backdrop-blur" role="tablist">
              <div className="flex gap-0.5 overflow-x-auto scroll-thin">
                {TABS.map((t) => {
                  const Icon = t.icon;
                  const on = tab === t.id;
                  const badge = t.id === "score" ? report.overall : t.id === "ats" ? report.ats.score : t.id === "job" ? report.match?.score ?? null : null;
                  return (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={on}
                      aria-controls={`panel-${t.id}`}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition ${on ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                      onClick={() => setTab(t.id)}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {t.label}
                      {badge !== null ? (
                        <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${badge >= 75 ? "bg-emerald-100 text-emerald-700" : badge >= 50 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{badge}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div id={`panel-${tab}`} role="tabpanel" key={tab} className={`animate-fade-up ${tab === "preview" ? "p-2" : "p-5"}`}>
              {/* The real PDF only, exactly as it downloads. */}
              {tab === "preview" ? <ExactPdfPreview resumeId={resume.id} flush={flush} changeKey={deferred} /> : null}
              {tab === "score" ? (
                <ScorePanel
                  report={report}
                  onGo={goTo}
                  onImprove={(bulletId) => {
                    setAssistTarget(bulletId);
                    goTo({ section: "experience", bulletId, label: "" });
                  }}
                />
              ) : null}
              {tab === "ats" ? <AtsPanel ats={report.ats} data={deferred.data} settings={deferred.settings} onGo={goTo} spellingPending={spellingPending} /> : null}
              {tab === "job" ? (
                <JobPanel
                  kind={resume.kind}
                  jobs={jobs}
                  jobId={jobId}
                  match={report.match}
                  skills={data.skills}
                  onSelectJob={(id) => {
                    setJobId(id);
                    setMetaVersion((v) => v + 1);
                  }}
                  onJobsChange={setJobs}
                  onGo={goTo}
                  onAddSkill={(skill, groupId) =>
                    update((d) => {
                      let g = d.skills.find((x) => x.id === groupId) ?? d.skills[0];
                      if (!g) {
                        g = { id: newId("sk"), category: "Skills", items: [] };
                        d.skills.push(g);
                      }
                      if (!g.items.some((i) => i.toLowerCase() === skill.toLowerCase())) g.items.push(skill);
                    }, true)
                  }
                  onOpenTailor={() => setTailorOpen(true)}
                  onTailor={async (jid) => {
                    await flush();
                    try {
                      const { resume: copy } = await api<{ resume: { id: string } }>(`/api/resumes/${resume.id}/tailor`, { body: { jobId: jid } });
                      router.push(`/resumes/${copy.id}?tailor=1`);
                    } catch (e) {
                      setSaveError(e instanceof ApiError ? e.message : "Couldn't create the tailored copy.");
                      setStatus("error");
                    }
                  }}
                />
              ) : null}
              {tab === "letters" ? <LettersPanel resumeId={resume.id} jobs={jobs} jobId={jobId} aiAvailable={ai.available} flush={flush} /> : null}
              {tab === "design" ? <DesignPanel settings={settings} onChange={updateSettings} mode={mode} /> : null}
              {tab === "export" ? <ExportPanel resumeId={resume.id} flush={flush} /> : null}
            </div>
          </div>
        </aside>
      </div>

      {job ? (
        <TailorReview
          open={tailorOpen}
          onClose={() => setTailorOpen(false)}
          doc={hist.present}
          job={job}
          aiAvailable={ai.available}
          onApply={(next, count) => {
            hist.set(() => next, { coalesce: false });
            setTailorOpen(false);
            setFlash(`Applied ${count} change${count === 1 ? "" : "s"} for this job. Use ↶ Undo to reverse them all.`);
            setTimeout(() => setFlash(null), 6000);
          }}
        />
      ) : null}
      {flash ? (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 animate-fade-up rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-2xl" role="status">
          {flash}
        </div>
      ) : null}

      <VersionsModal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        resumeId={resume.id}
        current={hist.present}
        flush={flush}
        onRestored={(r) => {
          revisionRef.current = r.revision;
          hist.reset({ data: r.data, settings: r.settings });
          // The restored state is what the server now holds.
          savedCounterRef.current = hist.version + 1 + metaVersion;
          setStatus("saved");
        }}
      />
    </EditorContext.Provider>
  );
}
