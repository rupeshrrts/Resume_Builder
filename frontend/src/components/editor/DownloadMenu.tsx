"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText, PartyPopper, X } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { Notice } from "../ui";

export type ExportFormat = "pdf" | "docx" | "txt" | "md" | "json";
type Flush = () => Promise<number | null>;

/** Saves any pending edits first (exports are rendered from the saved résumé), then downloads. */
export async function downloadResume(resumeId: string, format: ExportFormat, flush: Flush) {
  const rev = await flush();
  if (rev === null) throw new ApiError("Your latest changes couldn't be saved, so export was stopped. Fix the save error first.", 0);
  const a = document.createElement("a");
  a.href = `/api/resumes/${resumeId}/export?format=${format}`;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function useDownload(resumeId: string, flush: Flush) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (format: ExportFormat) => {
    setBusy(format);
    setError(null);
    try {
      await downloadResume(resumeId, format, flush);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Download failed. Please try again.");
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

/** Always-visible "Download" button in the editor's top bar: PDF, Word, or the full Export panel. */
export function DownloadMenu({ resumeId, flush, onMore }: { resumeId: string; flush: Flush; onMore: () => void }) {
  const [open, setOpen] = useState(false);
  const { busy, error, run } = useDownload(resumeId, flush);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50";
  return (
    <div ref={box} className="relative">
      <button className="btn-primary h-9" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Download className="h-4 w-4" aria-hidden />
        <span>{busy ? "Preparing…" : "Download"}</span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          <button role="menuitem" className={item} disabled={!!busy} onClick={() => void run("pdf").then(() => setOpen(false))}>
            <FileText className="h-4 w-4 text-red-600" aria-hidden /> PDF <span className="ml-auto text-xs text-slate-400">best to send</span>
          </button>
          <button role="menuitem" className={item} disabled={!!busy} onClick={() => void run("docx").then(() => setOpen(false))}>
            <FileText className="h-4 w-4 text-blue-600" aria-hidden /> Word (DOCX) <span className="ml-auto text-xs text-slate-400">editable</span>
          </button>
          <div className="my-1 border-t border-slate-100" />
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onMore();
            }}
          >
            More formats, checks & share link…
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-72">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </div>
  );
}

/** Shown once after "Create my resume" in the guided builder. */
export function ReadyBanner({ resumeId, flush, onClose }: { resumeId: string; flush: Flush; onClose: () => void }) {
  const { busy, error, run } = useDownload(resumeId, flush);
  return (
    <div className="mx-auto mt-4 max-w-[1500px] px-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <PartyPopper className="h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-emerald-900">Your resume is ready.</p>
          <p className="text-sm text-emerald-800">Download it now, or keep editing. The Download button stays at the top right.</p>
        </div>
        <button className="btn-primary" disabled={!!busy} onClick={() => run("pdf")}>
          <Download className="h-4 w-4" aria-hidden /> {busy === "pdf" ? "Preparing…" : "Download PDF"}
        </button>
        <button className="btn-secondary" disabled={!!busy} onClick={() => run("docx")}>
          {busy === "docx" ? "Preparing…" : "Download Word"}
        </button>
        <button className="btn-ghost h-8 w-8 p-0" aria-label="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
        {error ? <div className="w-full"><Notice tone="error">{error}</Notice></div> : null}
      </div>
    </div>
  );
}
