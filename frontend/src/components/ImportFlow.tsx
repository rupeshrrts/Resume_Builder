"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloudUpload, FileCheck } from "lucide-react";
import type { ResumeData } from "@resume/shared/schema/resume";
import type { AtsResult, LayoutSignals } from "@resume/shared/analysis/ats";
import { api, ApiError } from "@/lib/api-client";
import { Badge, Notice, Spinner } from "./ui";
import { IssueList } from "./editor/IssueList";

interface ImportResponse {
  method: "standard" | "ai";
  fileName: string;
  extraction: { format: "pdf" | "docx" | "linkedin"; layout: LayoutSignals | null; text: string; warnings: string[] };
  structured: { data: ResumeData; warnings: string[]; skipped: { title: string; lines: string[] }[]; unplaced: string[]; dropped: string[] };
  ats: AtsResult;
  notes: string[];
}

export function ImportFlow({ aiAvailable }: { aiAvailable: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"ai" | "standard">(aiAvailable ? "ai" : "standard");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [name, setName] = useState("Master resume");
  const [showText, setShowText] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    form.append("mode", mode);
    try {
      setResult(await api<ImportResponse>("/api/import", { form }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!result) return;
    setBusy(true);
    try {
      const { resume } = await api<{ resume: { id: string } }>("/api/resumes", { body: { name, data: result.structured.data } });
      router.push(`/resumes/${resume.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the resume.");
      setBusy(false);
    }
  }

  const d = result?.structured.data;
  const counts = d
    ? [
        ["Experience", d.experience.length],
        ["Education", d.education.length],
        ["Projects", d.projects.length],
        ["Skill groups", d.skills.length],
        ["Certifications", d.certifications.length],
        ["Other sections", d.additional.length],
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-extrabold">Import an existing resume</h1>
      <p className="mt-1 text-sm text-slate-600">
        PDF or DOCX, or your LinkedIn data export (ZIP), up to 5 MB. The file is read in memory and not stored; only the sections you choose to keep are saved.
      </p>

      <form onSubmit={upload} className="card mt-5 space-y-4 p-5">
        <label
          htmlFor="file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            dragging ? "scale-[1.01] border-brand-500 bg-brand-50" : file ? "border-emerald-300 bg-emerald-50/50" : "border-slate-300 bg-slate-50/60 hover:border-brand-300 hover:bg-brand-50/40"
          }`}
        >
          <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${file ? "bg-emerald-500 text-white" : "bg-gradient-to-br from-brand-500 to-violet-500 text-white"} shadow-md`}>
            {file ? <FileCheck className="h-7 w-7" aria-hidden /> : <CloudUpload className="h-7 w-7" aria-hidden />}
          </span>
          {file ? (
            <>
              <span className="font-semibold text-slate-900">{file.name}</span>
              <span className="text-xs text-slate-500">{(file.size / 1024).toFixed(0)} KB · click to choose a different file</span>
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-900">Drop your resume here, or click to browse</span>
              <span className="text-xs text-slate-500">PDF, DOCX or LinkedIn export ZIP, up to 5 MB</span>
            </>
          )}
          <input
            id="file"
            type="file"
            accept=".pdf,.docx,.zip,application/pdf,application/zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <fieldset>
          <legend className="label">Parsing method</legend>
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:gap-6">
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "ai"} disabled={!aiAvailable} onChange={() => setMode("ai")} className="mt-1" />
              <span>
                AI-assisted <span className="text-slate-500">(more accurate on unusual layouts; every value is checked against your file)</span>
                {!aiAvailable ? <span className="block text-xs text-amber-700">Not available right now. Standard reading works for most resumes.</span> : null}
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" name="mode" checked={mode === "standard"} onChange={() => setMode("standard")} className="mt-1" />
              <span>Standard <span className="text-slate-500">(rule-based, works offline)</span></span>
            </label>
          </div>
        </fieldset>
        <button className="btn-primary" disabled={!file || busy}>{busy && !result ? "Reading…" : "Upload and analyse"}</button>
        <details className="text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold text-slate-600">Importing from LinkedIn?</summary>
          <p className="mt-1">On LinkedIn, open Settings → Data privacy → Get a copy of your data, choose the smaller archive (profile, positions, education, skills), and upload the ZIP you receive by email. Birth date and address in the export are never imported.</p>
        </details>
        {busy && !result ? <Spinner label={mode === "ai" ? "Extracting text and organising sections (can take up to a minute)…" : "Extracting text…"} /> : null}
      </form>

      {error ? <div className="mt-4"><Notice tone="error">{error}</Notice></div> : null}

      {result && d ? (
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="card space-y-3 p-4" aria-labelledby="found-h">
            <h2 id="found-h" className="font-semibold">What we found</h2>
            <p className="text-sm text-slate-600">
              {result.fileName} · {result.extraction.format === "linkedin" ? "LinkedIn export" : result.extraction.format.toUpperCase()}
              {result.extraction.layout?.pages ? ` · ${result.extraction.layout.pages} page(s)` : ""} · parsed with{" "}
              <Badge tone={result.method === "ai" ? "violet" : "slate"}>{result.method === "ai" ? "AI-assisted" : "Standard"}</Badge>
            </p>
            {result.notes.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs text-slate-500">Name</dt><dd>{d.contact.fullName || <em className="text-amber-700">not found</em>}</dd></div>
              <div><dt className="text-xs text-slate-500">Email</dt><dd className="truncate">{d.contact.email || <em className="text-amber-700">not found</em>}</dd></div>
              <div><dt className="text-xs text-slate-500">Phone</dt><dd>{d.contact.phone || <em className="text-amber-700">not found</em>}</dd></div>
              <div><dt className="text-xs text-slate-500">Location</dt><dd>{d.contact.location || <em className="text-slate-400">not found</em>}</dd></div>
              {counts.map(([k, v]) => (
                <div key={k as string}><dt className="text-xs text-slate-500">{k}</dt><dd>{v as number}</dd></div>
              ))}
            </dl>
            {[...result.extraction.warnings, ...result.structured.warnings].length ? (
              <div>
                <h3 className="mb-1 text-sm font-medium">Check these</h3>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {[...result.extraction.warnings, ...result.structured.warnings].map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            ) : null}
            {result.structured.dropped.length ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">{result.structured.dropped.length} AI-extracted value(s) removed because they weren&apos;t in your file</summary>
                <ul className="mt-1 list-disc pl-5 text-slate-600">{result.structured.dropped.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </details>
            ) : null}
            {result.structured.unplaced.length ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">{result.structured.unplaced.length} line(s) couldn&apos;t be placed</summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{result.structured.unplaced.join("\n")}</pre>
              </details>
            ) : null}
            <div className="border-t border-slate-100 pt-3">
              <label className="label" htmlFor="imp-name">Save as</label>
              <div className="flex gap-2">
                <input id="imp-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
                <button className="btn-primary shrink-0" onClick={create} disabled={busy}>Create master resume</button>
              </div>
              <p className="mt-1 text-xs text-slate-500">You can edit every section afterwards. Imported text is marked so you can tell it apart from AI suggestions.</p>
            </div>
          </section>

          <section className="card space-y-3 p-4" aria-labelledby="ats-h">
            <div className="flex items-center justify-between">
              <h2 id="ats-h" className="font-semibold">ATS readability of your current file</h2>
              <Badge tone={result.ats.score >= 75 ? "green" : result.ats.score >= 50 ? "amber" : "red"}>{result.ats.score}/100</Badge>
            </div>
            <p className="text-xs text-slate-500">
              Based on the file&apos;s layout and the parsed content. Applicant tracking systems vary; this is a guide, not any employer&apos;s score.
            </p>
            <IssueList issues={result.ats.issues} />
            <button className="btn-ghost px-0 text-brand-700" onClick={() => setShowText((s) => !s)} aria-expanded={showText}>
              {showText ? "Hide" : "Show"} plain text as extracted
            </button>
            {showText ? <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{result.extraction.text || "(no text)"}</pre> : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
