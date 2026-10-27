"use client";

import { useEffect, useState } from "react";
import { Copy, Link2, Lock, Trash } from "lucide-react";
import type { ShareLink } from "@resume/shared/schema/story";
import { api, ApiError } from "@/lib/api-client";
import type { ExportValidation } from "@resume/shared/types/api";
import { Badge, Notice, Spinner } from "../ui";
import { downloadResume, type ExportFormat } from "./DownloadMenu";

export function ExportPanel({ resumeId, flush }: { resumeId: string; flush: () => Promise<number | null> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [val, setVal] = useState<{ revision: number; pdf: ExportValidation; docx: ExportValidation } | null>(null);
  const [previewRev, setPreviewRev] = useState<number | null>(null);

  async function ensureSaved() {
    const rev = await flush();
    if (rev === null) throw new ApiError("Your latest changes couldn't be saved, so export was stopped. Fix the save error first.", 0);
    return rev;
  }

  async function download(format: ExportFormat) {
    setBusy(format);
    setError(null);
    try {
      await downloadResume(resumeId, format, flush);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  async function validate() {
    setBusy("validate");
    setError(null);
    try {
      await ensureSaved();
      setVal(await api(`/api/resumes/${resumeId}/export/validate`));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Validation failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="mb-1.5 font-semibold">Download</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!!busy} onClick={() => download("pdf")}>{busy === "pdf" ? "Preparing…" : "PDF"}</button>
          <button className="btn-secondary" disabled={!!busy} onClick={() => download("docx")}>{busy === "docx" ? "Preparing…" : "Word (DOCX)"}</button>
          <button className="btn-secondary" disabled={!!busy} onClick={() => download("txt")}>Plain text</button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => download("md")}>Markdown</button>
          <button className="btn-ghost" disabled={!!busy} onClick={() => download("json")}>JSON Resume</button>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">PDF for most applications; DOCX when an employer asks for Word or you want to edit elsewhere; plain text for online forms. Markdown suits a personal site or GitHub README; JSON Resume works with jsonresume.org themes and tools.</p>
      </section>
      {error ? <Notice tone="error">{error}</Notice> : null}

      <SharePanel resumeId={resumeId} ensureSaved={ensureSaved} />

      <section>
        <h3 className="mb-1.5 font-semibold">Check before you send</h3>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" disabled={!!busy} onClick={validate}>Re-open and check exports</button>
          <button
            className="btn-secondary"
            disabled={!!busy}
            onClick={async () => {
              try {
                setPreviewRev(await ensureSaved());
              } catch (e) {
                setError(e instanceof ApiError ? e.message : "Preview failed.");
              }
            }}
          >
            Final PDF preview
          </button>
        </div>
        {busy === "validate" ? <div className="mt-2"><Spinner label="Generating, re-opening and extracting text…" /></div> : null}
      </section>

      {val ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {[val.pdf, val.docx].map((v) => (
            <section key={v.format} className="rounded-md border border-slate-200 p-3">
              <div className="mb-1.5 flex items-center justify-between">
                <h4 className="font-semibold">{v.format.toUpperCase()}</h4>
                <Badge tone={v.ok ? "green" : "amber"}>{v.ok ? "Passed" : "Check"}</Badge>
              </div>
              {v.pages ? <p className="text-xs text-slate-600">{v.pages} page(s)</p> : null}
              <ul className="mt-1 space-y-1">
                {v.checks.map((c) => (
                  <li key={c.name} className="flex gap-1.5 text-xs">
                    <span aria-hidden className={c.ok ? "text-emerald-600" : "text-amber-600"}>{c.ok ? "✓" : "!"}</span>
                    <span><span className="font-medium">{c.name}:</span> {c.detail}</span>
                  </li>
                ))}
              </ul>
              {v.missing.length ? (
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer">Missing items</summary>
                  <ul className="list-disc pl-4">{v.missing.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </details>
              ) : null}
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer">Text extracted from the file</summary>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2">{v.extractedText}</pre>
              </details>
            </section>
          ))}
        </div>
      ) : null}

      {previewRev !== null ? (
        <section>
          <h3 className="mb-1.5 font-semibold">Final PDF preview</h3>
          <iframe title="Final PDF preview" src={`/api/resumes/${resumeId}/export?format=pdf&inline=1&r=${previewRev}`} className="h-[80vh] w-full rounded border border-slate-200 bg-white" />
        </section>
      ) : null}
    </div>
  );
}

function SharePanel({ resumeId, ensureSaved }: { resumeId: string; ensureSaved: () => Promise<number> }) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [password, setPassword] = useState("");
  const [days, setDays] = useState(30);
  const [fresh, setFresh] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ links: ShareLink[] }>(`/api/resumes/${resumeId}/shares`).then((r) => setLinks(r.links)).catch(() => undefined);
  }, [resumeId]);

  async function create() {
    setError(null);
    try {
      await ensureSaved();
      const r = await api<{ link: ShareLink; path: string }>(`/api/resumes/${resumeId}/shares`, { body: { password, expiresInDays: days } });
      setLinks((ls) => [r.link, ...ls]);
      setFresh({ id: r.link.id, url: `${window.location.origin}${r.path}` });
      setPassword("");
      setCopied(false);
    } catch (e) {
      setError(e instanceof ApiError ? [e.message, ...(e.issues ?? [])].join(" ") : "Couldn't create the link.");
    }
  }

  const live = links.filter((l) => !l.revoked && (l.expiresAt === null || l.expiresAt > Date.now()));
  return (
    <section className="rounded-xl border border-slate-200 p-3">
      <h3 className="flex items-center gap-1.5 font-semibold"><Link2 className="h-4 w-4" aria-hidden /> Share a link</h3>
      <p className="mt-0.5 text-xs text-slate-500">A read-only web page of this resume with a PDF download. It always shows the latest saved version. Anyone with the link can view it, so add a password for anything sensitive.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-slate-500">
          Expires
          <select className="field mt-1" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>In 7 days</option>
            <option value={30}>In 30 days</option>
            <option value={90}>In 90 days</option>
            <option value={0}>Never</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          Password (optional)
          <input type="password" autoComplete="new-password" className="field mt-1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="None" />
        </label>
        <button className="btn-secondary" onClick={create}>Create link</button>
      </div>
      {error ? <div className="mt-2"><Notice tone="error">{error}</Notice></div> : null}
      {fresh ? (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 p-2">
          <input readOnly className="field flex-1 bg-white text-xs" value={fresh.url} aria-label="New share link" onFocus={(e) => e.target.select()} />
          <button className="btn-secondary h-8 text-xs" onClick={async () => { await navigator.clipboard?.writeText(fresh.url); setCopied(true); }}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : null}
      {fresh ? <p className="mt-1 text-xs text-slate-500">Copy it now: for privacy the link itself isn&apos;t stored and can&apos;t be shown again.</p> : null}
      {live.length ? (
        <ul className="mt-3 divide-y divide-slate-100 text-xs">
          {live.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="flex items-center gap-1.5 text-slate-600">
                {l.hasPassword ? <Lock className="h-3.5 w-3.5" aria-label="Password-protected" /> : <Link2 className="h-3.5 w-3.5" aria-hidden />}
                Created {new Date(l.createdAt).toLocaleDateString()} · {l.views} view{l.views === 1 ? "" : "s"}
                {l.lastViewedAt ? ` (last ${new Date(l.lastViewedAt).toLocaleDateString()})` : ""} · {l.expiresAt ? `expires ${new Date(l.expiresAt).toLocaleDateString()}` : "no expiry"}
              </span>
              <button className="btn-ghost h-7 px-2 text-xs hover:text-red-700" onClick={async () => { await api(`/api/shares/${l.id}`, { method: "DELETE" }); setLinks((ls) => ls.map((x) => (x.id === l.id ? { ...x, revoked: true } : x))); if (fresh?.id === l.id) setFresh(null); }}>
                <Trash className="h-3.5 w-3.5" aria-hidden /> Turn off
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}