"use client";

import { useEffect, useState } from "react";
import { Copy, Download, FileText, Save, Sparkles, Trash } from "lucide-react";
import type { Job } from "@resume/shared/schema/job";
import { DOC_KINDS, type AppDocument, type DocKind, type DocTone } from "@resume/shared/schema/document";
import { api, ApiError } from "@/lib/api-client";
import { Badge, Notice, Spinner } from "../ui";

interface Draft {
  id: string | null;
  kind: DocKind;
  title: string;
  body: string;
  origin: "user" | "template" | "ai";
}

/**
 * Cover letters, recruiter messages, application emails and LinkedIn text, written from this
 * resume (and the linked job). Drafts are editable; saved ones are kept per resume.
 */
export function LettersPanel({ resumeId, jobs, jobId, aiAvailable, flush }: { resumeId: string; jobs: Job[]; jobId: string | null; aiAvailable: boolean; flush: () => Promise<number | null> }) {
  const [kind, setKind] = useState<DocKind>("cover_letter");
  const [job, setJob] = useState<string>(jobId ?? "");
  const [recipient, setRecipient] = useState("");
  const [tone, setTone] = useState<DocTone>("professional");
  const [facts, setFacts] = useState("");
  const [useAi, setUseAi] = useState(aiAvailable);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<AppDocument[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ questions: string[]; warnings: string[]; notice?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<{ documents: AppDocument[] }>(`/api/documents?resumeId=${resumeId}`)
      .then((r) => setSaved(r.documents))
      .catch(() => setSaved([]));
  }, [resumeId]);

  async function generate() {
    setBusy(true);
    setError(null);
    setNotes(null);
    try {
      await flush();
      const r = await api<{ method: "ai" | "template"; title: string; body: string; questions: string[]; warnings: string[]; notice?: string }>("/api/documents/generate", {
        body: { kind, resumeId, jobId: job || null, recipient, tone, facts, useAi },
      });
      setDraft({ id: null, kind, title: r.title, body: r.body, origin: r.method });
      setNotes({ questions: r.questions, warnings: r.warnings, notice: r.notice });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't write the draft.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const body = { kind: draft.kind, title: draft.title, body: draft.body, origin: draft.origin, resumeId, jobId: job || null };
      const { document } = draft.id
        ? await api<{ document: AppDocument }>(`/api/documents/${draft.id}`, { method: "PUT", body })
        : await api<{ document: AppDocument }>("/api/documents", { body });
      setDraft({ ...draft, id: document.id });
      setSaved((s) => [document, ...(s ?? []).filter((d) => d.id !== document.id)]);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const limitInfo = DOC_KINDS[draft?.kind ?? kind];
  const over = draft ? draft.body.length > limitInfo.limit : false;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Document type">
        {(Object.keys(DOC_KINDS) as DocKind[]).map((k) => (
          <button
            key={k}
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${kind === k ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
          >
            {DOC_KINDS[k].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{DOC_KINDS[kind].hint}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="lp-job">For job</label>
          <select id="lp-job" className="field" value={job} onChange={(e) => setJob(e.target.value)}>
            <option value="">No specific job</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{[j.title || "Untitled", j.company].filter(Boolean).join(" · ")}</option>)}
          </select>
        </div>
        {kind !== "linkedin_headline" && kind !== "linkedin_about" ? (
          <div>
            <label className="label" htmlFor="lp-to">Recipient name (optional)</label>
            <input id="lp-to" className="field" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="e.g. Meera Iyer" />
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="lp-tone">Tone</label>
          <select id="lp-tone" className="field" value={tone} onChange={(e) => setTone(e.target.value as DocTone)}>
            <option value="professional">Professional</option>
            <option value="warm">Warm</option>
            <option value="concise">Concise</option>
          </select>
        </div>
        {aiAvailable ? (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} /> Write with AI (uses only your resume and notes)
          </label>
        ) : null}
      </div>
      {useAi && aiAvailable ? (
        <div>
          <label className="label" htmlFor="lp-facts">Anything to mention? (optional)</label>
          <textarea id="lp-facts" className="field" rows={2} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder="e.g. Why this company, a referral, notice period, relocation" />
        </div>
      ) : null}
      <button className="btn-primary" onClick={generate} disabled={busy}>
        <Sparkles className="h-4 w-4" aria-hidden /> {draft ? "Write a new draft" : `Write ${DOC_KINDS[kind].label.toLowerCase()}`}
      </button>
      {!aiAvailable ? <p className="text-xs text-slate-500">Drafts are built from your resume&apos;s own words. Edit freely.</p> : null}
      {busy ? <Spinner label="Working…" /> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {draft ? (
        <section className="space-y-2 rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <input className="field max-w-sm font-semibold" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" />
            <Badge tone={draft.origin === "ai" ? "violet" : draft.origin === "template" ? "blue" : "slate"}>
              {draft.origin === "ai" ? "✦ AI draft" : draft.origin === "template" ? "From your resume" : "Edited by you"}
            </Badge>
          </div>
          {notes?.notice ? <Notice tone="warn">{notes.notice}</Notice> : null}
          {notes?.warnings.length ? <Notice tone="warn">Please check before sending: {notes.warnings.join(" ")}</Notice> : null}
          <textarea
            className={`field min-h-72 font-[inherit] leading-relaxed ${over ? "border-red-300" : ""}`}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value, origin: "user" })}
            aria-label="Document text"
          />
          <p className={`text-right text-xs ${over ? "text-red-700" : "text-slate-500"}`}>
            {draft.body.length.toLocaleString()} / {limitInfo.limit.toLocaleString()} characters · {draft.body.trim().split(/\s+/).filter(Boolean).length} words
          </p>
          {notes?.questions.length ? (
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
              <p className="font-semibold">To make it stronger, consider adding:</p>
              <ul className="mt-1 list-disc pl-4">{notes.questions.map((q) => <li key={q}>{q}</li>)}</ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={save} disabled={busy || over}><Save className="h-4 w-4" aria-hidden /> {draft.id ? "Save changes" : "Save"}</button>
            <button
              className="btn-secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(draft.body).catch(() => undefined);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy className="h-4 w-4" aria-hidden /> {copied ? "Copied" : "Copy"}
            </button>
            {draft.id && draft.kind === "cover_letter" ? (
              <>
                <a className="btn-secondary" href={`/api/documents/${draft.id}/export?format=pdf`}><Download className="h-4 w-4" aria-hidden /> PDF</a>
                <a className="btn-secondary" href={`/api/documents/${draft.id}/export?format=docx`}><Download className="h-4 w-4" aria-hidden /> Word</a>
              </>
            ) : null}
          </div>
          {draft.kind === "cover_letter" && !draft.id ? <p className="text-xs text-slate-500">Save to download as PDF or Word with the same letterhead as your resume.</p> : null}
        </section>
      ) : null}

      <section>
        <h3 className="mb-2 font-semibold">Saved for this resume</h3>
        {saved === null ? <Spinner /> : saved.length === 0 ? <p className="text-xs text-slate-500">Nothing saved yet.</p> : null}
        <ul className="space-y-1.5">
          {saved?.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
              <button
                className="flex min-w-0 items-center gap-2 text-left hover:text-brand-700"
                onClick={() => {
                  setKind(d.kind);
                  setDraft({ id: d.id, kind: d.kind, title: d.title, body: d.body, origin: d.origin });
                  setNotes(null);
                }}
              >
                <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="truncate">{d.title || DOC_KINDS[d.kind].label}</span>
                <span className="shrink-0 text-xs text-slate-400">{new Date(d.updatedAt).toLocaleDateString()}</span>
              </button>
              <button
                className="btn-ghost h-7 w-7 shrink-0 p-0 hover:text-red-700"
                aria-label={`Delete ${d.title}`}
                onClick={async () => {
                  if (!confirm("Delete this document?")) return;
                  await api(`/api/documents/${d.id}`, { method: "DELETE" }).catch(() => undefined);
                  setSaved((s) => (s ?? []).filter((x) => x.id !== d.id));
                  if (draft?.id === d.id) setDraft(null);
                }}
              >
                <Trash className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
