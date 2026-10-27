"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import type { Job } from "@resume/shared/schema/job";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { matchResume } from "@resume/shared/analysis/match";
import { analyzeBullet } from "@resume/shared/analysis/bullets";
import { applyProposals, proposeTailoring, type Proposal, type TailorDoc } from "@resume/shared/tailor";
import { diffLines, diffWords } from "@resume/shared/diff";
import { api, ApiError } from "@/lib/api-client";
import { Badge, Modal, Notice, ScoreRing, Spinner } from "../ui";
import { DiffView } from "./fields";

interface AiAlt {
  style: string;
  text: string;
  why: string;
  guard: { ok: boolean; warnings: string[] };
}

/**
 * Review queue for one-click tailoring: safe reorderings (pre-selected) plus optional AI
 * rewrites, each shown before/after. Nothing changes until the user applies, and the whole
 * batch is one undo step.
 */
export function TailorReview({
  open,
  onClose,
  doc,
  job,
  aiAvailable,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  doc: TailorDoc;
  job: Job;
  aiAvailable: boolean;
  onApply: (next: TailorDoc, count: number) => void;
}) {
  const analysis = useMemo(() => analyzeJob(job.description), [job.description]);
  const base = useMemo(() => proposeTailoring(doc, analysis), [doc, analysis]);
  const [aiProposals, setAiProposals] = useState<Proposal[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = [...base, ...aiProposals];
  const isOn = (p: Proposal) => (selected[p.id] ?? p.safe) && (!p.warnings?.length || confirmed[p.id]);
  const chosen = all.filter(isOn);
  const before = useMemo(() => matchResume(doc.data, analysis).score, [doc.data, analysis]);
  const after = useMemo(() => matchResume(applyProposals(doc, chosen).data, analysis).score, [doc, chosen, analysis]);

  async function addAi() {
    setBusy(true);
    setError(null);
    const found: Proposal[] = [];
    try {
      const s = await api<{ text: string; why: string; guard: { warnings: string[] } }>("/api/ai/summary", {
        body: { data: doc.data, jobId: job.id, targetRole: job.title, style: doc.settings.writingStyle, facts: "" },
      });
      if (s.text.trim() && s.text.trim() !== doc.data.summary.text.trim()) {
        found.push({
          id: "ai-summary",
          kind: "summary",
          title: "Rewrite your summary for this job",
          why: s.why,
          before: doc.data.summary.text || "(no summary)",
          after: s.text,
          safe: false,
          warnings: s.guard.warnings,
          apply: (x) => ({ ...x, data: { ...x.data, summary: { text: s.text, origin: "ai", sourceText: x.data.summary.sourceText ?? x.data.summary.text } } }),
        });
      }
      // Up to three of the weakest bullets in the first two roles.
      const weak = doc.data.experience
        .slice(0, 2)
        .flatMap((e) => e.bullets.map((b) => ({ e, b, a: analyzeBullet(b.text) })))
        .filter((x) => x.b.text.trim() && x.a.strength < 0.75)
        .sort((x, y) => x.a.strength - y.a.strength)
        .slice(0, 3);
      for (const { e, b } of weak) {
        const r = await api<{ alternatives: AiAlt[]; alreadyStrong: boolean }>("/api/ai/bullet", {
          body: { data: doc.data, bulletId: b.id, jobId: job.id, style: doc.settings.writingStyle, facts: "" },
        });
        if (r.alreadyStrong) continue;
        const alt = r.alternatives.find((a) => a.style === doc.settings.writingStyle) ?? r.alternatives[0];
        if (!alt) continue;
        found.push({
          id: `ai-bullet-${b.id}`,
          kind: "bullet-rewrite",
          title: `Strengthen a bullet in “${e.title || e.company}”`,
          why: alt.why,
          before: b.text,
          after: alt.text,
          safe: false,
          warnings: alt.guard.warnings,
          apply: (x) => ({
            ...x,
            data: {
              ...x.data,
              experience: x.data.experience.map((ex) =>
                ex.id === e.id ? { ...ex, bullets: ex.bullets.map((xb) => (xb.id === b.id ? { ...xb, text: alt.text, origin: "ai" as const, sourceText: xb.sourceText ?? xb.text } : xb)) } : ex,
              ),
            },
          }),
        });
      }
      setAiProposals(found);
      if (!found.length) setError("The AI didn't find anything worth rewriting.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "AI suggestions failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Tailor for ${[job.title, job.company].filter(Boolean).join(" at ") || "this job"}`} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-gradient-to-r from-brand-50 to-violet-50 p-4">
          <ScoreRing score={before} size={56} label="Current job match" />
          <ArrowRight className="h-5 w-5 text-slate-400" aria-hidden />
          <ScoreRing score={after} size={56} label="Job match after the selected changes" />
          <div className="min-w-48 flex-1 text-sm">
            <p className="font-bold">Job match {before} → {after}</p>
            <p className="text-slate-600">
              Reordering leads with your strongest evidence. It mostly helps the human reader; keyword scores rise only when wording changes. Nothing new is claimed.
            </p>
          </div>
        </div>

        {all.length === 0 ? <Notice tone="success">Your resume is already ordered well for this job. Nothing to change.</Notice> : null}

        <ul className="max-h-[55vh] space-y-3 overflow-y-auto pr-1 scroll-thin">
          {all.map((p) => {
            const on = isOn(p);
            const needsConfirm = !!p.warnings?.length;
            const lines = p.kind.endsWith("order") || p.kind === "section-order";
            const parts = lines ? diffLines(p.before, p.after) : diffWords(p.before, p.after);
            return (
              <li key={p.id} className={`rounded-xl border p-4 transition ${on ? "border-brand-300 bg-white shadow-sm" : "border-slate-200 bg-slate-50/60"}`}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 accent-[var(--color-brand-600)]"
                    checked={on}
                    disabled={needsConfirm && !confirmed[p.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, [p.id]: e.target.checked }))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {p.title}
                      {p.safe ? <Badge tone="green"><ShieldCheck className="h-3 w-3" /> Safe</Badge> : <Badge tone="violet"><Sparkles className="h-3 w-3" /> AI</Badge>}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-600">{p.why}</span>
                  </span>
                </label>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-2.5">
                    <p className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Before</p>
                    <pre className="whitespace-pre-wrap font-sans">{lines ? p.before : <DiffView parts={parts} side="old" />}</pre>
                  </div>
                  <div className="rounded-lg bg-emerald-50/60 p-2.5">
                    <p className="mb-1 font-semibold uppercase tracking-wide text-emerald-700">After</p>
                    <pre className="whitespace-pre-wrap font-sans">{lines ? p.after : <DiffView parts={parts} side="new" />}</pre>
                  </div>
                </div>
                {needsConfirm ? (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                    <ul className="list-disc pl-4">{p.warnings!.map((w) => <li key={w}>{w}</li>)}</ul>
                    <label className="mt-1 flex items-center gap-1.5 font-medium">
                      <input type="checkbox" checked={!!confirmed[p.id]} onChange={(e) => setConfirmed((c) => ({ ...c, [p.id]: e.target.checked }))} /> These details are accurate
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        {aiAvailable && !aiProposals.length ? (
          <button className="btn-secondary w-full text-violet-800" onClick={addAi} disabled={busy}>
            <WandSparkles className="h-4 w-4" aria-hidden /> Also suggest AI rewrites of my summary and weakest bullets
          </button>
        ) : null}
        {!aiAvailable ? <p className="text-xs text-slate-500">AI rewrites aren&apos;t available right now; the changes above still apply.</p> : null}
        {busy ? <Spinner label="Asking the AI to rewrite using only your facts…" /> : null}
        {error ? <Notice tone="warn">{error}</Notice> : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
          <p className="text-sm text-slate-600">{chosen.length} of {all.length} change(s) selected. You can undo them all in one step.</p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" disabled={!chosen.length} onClick={() => onApply(applyProposals(doc, chosen), chosen.length)}>
              Apply {chosen.length} change{chosen.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
