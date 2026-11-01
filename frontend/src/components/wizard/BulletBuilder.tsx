"use client";

import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { notesToBullet } from "@resume/shared/compose";
import type { ResumeSettings } from "@resume/shared/schema/resume";
import { api, ApiError } from "@/lib/api-client";
import { BULLETS_FROM_NOTES } from "@/lib/features";
import { Notice, Spinner } from "../ui";

/** Tidies a typed bullet without changing its words: no leading "•"/"-", capital first letter, full stop. */
function tidy(text: string): string {
  const s = text.trim().replace(/^([-•*▪●◦]|\d+[.)])\s*/, "").replace(/\s+/g, " ");
  if (!s) return "";
  const capped = s[0].toUpperCase() + s.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/**
 * One line to add a bullet in the user's own words (shown in the list below it, where it can be edited or
 * removed), or, when BULLETS_FROM_NOTES is on, free-form notes turned into one bullet (with AI when configured).
 * Nothing is added beyond what the user typed.
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
  const [mode, setMode] = useState<"typed" | "notes">("typed");
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<{ text: string; warnings: string[]; ai: boolean }[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const what = purposeLabel ? "project" : "role";

  const add = () => {
    const bullet = tidy(text);
    if (!bullet) return;
    onAdd(bullet);
    setText("");
  };

  // Whatever is pasted becomes one bullet, never several.
  const basicDraft = () => {
    const t = notesToBullet(notes, current);
    return t ? [{ text: t, warnings: [], ai: false }] : [];
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
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <p className="text-xs leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-800">Bullet points:</span> one thing you did in this {what} per line. For example:{" "}
          <span className="italic text-slate-700">“Built an order-tracking API using Node.js, used by 25,000 customers.”</span>
        </p>
        {BULLETS_FROM_NOTES ? (
          <button type="button" className="shrink-0 whitespace-nowrap text-xs font-semibold text-brand-700 hover:underline" onClick={() => setMode((m) => (m === "typed" ? "notes" : "typed"))}>
            {mode === "typed" ? "From my notes" : "Type it myself"}
          </button>
        ) : null}
      </div>

      {mode === "typed" ? (
        <div className="flex gap-2">
          <input
            className="field min-w-0 flex-1"
            aria-label={`New bullet point for this ${what}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              add();
            }}
            placeholder="Type what you did, then press Add"
          />
          <button type="button" className="btn-primary shrink-0" disabled={!text.trim()} onClick={add}>
            <Plus className="h-4 w-4" aria-hidden /> Add
          </button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
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
