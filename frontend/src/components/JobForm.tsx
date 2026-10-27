"use client";

import { useState } from "react";
import type { Job } from "@resume/shared/schema/job";
import { api, ApiError } from "@/lib/api-client";
import { Notice } from "./ui";

export function JobForm({ onSaved, onCancel, initial }: { onSaved: (j: Job) => void; onCancel?: () => void; initial?: Job }) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const body = { title, company, url, description };
          const { job } = initial
            ? await api<{ job: Job }>(`/api/jobs/${initial.id}`, { method: "PUT", body })
            : await api<{ job: Job }>("/api/jobs", { body });
          onSaved(job);
        } catch (err) {
          setError(err instanceof ApiError ? [err.message, ...(err.issues ?? [])].join(" ") : "Couldn't save the job.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="jf-title">Job title</label>
          <input id="jf-title" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. .NET Developer" />
        </div>
        <div>
          <label className="label" htmlFor="jf-company">Company</label>
          <input id="jf-company" className="field" value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="jf-url">Posting URL (for your reference)</label>
        <input id="jf-url" className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        <p className="mt-1 text-xs text-slate-500">Fetching the description from a URL isn&apos;t supported yet. Paste the description below.</p>
      </div>
      <div>
        <label className="label" htmlFor="jf-desc">Job description</label>
        <textarea id="jf-desc" className="field min-h-48 font-mono text-xs" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Paste the full job description, including requirements and responsibilities." />
        <p className="mt-1 text-xs text-slate-500">{description.length.toLocaleString()} / 30,000 characters</p>
      </div>
      <div className="flex justify-end gap-2">
        {onCancel ? <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button> : null}
        <button className="btn-primary" disabled={busy || description.length > 30000 || (!description.trim() && !title.trim())}>
          {busy ? "Saving…" : "Save job"}
        </button>
      </div>
    </form>
  );
}
