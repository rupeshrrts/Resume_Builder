"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Award, Briefcase, Check, Eye, FolderKanban, GraduationCap, Minus, Palette, Plus, Rocket, Sparkles, Target, Trash, Trophy, UserRound, Wrench, X } from "lucide-react";
import {
  PROFILE_LINKS,
  ResumeData,
  SKILLS_TITLES,
  SUMMARY_TITLES,
  defaultSettings,
  emptyResume,
  newId,
  profileLinkIndex,
  setProfileLink,
  type Bullet,
  type ResumeSettings,
  type TemplateId,
} from "@resume/shared/schema/resume";
import { PRESETS, TEMPLATES, presetSettings, templateDefaults } from "@resume/shared/render/templates";
import { composeSummary, suggestSkillsFromText, type CareerStage } from "@resume/shared/compose";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { scoreResume } from "@resume/shared/analysis/quality";
import { api, ApiError } from "@/lib/api-client";
import { BulletBuilder } from "./BulletBuilder";
import { PreviewPanel } from "../editor/PreviewPanel";
import { DateField, TextField } from "../editor/fields";
import { BoldButton, applyBold, isBoldKey } from "../editor/bold";
import type { SessionUser } from "@resume/shared/types/api";
import { TemplateThumb } from "../TemplateThumb";
import { Badge, Notice, ScoreRing, Spinner } from "../ui";

interface Draft {
  data: ResumeData;
  targetRole: string;
  stage: CareerStage;
  market: "IN" | "US" | "EU" | "OTHER";
  jobText: string;
  /** null = none picked (clicked again to deselect): the goal's recommended design is used. */
  template: TemplateId | null;
  accent: string | null;
  summaryEdited: boolean;
  /** The summary is optional; when off it is kept but hidden from the resume. */
  includeSummary: boolean;
  summaryTitle: ResumeSettings["summaryTitle"];
  /** Heading of the skills section; unset follows the goal's preset (developer roles use "Technical Skills"). */
  skillsTitle?: ResumeSettings["skillsTitle"];
}

const STORAGE_KEY = "rb-wizard-draft-v1";

// Two choices only: they decide whether education/projects or work experience goes first.
// Seniority is read from the job titles instead of being asked (see `stage` in Wizard).
const STAGES: { id: "student" | "experienced"; label: string; hint: string; icon: typeof GraduationCap }[] = [
  { id: "student", label: "Fresher / student", hint: "Little or no work experience yet. Your education and projects go first.", icon: GraduationCap },
  { id: "experienced", label: "Experienced", hint: "You've had at least one job. Your work experience goes first.", icon: Briefcase },
];

const STEPS = [
  { id: "goal", label: "Goal", icon: Target },
  { id: "contact", label: "About you", icon: UserRound },
  // Same order as a developer résumé: summary, then technical skills, then experience.
  { id: "summary", label: "Professional summary", icon: Sparkles },
  { id: "skills", label: "Technical skills", icon: Wrench },
  { id: "experience", label: "Experience", icon: Briefcase },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "education", label: "Education", icon: GraduationCap },
  // Same place as on the resume: after education, before achievements.
  { id: "certifications", label: "Certifications", icon: Award },
  { id: "achievements", label: "Achievements", icon: Trophy },
  { id: "design", label: "Design", icon: Palette },
  { id: "review", label: "Review", icon: Rocket },
] as const;

// Most specific first: "Full Stack Java Developer" is full-stack, not backend or generic software.
const ROLE_PRESETS: [string, RegExp][] = [
  ["fullstack", /full.?stack/],
  ["backend", /backend|api|\.net|java|node/],
  ["frontend", /front.?end|react|angular|ui developer/],
  ["data-analyst", /data analyst|business analyst|bi /],
  ["ml", /machine learning|ml |ai engineer|data scien/],
  ["cloud", /cloud|devops|sre|platform/],
  ["security", /security|soc|penetration|cyber/],
  ["database", /database|dba/],
  ["manager", /manager|head of|lead/],
  ["software", /software|developer|engineer|programmer/],
];

function presetForRole(role: string) {
  const r = role.toLowerCase();
  const hit = ROLE_PRESETS.find(([, re]) => re.test(r));
  return hit ? PRESETS.find((p) => p.id === hit[0]) : undefined;
}

function presetFor(stage: CareerStage, role: string) {
  const byRole = presetForRole(role);
  if (stage === "student") return PRESETS.find((p) => p.id === "fresher")!;
  if (stage === "changer") return PRESETS.find((p) => p.id === "career-change")!;
  if (stage === "senior" && !byRole) return PRESETS.find((p) => p.id === "senior")!;
  return byRole ?? PRESETS.find((p) => p.id === "experienced")!;
}

function freshDraft(): Draft {
  return { data: emptyResume(), targetRole: "", stage: "experienced", market: "IN", jobText: "", template: "professional", accent: TEMPLATES.professional.defaultAccent, summaryEdited: false, includeSummary: true, summaryTitle: "Summary" };
}

export function Wizard({ aiAvailable, account }: { aiAvailable: boolean; account?: Pick<SessionUser, "fullName" | "phone" | "email"> }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [name, setName] = useState("My resume");
  const stepsRef = useRef<HTMLOListElement>(null);
  const stepsScrolled = useRef(false);
  // On narrow screens the step row scrolls sideways; keep the current step centred in it.
  // The first scroll (a restored draft) jumps, since a smooth scroll during page load gets cut off.
  useEffect(() => {
    const ol = stepsRef.current;
    const li = ol?.children[step] as HTMLElement | undefined;
    if (!loaded || !ol || !li) return;
    ol.scrollTo({ left: li.offsetLeft - (ol.clientWidth - li.clientWidth) / 2, behavior: stepsScrolled.current ? "smooth" : "instant" });
    stepsScrolled.current = true;
  }, [step, loaded]);

  // Restore an unfinished draft from this browser.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Draft & { step?: number; owner?: string };
        const parsed = ResumeData.safeParse(saved.data);
        // Only resume a draft that belongs to this account (several people may share a computer).
        const owner = (saved.owner ?? parsed.data?.contact.email ?? "").toLowerCase();
        const mine = !account || !owner || owner === account.email.toLowerCase();
        if (parsed.success && mine) {
          // Older drafts may hold one of the removed stages (early, senior, changer).
          setDraft({ ...freshDraft(), ...saved, stage: saved.stage === "student" ? "student" : "experienced", data: parsed.data });
          setStep(Math.min(saved.step ?? 0, STEPS.length - 1));
        }
      }
    } catch {
      /* ignore unreadable drafts */
    }
    // Start "About you" from the name, mobile and email given at sign-up (never overwriting a draft).
    if (account)
      setDraft((prev) => {
        const c = prev.data.contact;
        if (c.fullName && c.email && c.phone) return prev;
        const next = structuredClone(prev);
        next.data.contact.fullName ||= account.fullName;
        next.data.contact.phone ||= account.phone;
        next.data.contact.email ||= account.email;
        return next;
      });
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...draft, step, owner: account?.email }));
    } catch {
      /* storage full or blocked */
    }
  }, [draft, step, loaded]);

  const d = draft.data;
  // An experienced user whose job titles show leadership gets the senior layout and summary line.
  const stage: CareerStage = draft.stage === "experienced" && d.experience.some((e) => /lead|manag|head|director|principal/i.test(e.title)) ? "senior" : draft.stage;
  const preset = presetFor(stage, draft.targetRole);
  const template = draft.template ?? preset.template;
  const settings = useMemo(
    () =>
      defaultSettings({
        ...templateDefaults(template),
        accentColor: draft.accent,
        ...presetSettings(preset),
        hiddenSections: draft.includeSummary ? [] : ["summary"],
        summaryTitle: draft.summaryTitle,
        ...(draft.skillsTitle ? { skillsTitle: draft.skillsTitle } : {}),
        market: draft.market,
        pageSize: draft.market === "US" ? "LETTER" : "A4",
      }),
    [template, draft.accent, preset, draft.market, draft.includeSummary, draft.summaryTitle, draft.skillsTitle],
  );
  const set = (fn: (x: Draft) => void) =>
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  const setData = (fn: (x: ResumeData) => void) => set((x) => fn(x.data));

  // The summary step comes before Experience, so the auto-draft keeps following the later steps
  // (experience, skills) until the user writes their own or turns the summary off.
  const autoSummary = useMemo(() => composeSummary(d, { targetRole: draft.targetRole, stage }), [d, draft.targetRole, stage]);
  const summaryReached = step >= STEPS.findIndex((s) => s.id === "summary");
  useEffect(() => {
    if (draft.includeSummary && !draft.summaryEdited && summaryReached && autoSummary !== d.summary.text) setData((x) => void (x.summary = { text: autoSummary, origin: "user" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryReached, autoSummary, draft.summaryEdited, draft.includeSummary]);

  const jobSkills = useMemo(() => (draft.jobText.trim().length > 60 ? analyzeJob(draft.jobText).skills : []), [draft.jobText]);
  const report = useMemo(() => scoreResume(d, settings, { jobDescription: draft.jobText || null }), [d, settings, draft.jobText]);

  const canNext = STEPS[step].id === "goal" ? draft.targetRole.trim().length > 1 : STEPS[step].id === "contact" ? !!(d.contact.fullName.trim() && d.contact.email.trim()) : true;

  async function create() {
    setBusy(true);
    setError(null);
    try {
      let jobId: string | null = null;
      if (draft.jobText.trim().length > 60) {
        const { job } = await api<{ job: { id: string } }>("/api/jobs", { body: { title: draft.targetRole, description: draft.jobText.slice(0, 30000) } });
        jobId = job.id;
      }
      const finalName = name.trim() && name !== "My resume" ? name : [d.contact.fullName, draft.targetRole].filter(Boolean).join(" – ") || "My resume";
      const { resume } = await api<{ resume: { id: string } }>("/api/resumes", { body: { name: finalName, data: d, settings, jobId } });
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      router.push(`/resumes/${resume.id}?created=1`);
    } catch (e) {
      setError(e instanceof ApiError ? [e.message, ...(e.issues ?? [])].join(" ") : "Couldn't create the resume.");
      setBusy(false);
    }
  }

  const addSkill = (skill: string, category: string) =>
    setData((x) => {
      if (x.skills.some((g) => g.items.some((i) => i.toLowerCase() === skill.toLowerCase()))) return;
      let g = x.skills.find((s) => s.category.toLowerCase() === category.toLowerCase());
      if (!g) {
        g = { id: newId("sk"), category, items: [] };
        x.skills.push(g);
      }
      g.items.push(skill);
    });

  const bulletEditor = (bullets: Bullet[], onChange: (b: Bullet[]) => void) =>
    bullets.length ? (
      <ul className="space-y-2">
        {bullets.map((b, i) => (
          <li key={b.id} className="flex items-start gap-2">
            <span className="mt-2 text-brand-500" aria-hidden>•</span>
            <textarea
              id={`wz-b-${b.id}`}
              className="field flex-1 resize-y"
              rows={2}
              value={b.text}
              aria-label={`Bullet ${i + 1}`}
              onChange={(e) => onChange(bullets.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              onKeyDown={(e) => {
                if (!isBoldKey(e)) return;
                e.preventDefault();
                applyBold(e.currentTarget, b.text, (text) => onChange(bullets.map((x, j) => (j === i ? { ...x, text } : x))));
              }}
            />
            <BoldButton target={`wz-b-${b.id}`} text={b.text} onText={(text) => onChange(bullets.map((x, j) => (j === i ? { ...x, text } : x)))} />
            {b.origin === "ai" ? <Badge tone="violet">✦ AI</Badge> : null}
            <button className="btn-ghost h-8 w-8 p-0 hover:text-red-700" aria-label="Remove bullet" onClick={() => onChange(bullets.filter((_, j) => j !== i))}>
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  const S = STEPS[step].id;
  // Achievements live in the "Achievements" additional section, the same one the editor shows.
  const achievementsIndex = (x: ResumeData) => x.additional.findIndex((a) => a.title.trim().toLowerCase() === "achievements");
  const achievements = d.additional[achievementsIndex(d)];

  // A passed step counts as done only if something was filled in; otherwise it shows as skipped.
  const filled: Record<(typeof STEPS)[number]["id"], boolean> = {
    goal: draft.targetRole.trim().length > 1,
    contact: !!(d.contact.fullName.trim() && d.contact.email.trim()),
    summary: !draft.includeSummary || !!d.summary.text.trim(),
    skills: d.skills.some((g) => g.items.length),
    experience: d.experience.length > 0,
    projects: d.projects.length > 0,
    education: d.education.length > 0,
    certifications: d.certifications.length > 0,
    achievements: !!achievements?.bullets.some((b) => b.text.trim()),
    design: true,
    review: false,
  };
  const stepState = (i: number) => (i === step ? "current" : i > step ? "todo" : filled[STEPS[i].id] ? "done" : "skipped");

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Guided resume builder</h1>
          <p className="text-sm text-slate-600">Answer a few questions; we turn your answers into a polished resume. Nothing is invented.</p>
        </div>
        <div className="flex items-center gap-2">
          <ScoreRing score={report.overall} size={48} label="Resume score so far" />
          <button className="btn-secondary lg:hidden" onClick={() => setShowPreview((s) => !s)}><Eye className="h-4 w-4" aria-hidden /> {showPreview ? "Edit" : "Preview"}</button>
        </div>
      </div>

      {/* Progress */}
      <nav
        className="relative mb-5 overflow-clip rounded-2xl bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 px-3 pb-3 pt-3.5 text-white shadow-[0_8px_24px_-12px_rgb(79_70_229/0.55)] sm:px-5"
        aria-label={`Progress: step ${step + 1} of ${STEPS.length}`}
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-fuchsia-400/20 blur-3xl" aria-hidden />

        <ol ref={stepsRef} className="relative -mx-1 flex overflow-x-auto px-1 pb-1 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const state = stepState(i);
            const line = i < step - 1 ? "bg-emerald-300" : i === step - 1 ? "bg-gradient-to-r from-emerald-300 to-white" : "bg-white/20";
            return (
              <li key={s.id} className="relative min-w-[76px] flex-1">
                {i < STEPS.length - 1 ? <span aria-hidden className={`absolute left-[calc(50%+22px)] right-[calc(-50%+22px)] top-[16.5px] h-[3px] rounded-full transition-colors ${line}`} /> : null}
                <button
                  onClick={() => (i <= step || canNext ? setStep(i) : undefined)}
                  aria-current={state === "current" ? "step" : undefined}
                  aria-label={`Step ${i + 1}: ${s.label} (${state === "current" ? "you are here" : state === "done" ? "completed" : state === "skipped" ? "skipped" : "not started"})`}
                  className="group flex w-full flex-col items-center gap-1 px-1 text-center"
                >
                  <span
                    className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition duration-200 ${
                      state === "current"
                        ? "scale-110 border-white bg-white text-brand-700 shadow-[0_0_0_4px_rgb(255_255_255/0.2),0_6px_16px_-4px_rgb(15_23_42/0.4)]"
                        : state === "done"
                          ? "border-emerald-300 bg-emerald-400 text-white shadow-[0_4px_12px_-4px_rgb(16_185_129/0.7)] group-hover:scale-105"
                          : state === "skipped"
                            ? "border-dashed border-amber-300 bg-amber-300/15 text-amber-200 group-hover:scale-105"
                            : "border-white/25 bg-white/10 text-white/70 group-hover:border-white/50 group-hover:text-white"
                    }`}
                  >
                    {state === "current" ? <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-white/30 [animation-duration:2s]" /> : null}
                    {state === "done" ? <Check className="h-[18px] w-[18px]" strokeWidth={3} /> : state === "skipped" ? <Minus className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className={`text-[11px] leading-tight ${state === "current" ? "font-bold text-white" : state === "done" ? "font-semibold text-emerald-200" : state === "skipped" ? "font-semibold text-amber-200" : "font-medium text-brand-100/80"}`}>
                    {s.label}
                  </span>
                  {state === "current" ? <span className="whitespace-nowrap rounded-full bg-white px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-brand-700 shadow-sm">You&apos;re here</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className={`min-w-0 ${showPreview ? "hidden lg:block" : ""}`}>
          <div
            key={S}
            className="relative isolate animate-fade-up space-y-5 overflow-clip rounded-2xl border border-blue-100/80 bg-gradient-to-br from-white via-white to-blue-50/70 p-6 shadow-[0_2px_6px_rgb(15_23_42/0.04),0_0_28px_-6px_rgb(59_130_246/0.18),0_16px_40px_-16px_rgb(79_70_229/0.35)] before:absolute before:inset-x-0 before:top-0 before:h-1 before:bg-gradient-to-r before:from-brand-600 before:via-blue-500 before:to-violet-500 after:pointer-events-none after:absolute after:-bottom-24 after:-right-24 after:-z-10 after:h-64 after:w-64 after:rounded-full after:bg-blue-200/30 after:blur-3xl sm:p-7 [&_.field:focus]:border-blue-500 [&_.field:focus]:ring-blue-100 [&_.field:hover]:border-blue-200 [&_.field]:border-slate-200/90 [&_.field]:shadow-[0_1px_2px_rgb(15_23_42/0.05)] [&_.label]:text-slate-700"
          >
            {S === "goal" ? (
              <>
                <StepTitle title="What job are you going for?" sub="This shapes the layout, the section order and which skills we highlight." />
                <TextField label="Target role" value={draft.targetRole} onChange={(v) =>
                    set((x) => {
                      // The headline follows the target role until the user changes it.
                      if (!x.data.contact.headline || x.data.contact.headline === x.targetRole) x.data.contact.headline = v;
                      x.targetRole = v;
                    })
                  } placeholder="e.g. .NET Developer, Data Analyst, Sales Manager" />
                <fieldset>
                  <legend className="label">Where are you in your career?</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {STAGES.map(({ id, label, hint, icon: Icon }) => {
                      const on = draft.stage === id;
                      return (
                        <label
                          key={id}
                          className={`flex cursor-pointer flex-col rounded-xl border-2 p-3.5 transition duration-200 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-blue-100 ${
                            on
                              ? "border-blue-500 bg-gradient-to-b from-blue-50 to-white shadow-[0_0_0_3px_rgb(59_130_246/0.1),0_10px_24px_-10px_rgb(59_130_246/0.5)]"
                              : "border-slate-200 bg-white hover:border-blue-300"
                          }`}
                        >
                          <input type="radio" name="stage" className="sr-only" checked={on} onChange={() => set((x) => void (x.stage = id))} />
                          <span className="flex items-center justify-between">
                            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${on ? "bg-gradient-to-br from-blue-500 to-brand-600 text-white shadow-[0_6px_14px_-4px_rgb(59_130_246/0.6)]" : "bg-slate-100 text-slate-500"}`}><Icon className="h-5 w-5" aria-hidden /></span>
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300"}`} aria-hidden>{on ? <Check className="h-3 w-3" strokeWidth={4} /> : null}</span>
                          </span>
                          <span className={`mt-2.5 block font-semibold ${on ? "text-blue-900" : "text-slate-900"}`}>{label}</span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{hint}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <div>
                  <label className="label" htmlFor="wz-market">Applying in</label>
                  <select id="wz-market" className="field max-w-xs" value={draft.market} onChange={(e) => set((x) => void (x.market = e.target.value as Draft["market"]))}>
                    <option value="IN">India</option>
                    <option value="US">United States</option>
                    <option value="EU">Europe / UK</option>
                    <option value="OTHER">Elsewhere</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="wz-jd">Have a specific job ad? Paste it (optional)</label>
                  <textarea id="wz-jd" className="field min-h-28 font-mono text-xs" value={draft.jobText} onChange={(e) => set((x) => void (x.jobText = e.target.value))} placeholder="We'll show which of its skills you have, and save it so you can track the application." />
                </div>
              </>
            ) : null}

            {S === "contact" ? (
              <>
                <StepTitle title="How should employers reach you?" sub="City and country are enough. No photo, date of birth or full address needed." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField label="Full name" value={d.contact.fullName} onChange={(v) => setData((x) => void (x.contact.fullName = v))} />
                  <TextField label="Headline" value={d.contact.headline} onChange={(v) => setData((x) => void (x.contact.headline = v))} hint="Usually your target role." />
                  <TextField label="Email" type="email" value={d.contact.email} onChange={(v) => setData((x) => void (x.contact.email = v))} />
                  <TextField label="Phone" type="tel" value={d.contact.phone} onChange={(v) => setData((x) => void (x.contact.phone = v))} placeholder={draft.market === "IN" ? "+91 98765 43210" : "+1 555 010 0000"} />
                  <TextField label="City, country" value={d.contact.location} onChange={(v) => setData((x) => void (x.contact.location = v))} placeholder="Pune, India" />
                  {PROFILE_LINKS.map((p) => (
                    <TextField
                      key={p.label}
                      label={`${p.label} (optional)`}
                      value={d.contact.links[profileLinkIndex(d.contact.links, p.label)]?.url ?? ""}
                      onChange={(v) => setData((x) => setProfileLink(x.contact, p.label, v))}
                      placeholder={p.placeholder}
                    />
                  ))}
                </div>
              </>
            ) : null}

            {S === "experience" ? (
              <>
                <StepTitle
                  title="Your work experience"
                  sub={draft.stage === "student" ? "Include internships, part-time jobs and freelance work. No experience yet? Skip ahead to projects." : "Most recent first. For each role, add 3–5 bullets about what you achieved."}
                />
                {d.experience.map((e, i) => (
                  <div key={e.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-bold">{e.title || "New role"}{e.company ? <span className="font-normal text-slate-500"> · {e.company}</span> : null}</p>
                      <button className="btn-ghost h-8 px-2 text-xs hover:text-red-700" onClick={() => setData((x) => void x.experience.splice(i, 1))}><Trash className="h-3.5 w-3.5" aria-hidden /> Remove</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Job title" value={e.title} onChange={(v) => setData((x) => void (x.experience[i].title = v))} />
                      <TextField label="Company" value={e.company} onChange={(v) => setData((x) => void (x.experience[i].company = v))} />
                      <TextField
                        label="Location (optional)"
                        value={e.location}
                        onChange={(v) => setData((x) => void (x.experience[i].location = v))}
                        placeholder="Navi Mumbai, Maharashtra"
                        className="sm:col-span-2"
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-4">
                      <DateField label="Start" value={e.startDate} onChange={(v) => setData((x) => void (x.experience[i].startDate = v))} />
                      <DateField label="End" value={e.current ? "" : e.endDate} disabled={e.current} onChange={(v) => setData((x) => void (x.experience[i].endDate = v))} />
                      <label className="mb-1.5 flex items-center gap-1.5 text-sm"><input type="checkbox" checked={e.current} onChange={(ev) => setData((x) => void (x.experience[i].current = ev.target.checked))} /> Current job</label>
                      {draft.stage === "student" || e.employmentType === "Internship" ? (
                        <label className="mb-1.5 flex items-center gap-1.5 text-sm"><input type="checkbox" checked={e.employmentType === "Internship"} onChange={(ev) => setData((x) => void (x.experience[i].employmentType = ev.target.checked ? "Internship" : ""))} /> Internship</label>
                      ) : null}
                    </div>
                    <div className="mt-4 space-y-3">
                      {/* The resume skips a role with neither title nor company, so say why its bullets aren't showing. */}
                      {e.bullets.length && !e.title.trim() && !e.company.trim() ? (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Add a job title or company above. Until then, this role and its bullets don&apos;t appear on your resume.</p>
                      ) : null}
                      <BulletBuilder
                        current={e.current}
                        context={`${e.title} at ${e.company}`}
                        aiAvailable={aiAvailable}
                        style={settings.writingStyle}
                        onAdd={(text, ai) => setData((x) => void x.experience[i].bullets.push({ id: newId("b"), text, origin: ai ? "ai" : "user", ...(ai ? { sourceText: ai.sourceText } : {}) }))}
                      />
                      {bulletEditor(e.bullets, (b) => setData((x) => void (x.experience[i].bullets = b)))}
                    </div>
                  </div>
                ))}
                <button
                  className="btn-secondary"
                  onClick={() => setData((x) => void x.experience.push({ id: newId("exp"), title: "", company: "", location: "", employmentType: draft.stage === "student" ? "Internship" : "", startDate: "", endDate: "", current: x.experience.length === 0 && draft.stage !== "student", bullets: [] }))}
                >
                  <Plus className="h-4 w-4" aria-hidden /> Add {d.experience.length ? "another" : "a"} role
                </button>
              </>
            ) : null}

            {S === "projects" ? (
              <>
                <StepTitle title="Projects worth showing" sub="Academic, personal, open-source or work projects. Describe the problem, what you built, the tools, and the outcome." />
                {d.projects.map((p, i) => (
                  <div key={p.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-bold">{p.name || "New project"}</p>
                      <button className="btn-ghost h-8 px-2 text-xs hover:text-red-700" onClick={() => setData((x) => void x.projects.splice(i, 1))}><Trash className="h-3.5 w-3.5" aria-hidden /> Remove</button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Project name" value={p.name} onChange={(v) => setData((x) => void (x.projects[i].name = v))} />
                      <TextField label="Link (optional)" value={p.url} onChange={(v) => setData((x) => void (x.projects[i].url = v))} placeholder="github.com/you/project" />
                      <TextField
                        label="Short description (optional)"
                        className="sm:col-span-2"
                        value={p.role}
                        onChange={(v) => setData((x) => void (x.projects[i].role = v))}
                        placeholder="AI Browser Security Extension | Live SaaS Product"
                      />
                      <TextField
                        label="Technologies (comma-separated)"
                        className="sm:col-span-2"
                        value={p.technologies.join(", ")}
                        onChange={(v) => setData((x) => void (x.projects[i].technologies = v.split(/\s*,\s*/).filter((t, k, arr) => t || k === arr.length - 1)))}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-4">
                      <DateField label="When (month & year)" value={p.startDate} onChange={(v) => setData((x) => void (x.projects[i].startDate = v))} />
                      <DateField label="Until (optional)" value={p.endDate} onChange={(v) => setData((x) => void (x.projects[i].endDate = v))} />
                    </div>
                    <div className="mt-4 space-y-3">
                      <BulletBuilder
                        current={false}
                        context={`Project: ${p.name}${p.technologies.length ? ` (${p.technologies.join(", ")})` : ""}`}
                        aiAvailable={aiAvailable}
                        style={settings.writingStyle}
                        purposeLabel="Problem it solved"
                        onAdd={(text, ai) => setData((x) => void x.projects[i].bullets.push({ id: newId("b"), text, origin: ai ? "ai" : "user", ...(ai ? { sourceText: ai.sourceText } : {}) }))}
                      />
                      {bulletEditor(p.bullets, (b) => setData((x) => void (x.projects[i].bullets = b)))}
                    </div>
                  </div>
                ))}
                <button className="btn-secondary" onClick={() => setData((x) => void x.projects.push({ id: newId("prj"), name: "", role: "", url: "", technologies: [], startDate: "", endDate: "", bullets: [] }))}>
                  <Plus className="h-4 w-4" aria-hidden /> Add {d.projects.length ? "another" : "a"} project
                </button>
              </>
            ) : null}

            {S === "education" ? (
              <>
                <StepTitle title="Education" sub="Highest qualification first. Add CGPA or percentage if it's strong or the employer asks for it." />
                {d.education.map((e, i) => (
                  <div key={e.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Degree / qualification" value={e.degree} onChange={(v) => setData((x) => void (x.education[i].degree = v))} placeholder="B.Tech, MBA, Class XII" />
                      <TextField label="Field" value={e.field} onChange={(v) => setData((x) => void (x.education[i].field = v))} placeholder="Computer Science" />
                      <TextField label="Institution" value={e.institution} onChange={(v) => setData((x) => void (x.education[i].institution = v))} />
                      <TextField label="Location (optional)" value={e.location} onChange={(v) => setData((x) => void (x.education[i].location = v))} placeholder="Ferozepur, Punjab" />
                      <TextField label="Grade (optional)" value={e.grade} onChange={(v) => setData((x) => void (x.education[i].grade = v))} placeholder="CGPA: 8.2/10" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-4">
                      <DateField label="Start" value={e.startDate} onChange={(v) => setData((x) => void (x.education[i].startDate = v))} />
                      <DateField label="End (or expected)" value={e.endDate} onChange={(v) => setData((x) => void (x.education[i].endDate = v))} />
                      <button className="btn-ghost mb-1 h-8 px-2 text-xs hover:text-red-700" onClick={() => setData((x) => void x.education.splice(i, 1))}><Trash className="h-3.5 w-3.5" aria-hidden /> Remove</button>
                    </div>
                  </div>
                ))}
                <button className="btn-secondary" onClick={() => setData((x) => void x.education.push({ id: newId("edu"), degree: "", field: "", institution: "", location: "", startDate: "", endDate: "", grade: "", bullets: [] }))}>
                  <Plus className="h-4 w-4" aria-hidden /> Add education
                </button>
              </>
            ) : null}

            {S === "certifications" ? (
              <>
                <StepTitle
                  title="Certifications"
                  sub="Optional. Only ones you've actually earned and that matter for this role, e.g. AWS Cloud Practitioner, Oracle Java SE, Google Data Analytics. Most relevant first."
                />
                {d.certifications.map((c, i) => (
                  <div key={c.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Certification name" value={c.name} onChange={(v) => setData((x) => void (x.certifications[i].name = v))} placeholder="AWS Certified Cloud Practitioner" />
                      <TextField label="Issued by" value={c.issuer} onChange={(v) => setData((x) => void (x.certifications[i].issuer = v))} placeholder="Amazon Web Services" />
                      <TextField label="Credential link (optional)" value={c.url} onChange={(v) => setData((x) => void (x.certifications[i].url = v))} placeholder="credly.com/badges/…" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-4">
                      <DateField label="Issued (month & year)" value={c.date} onChange={(v) => setData((x) => void (x.certifications[i].date = v))} />
                      <button className="btn-ghost mb-1 h-8 px-2 text-xs hover:text-red-700" onClick={() => setData((x) => void x.certifications.splice(i, 1))}><Trash className="h-3.5 w-3.5" aria-hidden /> Remove</button>
                    </div>
                  </div>
                ))}
                <button className="btn-secondary" onClick={() => setData((x) => void x.certifications.push({ id: newId("cert"), name: "", issuer: "", date: "", url: "" }))}>
                  <Plus className="h-4 w-4" aria-hidden /> Add {d.certifications.length ? "another" : "a"} certification
                </button>
              </>
            ) : null}

            {S === "achievements" ? (
              <>
                <StepTitle
                  title="Achievements"
                  sub="Optional. Awards, exam ranks, hackathon or competition results, scholarships. One per line, e.g. “Qualified GATE 2025 and 2026 in Computer Science (CSIT).”"
                />
                {bulletEditor(achievements?.bullets ?? [], (b) => setData((x) => void (x.additional[achievementsIndex(x)].bullets = b)))}
                <button
                  className="btn-secondary"
                  onClick={() =>
                    setData((x) => {
                      let i = achievementsIndex(x);
                      if (i < 0) i = x.additional.push({ id: newId("add"), title: "Achievements", bullets: [] }) - 1;
                      x.additional[i].bullets.push({ id: newId("b"), text: "", origin: "user" });
                    })
                  }
                >
                  <Plus className="h-4 w-4" aria-hidden /> Add {achievements?.bullets.length ? "another" : "an"} achievement
                </button>
              </>
            ) : null}

            {S === "skills" ? (
              <SkillsStep
                data={d}
                setData={setData}
                addSkill={addSkill}
                // Groups follow the target role even for freshers (a fresher React developer still wants "Frontend").
                categories={presetForRole(draft.targetRole)?.skillCategories ?? preset.skillCategories}
                jobSkills={jobSkills}
                title={settings.skillsTitle}
                onTitle={(t) => set((x) => void (x.skillsTitle = t))}
              />
            ) : null}

            {S === "summary" ? (
              <SummaryStep
                include={draft.includeSummary}
                onInclude={(on) => set((x) => void (x.includeSummary = on))}
                title={draft.summaryTitle}
                onTitle={(t) => set((x) => void (x.summaryTitle = t))}
                edited={draft.summaryEdited}
                text={d.summary.text}
                origin={d.summary.origin}
                auto={autoSummary}
                aiAvailable={aiAvailable}
                data={d}
                targetRole={draft.targetRole}
                style={settings.writingStyle}
                onChange={(text, origin) => set((x) => void ((x.data.summary = { text, origin }), (x.summaryEdited = true)))}
                onReset={() => set((x) => void ((x.summaryEdited = false), (x.data.summary = { text: autoSummary, origin: "user" })))}
              />
            ) : null}

            {S === "design" ? (
              <>
                <StepTitle title="Pick a design" sub="All designs are single-column and ATS-friendly, so choose what fits your industry and taste." />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
                    const t = TEMPLATES[id];
                    const on = draft.template === id;
                    // With nothing picked, the design in use is marked as the default.
                    const isDefault = !draft.template && template === id;
                    return (
                      <button
                        key={id}
                        aria-pressed={on}
                        title={on ? "Click again to deselect" : undefined}
                        onClick={() =>
                          set((x) => {
                            // A second click deselects, falling back to the recommended design.
                            x.template = on ? null : id;
                            x.accent = TEMPLATES[on ? preset.template : id].defaultAccent;
                          })
                        }
                        className={`rounded-xl border p-1.5 text-left transition ${on ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : isDefault ? "border-dashed border-brand-400 bg-brand-50/40" : "border-slate-200 hover:-translate-y-0.5 hover:shadow-md"}`}
                      >
                        <TemplateThumb t={t} />
                        <span className="mt-1.5 flex items-center justify-between px-0.5">
                          <span className="text-xs font-semibold">{t.label}</span>
                          {isDefault ? <Badge tone="blue">Default</Badge> : t.badge ? <Badge tone={t.badge === "Premium" ? "violet" : t.badge === "Popular" ? "blue" : "green"}>{t.badge}</Badge> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-sm text-slate-600">
                  {draft.template
                    ? <>{TEMPLATES[draft.template].description} <span className="text-slate-400">Click it again to deselect.</span></>
                    : <>Back to the default: <strong>{TEMPLATES[template].label}</strong>, recommended for {preset.label.toLowerCase()} resumes. Click a design to choose your own.</>}
                </p>
                <div>
                  <p className="label">Colour</p>
                  <div className="flex flex-wrap gap-2">
                    {[null, "#1f3b63", "#312e81", "#0f5257", "#1f4d36", "#6b1e2e", "#374151"].map((c) => (
                      <button
                        key={c ?? "none"}
                        aria-label={c ?? "Black and white"}
                        aria-pressed={draft.accent === c}
                        onClick={() => set((x) => void (x.accent = c))}
                        className={`h-8 w-8 rounded-full ring-offset-2 transition ${draft.accent === c ? "ring-2 ring-brand-500" : "hover:scale-110"}`}
                        style={{ background: c ?? "#111827" }}
                      />
                    ))}
                  </div>
                </div>
              </>
            ) : null}

            {S === "review" ? (
              <>
                <StepTitle title="Looking good. Review and create." sub="You can keep editing everything afterwards, with scores, job matching and exports." />
                <div className="flex items-center gap-4 rounded-xl bg-slate-50 p-4">
                  <ScoreRing score={report.overall} size={64} label="Resume score" />
                  <div className="text-sm">
                    <p className="font-bold">Resume score {report.overall}/100</p>
                    <p className="text-slate-600">ATS readability {report.ats.score}{report.match ? ` · job match ${report.match.score}` : ""}</p>
                  </div>
                </div>
                {report.improvements.length ? (
                  <div>
                    <p className="label">Quick wins before you create it</p>
                    <ul className="space-y-1.5">
                      {report.improvements.slice(0, 4).map((imp, i) => (
                        <li key={i} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                          <p className="font-medium">{imp.message}</p>
                          {imp.fix !== imp.message ? <p className="text-xs text-slate-600">{imp.fix}</p> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <TextField label="Name this resume" value={name} onChange={setName} />
                {error ? <Notice tone="error">{error}</Notice> : null}
                <button className="btn-primary w-full py-3 text-base" disabled={busy} onClick={create}>
                  {busy ? <Spinner label="Creating…" /> : <><Rocket className="h-5 w-5" aria-hidden /> Create my resume</>}
                </button>
              </>
            ) : null}

            {/* Navigation */}
            <div className="flex items-center justify-between border-t border-blue-100/70 pt-4">
              <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ArrowLeft className="h-4 w-4" aria-hidden /> Back</button>
              <div className="flex items-center gap-2">
                {step < STEPS.length - 1 && ["summary", "skills", "experience", "projects", "education", "certifications", "achievements"].includes(S) ? (
                  <button className="btn-ghost text-slate-500" onClick={() => setStep((s) => s + 1)}>Skip</button>
                ) : null}
                {step < STEPS.length - 1 ? (
                  <button className="btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                    Continue <ArrowRight className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
              </div>
            </div>
            {!canNext ? <p className="text-right text-xs text-slate-500">{S === "goal" ? "Enter a target role to continue." : "Name and email are needed to continue."}</p> : null}
          </div>
          <button
            className="mt-3 text-xs text-slate-500 underline"
            onClick={() => {
              if (confirm("Clear everything and start again?")) {
                setDraft(freshDraft());
                setStep(0);
              }
            }}
          >
            Start over
          </button>
        </div>

        <aside className={`min-w-0 lg:sticky lg:top-20 lg:self-start ${showPreview ? "" : "hidden lg:block"}`} aria-label="Live preview">
          <div className="rounded-2xl bg-gradient-to-br from-slate-100 to-brand-50 p-4">
            <PreviewPanel data={d} settings={settings} caption={false} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function StepTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex gap-3">
      <span aria-hidden className="w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-500 to-violet-500" />
      <div>
        <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-600">{sub}</p>
      </div>
    </div>
  );
}

/** Group names offered in the skills step, on top of the preset's own; any other name can be typed. */
const COMMON_SKILL_GROUPS = ["Languages", "Backend & Frameworks", "Frontend", "Databases", "Data & AI", "Cloud & DevOps", "Testing", "Tools", "Soft skills"];

/** Example skills shown inside each group's box, keyed by lower-case group name. */
const SKILL_EXAMPLES: Record<string, string> = {
  languages: "Java, Python, JavaScript",
  frameworks: "Spring Boot, React, Node.js",
  frontend: "React, HTML, CSS, Tailwind",
  backend: "Node.js, Express, Spring Boot, REST APIs",
  "backend & frameworks": "Spring Boot, Node.js, Django",
  databases: "MySQL, PostgreSQL, MongoDB",
  "cloud & devops": "AWS, Docker, GitHub Actions",
  tools: "Git, VS Code, Postman, Jira",
  messaging: "Kafka, RabbitMQ",
  styling: "CSS, Tailwind, Sass",
  testing: "Jest, Playwright, JUnit",
  technical: "C, Java, Python, SQL",
  "core skills": "Sales, Negotiation, Customer service",
  software: "MS Excel, Tally, SAP",
  leadership: "Team leadership, Hiring, Mentoring",
  domain: "Banking, Healthcare, E-commerce",
  delivery: "Agile, Scrum, Roadmapping",
  cloud: "AWS, Azure, Google Cloud",
  containers: "Docker, Kubernetes",
  iac: "Terraform, CloudFormation",
  "ci/cd": "GitHub Actions, Jenkins",
  observability: "Prometheus, Grafana, ELK",
  analysis: "Statistics, A/B testing, Forecasting",
  "bi & visualisation": "Power BI, Tableau, Excel",
  data: "Pandas, Spark, SQL",
  "data & ai": "Pandas, scikit-learn, LLMs",
  "ml & ai": "Deep learning, NLP, LLMs",
  mlops: "MLflow, Docker, Airflow",
  "performance & tuning": "Indexing, Query tuning",
  "security domains": "Network security, VAPT, SOC",
  "frameworks & compliance": "ISO 27001, NIST",
  "soft skills": "Communication, Teamwork, Problem solving",
  teaching: "Curriculum design, Lecturing",
  research: "Data collection, SPSS, Literature review",
};

function SkillsStep({
  data,
  setData,
  addSkill,
  categories,
  jobSkills,
  title,
  onTitle,
}: {
  data: ResumeData;
  setData: (fn: (x: ResumeData) => void) => void;
  addSkill: (skill: string, category: string) => void;
  categories: string[];
  jobSkills: { name: string; category: string; importance: string }[];
  title: ResumeSettings["skillsTitle"];
  onTitle: (t: ResumeSettings["skillsTitle"]) => void;
}) {
  const [input, setInput] = useState("");
  const [group, setGroup] = useState(categories[0] ?? "Skills");
  const fromText = suggestSkillsFromText(data);
  const have = new Set(data.skills.flatMap((g) => g.items.map((i) => i.toLowerCase())));
  const jobMissing = jobSkills.filter((s) => !have.has(s.name.toLowerCase()));
  const groupNames = [...new Set([...data.skills.map((g) => g.category).filter(Boolean), ...categories, ...COMMON_SKILL_GROUPS])];
  const example = SKILL_EXAMPLES[group.trim().toLowerCase()] ?? "Java, Python, TypeScript";
  // Each line is either "Group: a, b, c" (pasted from an existing resume) or just "a, b, c" for the chosen group.
  const add = () => {
    for (const line of input.split(/\n+/)) {
      const m = /^\s*([^:,]{2,60}):\s*(.+)$/.exec(line);
      const target = (m ? m[1] : group).trim() || "Skills";
      (m ? m[2] : line).split(/\s*[,;]\s*/).map((s) => s.trim()).filter(Boolean).forEach((s) => addSkill(s, target));
    }
    setInput("");
  };
  return (
    <>
      <StepTitle
        title="Your technical skills"
        sub="List what you can confidently discuss in an interview, grouped by type. No ratings or bars. After you add experience and projects, come back here for skills we find in them."
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Heading on the resume:</span>
        {SKILLS_TITLES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={title === t}
            onClick={() => onTitle(t)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${title === t ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
          >
            {t.toUpperCase()}
          </button>
        ))}
        <span className="text-xs text-slate-500">Technical Skills suits IT and engineering roles.</span>
      </div>
      {fromText.length ? (
        <div className="rounded-xl bg-emerald-50/70 p-4">
          <p className="text-sm font-semibold text-emerald-900">Found in what you wrote</p>
          <p className="mb-2 text-xs text-emerald-800">You've already shown these in your experience or projects. Click to add.</p>
          <div className="flex flex-wrap gap-1.5">
            {fromText.map((s) => (
              <button key={s.name} onClick={() => addSkill(s.name, s.category)} className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100">
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {jobMissing.length ? (
        <div className="rounded-xl bg-amber-50/70 p-4">
          <p className="text-sm font-semibold text-amber-900">In the job ad, not yet on your resume</p>
          <p className="mb-2 text-xs text-amber-800">Add one only if you've genuinely used it. Recruiters will ask about it.</p>
          <div className="flex flex-wrap gap-1.5">
            {jobMissing.map((s) => (
              <button
                key={s.name}
                onClick={() => confirm(`Add “${s.name}”? Only add skills you have actually used.`) && addSkill(s.name, s.category)}
                className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                + {s.name}
                {s.importance === "essential" ? <span className="ml-1 text-[10px] font-bold uppercase opacity-70">req</span> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <div>
          <p className="label">Suggested groups for your role (click one, or type your own below)</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const on = group.trim().toLowerCase() === c.toLowerCase();
              const count = data.skills.find((g) => g.category.toLowerCase() === c.toLowerCase())?.items.length ?? 0;
              return (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setGroup(c)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? "border-brand-500 bg-brand-600 text-white shadow-sm" : "border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-700"}`}
                >
                  {count ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
                  {c}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-56">
            <label className="label" htmlFor="wz-group">Group name</label>
            <input id="wz-group" className="field" list="wz-group-list" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. Languages" />
            <datalist id="wz-group-list">{groupNames.map((g) => <option key={g} value={g} />)}</datalist>
          </div>
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="wz-skill">Skills (comma-separated)</label>
            <textarea
              id="wz-skill"
              rows={input.includes("\n") ? 4 : 1}
              className="field resize-y"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter adds; Shift+Enter starts a new line for pasting several groups.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (input.trim()) add();
                }
              }}
              placeholder={`e.g. ${example}`}
            />
          </div>
          <button className="btn-primary" disabled={!input.trim()}><Plus className="h-4 w-4" aria-hidden /> Add</button>
        </div>
        <p className="text-xs text-slate-500">
          Tip: paste your whole skills list at once. Lines like <span className="font-mono">Languages: Java, Python</span> become their own bold group on the resume.
        </p>
      </form>
      {data.skills.filter((g) => g.items.length).map((g) => (
        <div key={g.id}>
          <div className="mb-1 flex items-center gap-1.5">
            <input
              aria-label="Group name"
              className="w-56 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-700 hover:border-slate-200 focus:border-brand-300 focus:bg-white focus:outline-none"
              value={g.category}
              placeholder="Skills"
              onChange={(e) => setData((x) => void (x.skills[x.skills.findIndex((s) => s.id === g.id)].category = e.target.value))}
              title="Click to rename this group"
            />
            <button
              type="button"
              className="text-[11px] text-slate-400 hover:text-red-700"
              onClick={() => confirm(`Remove the “${g.category || "Skills"}” group and its skills?`) && setData((x) => void x.skills.splice(x.skills.findIndex((s) => s.id === g.id), 1))}
            >
              Remove group
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((it, ii) => (
              <span key={it + ii} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800">
                {it}
                <button aria-label={`Remove ${it}`} className="rounded-full hover:text-red-700" onClick={() => setData((x) => void x.skills[x.skills.findIndex((s) => s.id === g.id)].items.splice(ii, 1))}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function SummaryStep({
  include,
  onInclude,
  title,
  onTitle,
  edited,
  text,
  origin,
  auto,
  aiAvailable,
  data,
  targetRole,
  style,
  onChange,
  onReset,
}: {
  include: boolean;
  onInclude: (on: boolean) => void;
  title: ResumeSettings["summaryTitle"];
  onTitle: (t: ResumeSettings["summaryTitle"]) => void;
  edited: boolean;
  text: string;
  origin: Bullet["origin"];
  auto: string;
  aiAvailable: boolean;
  data: ResumeData;
  targetRole: string;
  style: "conservative" | "balanced" | "achievement";
  onChange: (t: string, origin: Bullet["origin"]) => void;
  onReset: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  return (
    <>
      <StepTitle title="Professional summary" sub="Optional. 2–4 sentences at the top of your resume: who you are, what you're best at, and one result." />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={include} onChange={(e) => onInclude(e.target.checked)} />
        Include a professional summary on my resume
      </label>
      {!include ? (
        <p className="text-sm text-slate-500">No summary will be added. You can turn it on later in the editor (Design → Section order).</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Heading on the resume:</span>
            {SUMMARY_TITLES.map((t) => (
              <button
                key={t}
                aria-pressed={title === t}
                onClick={() => onTitle(t)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${title === t ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
              >
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <textarea
            className="field min-h-36 text-[15px] leading-relaxed"
            value={text}
            onChange={(e) => onChange(e.target.value, origin === "ai" ? "ai" : "user")}
            aria-label="Professional summary"
            placeholder="e.g. Full Stack Developer with 2+ years of experience building enterprise web applications with Java / Spring Boot and React…"
          />
          {!edited ? <p className="text-xs text-slate-500">This is drafted from your answers and keeps updating as you add experience and skills. Type here to write your own.</p> : null}
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={onReset} disabled={text === auto}>Use the auto-draft</button>
            {aiAvailable ? (
              <button
                className="btn-secondary text-violet-800"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const r = await api<{ text: string; guard: { warnings: string[] } }>("/api/ai/summary", { body: { data, targetRole, style, facts: "" } });
                    onChange(r.text, "ai");
                    setWarnings(r.guard.warnings);
                  } catch (e) {
                    setError(e instanceof ApiError ? e.message : "AI failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Sparkles className="h-4 w-4" aria-hidden /> Polish with AI
              </button>
            ) : null}
          </div>
          {busy ? <Spinner label="Writing…" /> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {warnings.length ? <Notice tone="warn">Please check: {warnings.join(" ")}</Notice> : null}
        </>
      )}
    </>
  );
}
