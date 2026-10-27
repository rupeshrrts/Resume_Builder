"use client";

import { useMemo, useState } from "react";
import { Check, Lightbulb, X } from "lucide-react";
import { analyzeBullet } from "@resume/shared/analysis/bullets";
import { BULLET_EXAMPLES } from "@resume/shared/demo";
import { ScoreRing } from "../ui";

/** Live bullet-strength checker: the same rules the editor uses, running in the browser. */
export function BulletLab() {
  const [text, setText] = useState(BULLET_EXAMPLES[0].text);
  const a = useMemo(() => analyzeBullet(text), [text]);
  const score = text.trim() ? Math.round(a.strength * 100) : 0;
  const checks = [
    { ok: a.startsWithActionVerb || !!a.presentTenseVerb, label: "Starts with an action verb" },
    { ok: a.hasMetric, label: "Includes a measurable detail" },
    { ok: a.wordCount >= 8 && a.wordCount <= 35, label: "Readable length (8–35 words)" },
    { ok: a.weak.length === 0 && !a.passive, label: "No generic or passive wording" },
  ];
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-100 blur-3xl" aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Try it live</p>
          <h3 className="mt-0.5 text-lg font-bold">How strong is your bullet point?</h3>
        </div>
        <ScoreRing score={text.trim() ? score : null} size={64} label="Bullet strength" />
      </div>
      <label htmlFor="bl-text" className="sr-only">Bullet point</label>
      <textarea
        id="bl-text"
        rows={3}
        className="field relative mt-3 resize-none text-[15px]"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type or paste a resume bullet point…"
      />
      <div className="relative mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Examples">
        {BULLET_EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            onClick={() => setText(ex.text)}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${text === ex.text ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
          >
            {ex.label} example
          </button>
        ))}
      </div>
      <ul className="relative mt-4 grid gap-2 sm:grid-cols-2" aria-live="polite">
        {checks.map((c) => (
          <li key={c.label} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${c.ok ? "bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-600"}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${c.ok ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>
              {c.ok ? <Check className="h-3 w-3" strokeWidth={3} /> : <X className="h-3 w-3" strokeWidth={3} />}
            </span>
            {c.label}
          </li>
        ))}
      </ul>
      {text.trim() && a.issues.length ? (
        <p className="relative mt-3 flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {a.issues[0]}
        </p>
      ) : null}
    </div>
  );
}
