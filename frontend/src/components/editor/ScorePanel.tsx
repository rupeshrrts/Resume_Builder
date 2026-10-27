"use client";

import { useState } from "react";
import type { QualityReport } from "@resume/shared/analysis/quality";
import type { TextLocation } from "@resume/shared/analysis/text";
import { Badge, Bar, Notice, ScoreRing } from "../ui";

export function ScorePanel({ report, onGo, onImprove }: { report: QualityReport; onGo: (l: TextLocation) => void; onImprove: (bulletId: string) => void }) {
  const [openHow, setOpenHow] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const imps = showAll ? report.improvements : report.improvements.slice(0, 8);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={report.overall} label="Overall resume score" />
        <div className="text-sm">
          <p className="font-semibold">Resume quality: {report.overall}/100</p>
          <p className="text-slate-600">Weighted average of the subscores below. Recalculates as you edit.</p>
        </div>
      </div>

      <ul className="space-y-2.5">
        {report.subscores.map((s) => (
          <li key={s.key} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{s.label}</span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                weight {Math.round(s.weight * 100)}%
                <span className="w-8 text-right text-sm font-semibold text-slate-900">{s.score ?? "–"}</span>
              </span>
            </div>
            <Bar value={s.score} />
            <button className="mt-0.5 text-[11px] text-brand-700 underline" onClick={() => setOpenHow(openHow === s.key ? null : s.key)} aria-expanded={openHow === s.key}>
              Why this score?
            </button>
            {openHow === s.key ? (
              <div className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-700">
                <ul className="list-disc space-y-0.5 pl-4">{s.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                <p className="mt-1.5 text-slate-500"><span className="font-medium">How it&apos;s calculated: </span>{s.how}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <section aria-labelledby="imp-h">
        <h3 id="imp-h" className="mb-1.5 text-sm font-semibold">Highest-impact improvements</h3>
        {imps.length === 0 ? <p className="text-sm text-emerald-700">Nothing significant to fix.</p> : null}
        <ol className="space-y-2">
          {imps.map((imp, i) => (
            <li key={i} className="rounded-md border border-slate-200 p-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{imp.message}</p>
                  {imp.fix !== imp.message ? <p className="text-slate-600">{imp.fix}</p> : null}
                </div>
                <Badge tone="blue" title="Estimated overall points gained">+{imp.impact}</Badge>
              </div>
              {imp.loc ? (
                <div className="mt-1.5 flex gap-1.5">
                  <button className="btn-secondary h-7 text-xs" onClick={() => onGo(imp.loc!)}>Go to</button>
                  {imp.aiAssist && imp.loc.bulletId ? (
                    <button className="btn-secondary h-7 text-xs text-violet-800" onClick={() => onImprove(imp.loc!.bulletId!)}>✦ Improve with AI</button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
        {report.improvements.length > 8 ? (
          <button className="btn-ghost mt-1 px-0 text-xs text-brand-700" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Show fewer" : `Show all ${report.improvements.length}`}
          </button>
        ) : null}
      </section>

      {report.verify.length ? (
        <section aria-labelledby="verify-h">
          <h3 id="verify-h" className="mb-1.5 text-sm font-semibold">Check these claims</h3>
          <p className="mb-1.5 text-xs text-slate-500">Statements a recruiter may question. Make sure each one is accurate and you can explain it.</p>
          <ul className="space-y-1.5">
            {report.verify.map((v, i) => (
              <li key={i} className="rounded border border-amber-200 bg-amber-50 p-2 text-xs">
                <p className="text-amber-900">{v.reason}</p>
                <p className="mt-0.5 text-slate-700">“{v.text.length > 120 ? `${v.text.slice(0, 120)}…` : v.text}”</p>
                <button className="mt-1 text-brand-700 underline" onClick={() => onGo(v.loc)}>Go to</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.aiContentCount ? (
        <p className="text-xs text-slate-600">
          <Badge tone="violet">✦ AI-assisted</Badge> {report.aiContentCount} statement(s) were rewritten with AI and accepted by you. Your original wording is kept and can be restored.
        </p>
      ) : null}

      <Notice>
        Scores follow the documented rules above and estimate how clearly your resume presents your experience. They are not any employer&apos;s ATS score and don&apos;t predict
        interviews or shortlisting.
      </Notice>
    </div>
  );
}
