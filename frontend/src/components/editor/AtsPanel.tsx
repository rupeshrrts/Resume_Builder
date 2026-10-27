"use client";

import { useMemo, useState } from "react";
import type { AtsResult, Issue } from "@resume/shared/analysis/ats";
import type { ResumeData, ResumeSettings } from "@resume/shared/schema/resume";
import type { TextLocation } from "@resume/shared/analysis/text";
import { buildDocument } from "@resume/shared/render/model";
import { renderText } from "@resume/shared/render/text";
import { ScoreRing } from "../ui";
import { IssueList } from "./IssueList";

export function AtsPanel({ ats, data, settings, onGo, spellingPending }: { ats: AtsResult; data: ResumeData; settings: ResumeSettings; onGo: (l: TextLocation) => void; spellingPending: boolean }) {
  const [showText, setShowText] = useState(false);
  const text = useMemo(() => (showText ? renderText(buildDocument(data, settings)) : ""), [showText, data, settings]);
  const [showInfo, setShowInfo] = useState(false);
  const main = ats.issues.filter((i) => i.severity !== "info");
  const info = ats.issues.filter((i) => i.severity === "info");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <ScoreRing score={ats.score} label="ATS readability score" />
        <div className="text-sm">
          <p className="font-semibold">ATS readability: {ats.score}/100</p>
          <p className="text-slate-600">
            Checks for things that commonly trip up applicant tracking systems. Systems differ, so passing these checks can&apos;t guarantee how any employer&apos;s system reads
            your resume.
          </p>
        </div>
      </div>
      <section>
        <h3 className="mb-1.5 text-sm font-semibold">Issues to fix ({main.length})</h3>
        <IssueList issues={main} onGo={(i: Issue) => i.loc && onGo(i.loc)} />
        {spellingPending ? <p className="mt-1 text-xs text-slate-500">Checking spelling…</p> : null}
      </section>
      {info.length ? (
        <section>
          <button className="text-sm font-semibold text-brand-700 underline" onClick={() => setShowInfo((s) => !s)} aria-expanded={showInfo}>
            {showInfo ? "Hide" : "Show"} {info.length} note(s)
          </button>
          {showInfo ? <div className="mt-1.5"><IssueList issues={info} onGo={(i: Issue) => i.loc && onGo(i.loc)} /></div> : null}
        </section>
      ) : null}
      <section>
        <h3 className="mb-1 text-sm font-semibold">Passed</h3>
        <ul className="space-y-0.5 text-sm text-slate-700">{ats.passed.map((p) => <li key={p}>✓ {p}</li>)}</ul>
      </section>
      <section>
        <button className="btn-secondary" onClick={() => setShowText((s) => !s)} aria-expanded={showText}>
          {showText ? "Hide" : "Show"} plain-text view
        </button>
        {showText ? (
          <>
            <p className="mt-2 text-xs text-slate-500">Roughly what a parser that strips formatting would read, in order.</p>
            <pre className="mt-1 max-h-[480px] overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{text}</pre>
          </>
        ) : null}
      </section>
    </div>
  );
}
