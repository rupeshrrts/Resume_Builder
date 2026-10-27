"use client";

import { useState } from "react";
import { WandSparkles } from "lucide-react";
import type { Job } from "@resume/shared/schema/job";
import type { MatchResult, SkillMatch } from "@resume/shared/analysis/match";
import { SCORING_RULES } from "@resume/shared/analysis/match";
import type { TextLocation } from "@resume/shared/analysis/text";
import type { SkillGroup } from "@resume/shared/schema/resume";
import { Badge, Bar, Modal, Notice, ScoreRing } from "../ui";
import { JobForm } from "../JobForm";

const IMP_TONE = { essential: "red", responsibility: "amber", mentioned: "slate", preferred: "blue" } as const;
const IMP_LABEL = { essential: "Required", responsibility: "Used in role", mentioned: "Mentioned", preferred: "Preferred" };

export function JobPanel(props: {
  kind: "master" | "tailored";
  jobs: Job[];
  jobId: string | null;
  match: MatchResult | null;
  skills: SkillGroup[];
  onSelectJob: (id: string | null) => void;
  onJobsChange: (jobs: Job[]) => void;
  onAddSkill: (name: string, groupId: string | null) => void;
  onTailor: (jobId: string) => Promise<void>;
  onOpenTailor?: () => void;
  onGo: (l: TextLocation) => void;
}) {
  const { jobs, jobId, match } = props;
  const job = jobs.find((j) => j.id === jobId) ?? null;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmSkill, setConfirmSkill] = useState<SkillMatch | null>(null);
  const [group, setGroup] = useState<string>("");
  const [showRules, setShowRules] = useState(false);
  const [busy, setBusy] = useState(false);

  const missing = match?.skills.filter((s) => s.status === "missing") ?? [];
  const listed = match?.skills.filter((s) => s.status === "listed") ?? [];
  const strong = match?.skills.filter((s) => s.status === "strong") ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="job-select">Job to match against</label>
          <select id="job-select" className="field" value={jobId ?? ""} onChange={(e) => props.onSelectJob(e.target.value || null)}>
            <option value="">None</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{[j.title || "Untitled", j.company].filter(Boolean).join(" · ")}</option>)}
          </select>
        </div>
        <button className="btn-secondary" onClick={() => setAdding(true)}>New job</button>
        {job ? <button className="btn-ghost" onClick={() => setEditing(true)}>Edit job</button> : null}
      </div>

      {!job ? (
        <Notice>Add a job description to see how well this resume evidences its requirements, what&apos;s missing, and what to clarify.</Notice>
      ) : null}

      {job && props.kind === "master" ? (
        <div className="rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 p-4 text-white shadow-[var(--shadow-lift)]">
          <p className="font-bold">One-click tailoring</p>
          <p className="mt-0.5 text-sm text-brand-100">Makes a tailored copy for this job (your master stays untouched), then shows each suggested change for you to approve.</p>
          <button className="btn mt-3 bg-white text-brand-700 hover:bg-brand-50" disabled={busy} onClick={async () => { setBusy(true); try { await props.onTailor(job.id); } finally { setBusy(false); } }}>
            <WandSparkles className="h-4 w-4" aria-hidden /> {busy ? "Creating copy…" : "Tailor a copy for this job"}
          </button>
        </div>
      ) : null}
      {job && props.kind === "tailored" && props.onOpenTailor ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-brand-50 to-violet-50 p-4">
          <div className="text-sm">
            <p className="font-bold text-slate-900">One-click tailoring</p>
            <p className="text-slate-600">Reorder your strongest evidence for this job and, optionally, get AI rewrites. You approve every change.</p>
          </div>
          <button className="btn-primary" onClick={props.onOpenTailor}><WandSparkles className="h-4 w-4" aria-hidden /> Tailor now</button>
        </div>
      ) : null}

      {job && match ? (
        <>
          <div className="flex items-center gap-4">
            <ScoreRing score={match.score} label="Job match score" />
            <div className="text-sm">
              <p className="font-semibold">Job match: {match.score}/100</p>
              <p className="text-slate-600">How much of the posting your resume shows evidence for. Not a prediction of the employer&apos;s decision.</p>
              <button className="text-xs text-brand-700 underline" onClick={() => setShowRules((s) => !s)} aria-expanded={showRules}>How is this calculated?</button>
            </div>
          </div>
          {showRules ? <ul className="list-disc space-y-1 rounded bg-slate-50 py-2 pl-6 pr-2 text-xs text-slate-700">{SCORING_RULES.map((r) => <li key={r}>{r}</li>)}</ul> : null}
          <ul className="space-y-2">
            {match.components.map((c) => (
              <li key={c.key} className="text-sm">
                <div className="flex justify-between"><span className="font-medium">{c.label}</span><span className="font-semibold">{c.score === null ? "n/a" : Math.round(c.score)}</span></div>
                <Bar value={c.score === null ? null : Math.round(c.score)} />
                <p className="text-xs text-slate-500">{c.detail}</p>
              </li>
            ))}
          </ul>

          {match.recommendations.length ? (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold">Recommendations</h3>
              <ul className="space-y-1.5">
                {match.recommendations.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <Badge tone={r.priority === "high" ? "red" : r.priority === "medium" ? "amber" : "slate"}>{r.priority}</Badge>
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <SkillGroupList
            title={`Not found on your resume (${missing.length})`}
            help="Add a skill only if you have genuinely used it. Unsupported skills are never added for you."
            items={missing}
            onGo={props.onGo}
            action={(s) => <button className="btn-secondary h-7 shrink-0 text-xs" onClick={() => { setConfirmSkill(s); setGroup(props.skills[0]?.id ?? ""); }}>I have this</button>}
          />
          <SkillGroupList title={`Listed but not shown in your work (${listed.length})`} help="Half credit. Add a bullet that shows how you used it, if true." items={listed} onGo={props.onGo} />
          <SkillGroupList title={`Shown in your experience or projects (${strong.length})`} items={strong} onGo={props.onGo} />

          {match.terminology.length ? (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Wording differences</h3>
              <ul className="space-y-1 text-sm">
                {match.terminology.map((t) => <li key={t.skill}>Posting: “{t.jobTerm}”, your resume: “{t.resumeTerm}”. Use the posting's term only if it describes the same thing.</li>)}
              </ul>
            </section>
          ) : null}

          {match.keyphrases.length ? (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Recurring phrases in the posting</h3>
              <div className="flex flex-wrap gap-1.5">
                {match.keyphrases.map((k) => (
                  <Badge key={k.phrase} tone={k.found ? "green" : "slate"} title={k.found ? `Found in: ${k.where}` : "Not found"}>
                    {k.found ? "✓" : "○"} {k.phrase}
                  </Badge>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a job" wide>
        <JobForm
          onCancel={() => setAdding(false)}
          onSaved={(j) => {
            props.onJobsChange([j, ...jobs]);
            props.onSelectJob(j.id);
            setAdding(false);
          }}
        />
      </Modal>
      <Modal open={editing} onClose={() => setEditing(false)} title="Edit job" wide>
        {job ? (
          <JobForm
            initial={job}
            onCancel={() => setEditing(false)}
            onSaved={(j) => {
              props.onJobsChange(jobs.map((x) => (x.id === j.id ? j : x)));
              setEditing(false);
            }}
          />
        ) : null}
      </Modal>
      <Modal open={!!confirmSkill} onClose={() => setConfirmSkill(null)} title={`Add “${confirmSkill?.name}” to your skills?`}>
        {confirmSkill ? (
          <div className="space-y-3 text-sm">
            <Notice tone="warn">Only add skills you have actually used and can discuss in an interview. Recruiters often probe listed skills.</Notice>
            <p>Listing it gives half credit. Describing where and how you used it in a bullet gives full credit, and is more convincing to a reader.</p>
            {props.skills.length ? (
              <div>
                <label className="label" htmlFor="skill-group">Add to group</label>
                <select id="skill-group" className="field" value={group} onChange={(e) => setGroup(e.target.value)}>
                  {props.skills.map((g) => <option key={g.id} value={g.id}>{g.category || "Skills"}</option>)}
                </select>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setConfirmSkill(null)}>Cancel</button>
              <button className="btn-primary" onClick={() => { props.onAddSkill(confirmSkill.name, group || null); setConfirmSkill(null); }}>
                Yes, I&apos;ve used it
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function SkillGroupList({ title, help, items, onGo, action }: { title: string; help?: string; items: SkillMatch[]; onGo: (l: TextLocation) => void; action?: (s: SkillMatch) => React.ReactNode }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="text-sm font-semibold">{title}</h3>
      {help ? <p className="mb-1.5 text-xs text-slate-500">{help}</p> : null}
      <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
        {items.map((s) => (
          <li key={s.name} className="flex items-start justify-between gap-2 p-2 text-sm">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium">{s.name}</span>
                <Badge tone={IMP_TONE[s.importance]}>{IMP_LABEL[s.importance]}</Badge>
              </div>
              {s.related.length ? <p className="text-xs text-slate-600">Related on your resume: {s.related.join(", ")} (transferable, not the same skill)</p> : null}
              {s.evidence.length ? (
                <p className="text-xs text-slate-500">
                  {s.status === "strong" ? "Shown in: " : "Listed in: "}
                  {s.evidence.map((e, i) => (
                    <button key={i} className="mr-1 underline" onClick={() => onGo(e.loc)}>{e.loc.label}</button>
                  ))}
                </p>
              ) : null}
            </div>
            {action?.(s)}
          </li>
        ))}
      </ul>
    </section>
  );
}
