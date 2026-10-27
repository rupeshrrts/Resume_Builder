"use client";

import { useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { diffWords } from "@resume/shared/diff";
import { Notice, Spinner } from "../ui";
import { DiffView } from "./fields";
import { useEditor } from "./context";

export function SummaryAssist({ current, onAccept, onClose }: { current: string; onAccept: (t: string) => void; onClose: () => void }) {
  const ed = useEditor();
  const [targetRole, setTargetRole] = useState("");
  const [facts, setFacts] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ text: string; why: string; questions: string[]; guard: { ok: boolean; warnings: string[] } } | null>(null);
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  if (!ed.ai.available)
    return (
      <div className="mt-2">
        <Notice tone="warn">AI summaries aren&apos;t configured on this server. Aim for 2–4 sentences: role, years of experience, strongest relevant skills, one notable result.</Notice>
        <button className="btn-ghost mt-1 text-xs" onClick={onClose}>Close</button>
      </div>
    );

  async function run() {
    setLoading(true);
    setError(null);
    setConfirmed(false);
    try {
      const r = await api<NonNullable<typeof res>>("/api/ai/summary", { body: { data: ed.getData(), jobId: ed.jobId, targetRole, style: ed.style, facts } });
      setRes(r);
      setText(r.text);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The AI request failed.");
    } finally {
      setLoading(false);
    }
  }

  const parts = diffWords(current, text);
  return (
    <div className="mt-2 space-y-2 rounded-md border border-violet-200 bg-violet-50/40 p-3 text-sm" aria-live="polite">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-violet-900">Draft a summary from your resume</h4>
        <button className="btn-ghost h-7 px-2 text-xs" onClick={onClose}>Close</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <div>
          <label className="label" htmlFor="sa-role">Target role (optional)</label>
          <input id="sa-role" className="field" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} placeholder={ed.jobId ? "Uses the linked job if empty" : "e.g. .NET Developer"} />
        </div>
        <button className="btn-primary self-end" onClick={run} disabled={loading}>{res ? "Regenerate" : "Generate"}</button>
      </div>
      {loading ? <Spinner label="Writing from your experience…" /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {res && !loading ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded border border-slate-200 bg-white p-2">
              <p className="text-[11px] font-medium uppercase text-slate-500">Current</p>
              {current ? <DiffView parts={parts} side="old" /> : <em className="text-slate-400">(empty)</em>}
            </div>
            <div className="rounded border border-slate-200 bg-white p-2">
              <p className="text-[11px] font-medium uppercase text-slate-500">Suggested (editable)</p>
              <textarea className="field mt-1" rows={5} value={text} onChange={(e) => setText(e.target.value)} aria-label="Suggested summary" />
            </div>
          </div>
          <p className="text-xs text-slate-600"><span className="font-medium">Why: </span>{res.why}</p>
          {!res.guard.ok ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <p className="font-medium">Needs your confirmation</p>
              <ul className="list-disc pl-4">{res.guard.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              <label className="mt-1 flex items-center gap-1.5">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> These details are accurate
              </label>
            </div>
          ) : null}
          {res.questions.length ? (
            <div>
              <p className="text-xs font-medium">Facts that would improve it (answer only what you know):</p>
              <ul className="list-disc pl-5 text-xs text-slate-700">{res.questions.map((q) => <li key={q}>{q}</li>)}</ul>
              <textarea className="field mt-1" rows={2} value={facts} onChange={(e) => setFacts(e.target.value)} aria-label="Your answers" />
            </div>
          ) : null}
          <button className="btn-primary h-7 text-xs" disabled={!text.trim() || (!res.guard.ok && !confirmed)} onClick={() => onAccept(text.trim())}>
            Accept summary
          </button>
        </>
      ) : null}
    </div>
  );
}
