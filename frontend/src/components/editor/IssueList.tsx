"use client";

import type { Issue, Severity } from "@resume/shared/analysis/ats";
import { Badge } from "../ui";

const TONE: Record<Severity, "red" | "amber" | "slate" | "blue"> = { critical: "red", major: "amber", minor: "slate", info: "blue" };

export function IssueList({ issues, onGo }: { issues: Issue[]; onGo?: (i: Issue) => void }) {
  if (!issues.length) return <p className="text-sm text-emerald-700">No issues found.</p>;
  return (
    <ul className="space-y-2">
      {issues.map((i) => (
        <li key={i.id} className="rounded-md border border-slate-200 p-2.5 text-sm">
          <div className="flex items-start gap-2">
            <Badge tone={TONE[i.severity]}>{i.severity}</Badge>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-900">{i.message}</p>
              <p className="text-slate-600">{i.fix}</p>
            </div>
            {onGo && i.loc ? (
              <button className="btn-ghost shrink-0 px-2 text-xs" onClick={() => onGo(i)}>
                Go to
              </button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
