"use client";

import { useState } from "react";
import { Lightbulb, Plus, Sparkles, WandSparkles } from "lucide-react";
import { INTENTS, composeBullet, notesToBullet } from "@resume/shared/compose";
import { analyzeBullet } from "@resume/shared/analysis/bullets";
import type { ResumeSettings } from "@resume/shared/schema/resume";
import { api, ApiError } from "@/lib/api-client";
import { Notice, Spinner } from "../ui";

/**
 * Helps the user write one strong bullet at a time from structured answers (what, how,
 * result), or turns free-form notes into one bullet (with AI when configured). Nothing is
 * added beyond what the user typed.
 */
export function BulletBuilder({
  current,
  context,
  aiAvailable,
  style,
  onAdd,
  purposeLabel,
}: {
  current: boolean;
  context: string;
  aiAvailable: boolean;
  style: ResumeSettings["writingStyle"];
  onAdd: (text: string, ai?: { sourceText: string }) => void;
  purposeLabel?: string;
}) {
  const [mode, setMode] = useState<"guided" | "notes">("guided");
  const [intent, setIntent] = useState(INTENTS[0].id);
  const [verb, setVerb] = useState(INTENTS[0].verbs[0]);
  const [what, setWhat] = useState("");
  const [how, setHow] = useState("");
  const [purpose, setPurpose] = useState("");
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<{ text: string; warnings: string[]; ai: boolean }[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);

  const preview = composeBullet({ verb, what, how, result, purpose }, current);
  const a = preview ? analyzeBullet(preview) : null;
  const verbs = INTENTS.find((i) => i.id === intent)!.verbs;

  // Whatever is pasted becomes one bullet, never several.
  const basicDraft = () => {
    const text = notesToBullet(notes, current);
    return text ? [{ text, warnings: [], ai: false }] : [];
  };

  async function fromNotes() {
    setError(null);
    setQuestions([]);
    if (!aiAvailable) {
      setDrafts(basicDraft());
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ bullets: { text: string; guard: { warnings: string[] } }[]; questions: string[] }>("/api/ai/bullets-from-notes", {
        body: { notes, context, current, style },
      });
      setDrafts(r.bullets.map((b) => ({ text: b.text, warnings: b.guard.warnings, ai: true })));
      setQuestions(r.questions);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.message} Using the basic writer instead.` : "AI failed; using the basic writer instead.");
      setDrafts(basicDraft());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50/60 to-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-brand-800"><WandSparkles className="h-4 w-4" aria-hidden /> Write a bullet point</p>
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-semibold" role="tablist">
          {(["guided", "notes"] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={`rounded-md px-2.5 py-1 ${mode === m ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
              {m === "guided" ? "Step by step" : "From my notes"}
            </button>
          ))}
        </div>
      </div>

      {mode === "guided" ? (
        <div className="space-y-3">
          <div>
            <p className="label">What kind of thing did you do?</p>
            <div className="flex flex-wrap gap-1.5">
              {INTENTS.map((i) => (
                <button
                  key={i.id}
                  onClick={() => {
                    setIntent(i.id);
                    setVerb(i.verbs[0]);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${intent === i.id ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
            <div>
              <label className="label" htmlFor="bb-verb">Starting verb</label>
              <select id="bb-verb" className="field" value={verb} onChange={(e) => setVerb(e.target.value)}>
                {verbs.map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="bb-what">What exactly? <span className="font-normal text-slate-400">(required)</span></label>
              <input id="bb-what" className="field" value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. an order-tracking API for the mobile app" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {purposeLabel ? (
              <div>
                <label className="label" htmlFor="bb-purpose">{purposeLabel}</label>
                <input id="bb-purpose" className="field" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. let customers track deliveries" />
              </div>
            ) : null}
            <div>
              <label className="label" htmlFor="bb-how">How? Tools or method</label>
              <input id="bb-how" className="field" value={how} onChange={(e) => setHow(e.target.value)} placeholder="e.g. Node.js and PostgreSQL" />
            </div>
            <div className={purposeLabel ? "sm:col-span-2" : ""}>
              <label className="label" htmlFor="bb-result">Result or scale <span className="font-normal text-slate-400">(only real numbers)</span></label>
              <input id="bb-result" className="field" value={result} onChange={(e) => setResult(e.target.value)} placeholder="e.g. used by 25,000 customers a month · cutting load time from 4s to 1.5s" />
            </div>
          </div>
          {preview ? (
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Preview</p>
              <p className="mt-0.5 text-sm text-slate-900">{preview}</p>
              {a && !a.hasMetric ? (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-800">
                  <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Have a real number (how many, how much, how fast)? Add it under Result. It makes the biggest difference.
                </p>
              ) : null}
            </div>
          ) : null}
          <button
            className="btn-primary"
            disabled={!preview}
            onClick={() => {
              onAdd(preview);
              setWhat("");
              setHow("");
              setResult("");
              setPurpose("");
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add bullet
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="label" htmlFor="bb-notes">Describe what you did, in your own words</label>
          <textarea
            id="bb-notes"
            className="field min-h-28"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={"e.g. I handled the billing APIs in .NET. Moved our reports from Excel to Power BI so managers get them daily. Trained 2 new joiners."}
          />
          <button className="btn-primary" disabled={notes.trim().length < 10 || busy} onClick={fromNotes}>
            <Sparkles className="h-4 w-4" aria-hidden /> {aiAvailable ? "Write bullet with AI" : "Turn into a bullet"}
          </button>
          {busy ? <Spinner label="Writing from your notes…" /> : null}
          {error ? <Notice tone="warn">{error}</Notice> : null}
          {drafts.length ? (
            <ul className="space-y-2">
              {drafts.map((d, i) => (
                <li key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p>{d.text}</p>
                    {d.warnings.length ? <p className="mt-1 text-xs text-amber-800">{d.warnings.join(" ")}</p> : null}
                  </div>
                  <button
                    className="btn-secondary h-8 shrink-0 text-xs"
                    onClick={() => {
                      onAdd(d.text, d.ai ? { sourceText: notes.slice(0, 600) } : undefined);
                      setDrafts((xs) => xs.filter((_, j) => j !== i));
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Add
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {questions.length ? (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Add these to your notes if you know them, then write again:</p>
              <ul className="mt-1 list-disc pl-4">{questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
