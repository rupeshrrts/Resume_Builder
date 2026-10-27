"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { diffWords } from "@resume/shared/diff";
import { Badge, Notice, Spinner } from "../ui";
import { DiffView } from "./fields";
import { useEditor } from "./context";

interface Suggestion {
  style: "conservative" | "balanced" | "achievement";
  text: string;
  why: string;
  guard: { ok: boolean; warnings: string[] };
}

const STYLE_LABEL = { conservative: "Conservative", balanced: "Balanced", achievement: "Achievement-focused" };

/**
 * AI rewrite of one bullet. Shows the original next to each alternative with a word diff,
 * explains each change, lists anything the fact guard couldn't trace to the user's material,
 * and asks for missing facts instead of inventing them.
 */
export function BulletAssist({ bulletId, original, onAccept, onClose }: { bulletId: string; original: string; onAccept: (text: string) => void; onClose: () => void }) {
  const ed = useEditor();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ alternatives: Suggestion[]; questions: string[]; alreadyStrong: boolean } | null>(null);
  const [facts, setFacts] = useState("");
  const [editing, setEditing] = useState<{ i: number; text: string } | null>(null);
  const [confirmed, setConfirmed] = useState<Record<number, boolean>>({});

  async function run(withFacts: string) {
    setLoading(true);
    setError(null);
    setEditing(null);
    setConfirmed({});
    try {
      setRes(await api("/api/ai/bullet", { body: { data: ed.getData(), bulletId, jobId: ed.jobId, style: ed.style, facts: withFacts } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The AI request failed.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (ed.ai.available) run("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ed.ai.available)
    return (
      <div className="mt-2">
        <Notice tone="warn">AI suggestions aren&apos;t available right now. Use the tips under the bullet to make it stronger yourself.</Notice>
        <button className="btn-ghost mt-1 text-xs" onClick={onClose}>Close</button>
      </div>
    );

  const sorted = res ? [...res.alternatives].sort((a, b) => (a.style === ed.style ? -1 : b.style === ed.style ? 1 : 0)) : [];

  return (
    <div className="mt-2 space-y-3 rounded-md border border-violet-200 bg-violet-50/40 p-3" aria-live="polite">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-violet-900">AI suggestions</h4>
        <button className="btn-ghost h-7 px-2 text-xs" onClick={onClose}>Close</button>
      </div>
      {loading ? <Spinner label="Writing alternatives from your own facts…" /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {res && !loading ? (
        <>
          {res.alreadyStrong ? <Notice tone="success">This bullet is already strong. The alternatives below are optional.</Notice> : null}
          <ul className="space-y-2">
            {sorted.map((s, i) => {
              const needsConfirm = !s.guard.ok;
              const text = editing?.i === i ? editing.text : s.text;
              const parts = diffWords(original, text);
              return (
                <li key={i} className="rounded-md border border-slate-200 bg-white p-2.5 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone="violet">{STYLE_LABEL[s.style]}</Badge>
                    {s.style === ed.style ? <Badge tone="blue">Your preferred style</Badge> : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase text-slate-500">Original</p>
                      <p className="text-slate-700"><DiffView parts={parts} side="old" /></p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium uppercase text-slate-500">Suggested</p>
                      {editing?.i === i ? (
                        <textarea className="field" rows={3} value={editing.text} onChange={(e) => setEditing({ i, text: e.target.value })} aria-label="Edit suggestion" />
                      ) : (
                        <p className="text-slate-900"><DiffView parts={parts} side="new" /></p>
                      )}
                    </div>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-600"><span className="font-medium">Why: </span>{s.why}</p>
                  {needsConfirm ? (
                    <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                      <p className="font-medium">Needs your confirmation</p>
                      <ul className="list-disc pl-4">{s.guard.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                      <label className="mt-1 flex items-center gap-1.5">
                        <input type="checkbox" checked={!!confirmed[i]} onChange={(e) => setConfirmed((c) => ({ ...c, [i]: e.target.checked }))} />
                        These details are accurate
                      </label>
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button className="btn-primary h-7 text-xs" disabled={(needsConfirm && !confirmed[i]) || !text.trim()} onClick={() => onAccept(text.trim())}>
                      Accept
                    </button>
                    {editing?.i === i ? null : (
                      <button className="btn-secondary h-7 text-xs" onClick={() => setEditing({ i, text: s.text })}>Edit first</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {res.questions.length ? (
            <div className="rounded-md border border-slate-200 bg-white p-2.5 text-sm">
              <p className="font-medium">Add facts to make it stronger</p>
              <p className="text-xs text-slate-500">Answer only what you know. Leave anything blank rather than guessing.</p>
              <ul className="my-1.5 list-disc pl-5 text-slate-700">{res.questions.map((q) => <li key={q}>{q}</li>)}</ul>
              <label className="sr-only" htmlFor={`facts-${bulletId}`}>Your answers</label>
              <textarea id={`facts-${bulletId}`} className="field" rows={2} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder="e.g. The API handled about 2,000 requests per minute; release time went from 2 days to 4 hours." />
              <button className="btn-secondary mt-1.5 h-7 text-xs" disabled={!facts.trim() || loading} onClick={() => run(facts)}>Rewrite with my answers</button>
            </div>
          ) : null}
          <button className="btn-ghost h-7 px-2 text-xs" onClick={() => run(facts)} disabled={loading}>Regenerate</button>
        </>
      ) : null}
    </div>
  );
}
