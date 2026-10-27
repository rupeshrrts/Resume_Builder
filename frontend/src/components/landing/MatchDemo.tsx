"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { CircleCheck, CircleDot, Circle } from "lucide-react";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { matchResume } from "@resume/shared/analysis/match";
import { DEMO_JOBS, DEMO_RESUME } from "@resume/shared/demo";
import { Bar, ScoreRing } from "../ui";

const STATUS = {
  strong: { label: "Shown in work", icon: CircleCheck, cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  listed: { label: "Only listed", icon: CircleDot, cls: "border-amber-200 bg-amber-50 text-amber-800" },
  missing: { label: "Missing", icon: Circle, cls: "border-slate-200 bg-white text-slate-500" },
} as const;

/** Paste any job description and match it against a sample resume, live. */
export function MatchDemo() {
  const [jd, setJd] = useState(DEMO_JOBS[0].text);
  const deferred = useDeferredValue(jd);
  const m = useMemo(() => (deferred.trim().length > 40 ? matchResume(DEMO_RESUME, analyzeJob(deferred)) : null), [deferred]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="card p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="md-jd" className="text-sm font-bold">Job description</label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sample jobs">
            {DEMO_JOBS.map((j) => (
              <button
                key={j.id}
                onClick={() => setJd(j.text)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${jd === j.text ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
              >
                {j.label}
              </button>
            ))}
          </div>
        </div>
        <textarea id="md-jd" className="field h-72 resize-none font-mono text-xs leading-relaxed" value={jd} onChange={(e) => setJd(e.target.value)} />
        <p className="mt-2 text-xs text-slate-500">Edit the text or paste a real posting. It&apos;s matched against a sample resume for Ananya Rao, a full-stack developer.</p>
      </div>

      <div className="card p-5" aria-live="polite">
        {m ? (
          <>
            <div className="flex items-center gap-4">
              <ScoreRing score={m.score} size={84} label="Job match" />
              <div>
                <p className="text-lg font-bold">Job match {m.score}/100</p>
                <p className="text-sm text-slate-600">Weighted by how much of each requirement the resume actually shows.</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {m.components.filter((c) => c.score !== null).map((c) => (
                <li key={c.key} className="text-sm">
                  <div className="mb-1 flex justify-between"><span className="font-medium">{c.label}</span><span className="font-semibold tabular-nums">{Math.round(c.score!)}</span></div>
                  <Bar value={Math.round(c.score!)} />
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {m.skills.map((s) => {
                const st = STATUS[s.status];
                const Icon = st.icon;
                return (
                  <span key={s.name} title={`${st.label} · ${s.importance}`} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${st.cls}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {s.name}
                    {s.importance === "essential" ? <span className="text-[10px] font-bold uppercase opacity-70">req</span> : null}
                  </span>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
              {Object.values(STATUS).map((s) => {
                const Icon = s.icon;
                return <span key={s.label} className="inline-flex items-center gap-1"><Icon className="h-3.5 w-3.5" aria-hidden />{s.label}</span>;
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">Paste a job description to see the match.</p>
        )}
      </div>
    </div>
  );
}
