"use client";

import { useEffect, useState } from "react";
import { CloudUpload, Download, FileSearch, WandSparkles } from "lucide-react";

const STEPS = [
  {
    icon: CloudUpload,
    title: "Import or start fresh",
    body: "Upload a PDF or Word resume and get editable sections in seconds, with a report on layout features that trip up tracking systems.",
    visual: (
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/60 p-4">
          <CloudUpload className="h-6 w-6 text-brand-600" aria-hidden />
          <div className="text-sm"><p className="font-semibold">resume_2026.pdf</p><p className="text-xs text-slate-500">1 page · text-based</p></div>
        </div>
        {["Contact details found", "2 roles, 1 degree, 14 skills", "2-column layout detected: may parse out of order"].map((t, i) => (
          <div key={t} className={`rounded-lg px-3 py-2 text-xs font-medium ${i === 2 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{i === 2 ? "!" : "✓"} {t}</div>
        ))}
      </div>
    ),
  },
  {
    icon: FileSearch,
    title: "Match a real job",
    body: "Paste a job description. See which requirements your resume shows evidence for, which you only list, and which are missing. Required and nice-to-have are kept apart.",
    visual: (
      <div className="flex flex-wrap gap-1.5">
        {[["React", "g"], ["Node.js", "g"], ["PostgreSQL", "g"], ["Docker", "a"], ["AWS", "a"], ["Kubernetes", "s"], ["GraphQL", "s"]].map(([n, t]) => (
          <span key={n} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${t === "g" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : t === "a" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-500"}`}>{n}</span>
        ))}
        <div className="mt-3 w-full rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-800">Docker</span> appears only in your skills list. If you used it in a role, add a bullet that shows how.
        </div>
      </div>
    ),
  },
  {
    icon: WandSparkles,
    title: "Improve with your own facts",
    body: "AI suggests stronger wording in three styles and asks for missing numbers instead of inventing them. Anything it can't trace back to your material needs your confirmation.",
    visual: (
      <div className="space-y-2 text-xs">
        <div className="rounded-lg border border-slate-200 bg-white p-2.5"><p className="font-semibold text-slate-500">ORIGINAL</p><p className="text-slate-700 line-through decoration-red-300">Responsible for testing the app.</p></div>
        <div className="rounded-lg border border-violet-200 bg-violet-50 p-2.5"><p className="font-semibold text-violet-700">SUGGESTED</p><p className="text-slate-900">Wrote automated tests for the mobile app’s checkout flow.</p></div>
        <div className="rounded-lg bg-amber-50 p-2.5 text-amber-900">How many tests, and what changed afterwards? <span className="font-semibold">Answer only what you know.</span></div>
      </div>
    ),
  },
  {
    icon: Download,
    title: "Export, verified",
    body: "Download PDF, Word or plain text. Each file is re-opened and checked for missing content, reading order, blank pages and broken links before you send it.",
    visual: (
      <div className="space-y-1.5 text-xs">
        {["All content present (100%)", "Reading order correct", "1 page, no blank pages", "2 links clickable", "Real Word headings"].map((t) => (
          <div key={t} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] text-white">✓</span>{t}</div>
        ))}
      </div>
    ),
  },
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 5000);
    return () => clearInterval(t);
  }, [paused]);
  const step = STEPS[active];
  return (
    <div className="grid gap-6 lg:grid-cols-2" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)}>
      <ol className="space-y-2" role="tablist" aria-label="How it works">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const on = i === active;
          return (
            <li key={s.title}>
              <button
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={`relative w-full overflow-hidden rounded-xl border p-4 text-left transition ${on ? "border-brand-200 bg-white shadow-[var(--shadow-lift)]" : "border-transparent hover:bg-white/70"}`}
              >
                <span className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${on ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <span className="font-semibold"><span className="mr-1 text-slate-400">{i + 1}.</span>{s.title}</span>
                </span>
                {on ? <span className="mt-2 block pl-12 text-sm text-slate-600">{s.body}</span> : null}
                {on && !paused ? <span className="absolute bottom-0 left-0 h-0.5 animate-[grow_5s_linear] bg-brand-500" style={{ width: "100%" }} aria-hidden /> : null}
              </button>
            </li>
          );
        })}
      </ol>
      <div role="tabpanel" className="card flex min-h-72 items-center bg-gradient-to-br from-white to-brand-50/60 p-6">
        <div key={active} className="w-full animate-fade-up">{step.visual}</div>
      </div>
      <style>{`@keyframes grow { from { transform: scaleX(0); transform-origin: left } to { transform: scaleX(1); transform-origin: left } }`}</style>
    </div>
  );
}
