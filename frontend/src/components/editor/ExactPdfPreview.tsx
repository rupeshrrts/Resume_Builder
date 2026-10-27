"use client";

import { useEffect, useState } from "react";
import { Spinner } from "../ui";

/**
 * The real PDF exactly as it downloads: same renderer, fonts, sizes and page breaks, because
 * it is the downloaded file. Refreshes about a second after edits stop (it saves first, since
 * the PDF is rendered from the saved résumé).
 */
export function ExactPdfPreview({ resumeId, flush, changeKey }: { resumeId: string; flush: () => Promise<number | null>; changeKey: unknown }) {
  const [rev, setRev] = useState<number | null>(null);
  const [updating, setUpdating] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUpdating(true);
    const timer = setTimeout(async () => {
      const saved = await flush().catch(() => null);
      if (cancelled) return;
      if (saved === null) setError("Your latest changes aren't saved yet, so this shows the last saved version.");
      else {
        setError(null);
        setRev(saved);
      }
      setUpdating(false);
    }, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [changeKey, flush]);

  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        {updating ? <Spinner label="Updating the PDF…" /> : "Exactly the PDF you download."}
      </p>
      {error ? <p className="mb-2 text-xs text-amber-700">{error}</p> : null}
      {rev !== null ? (
        // The browser's own PDF viewer; where a browser can't show PDFs in a page (some phones),
        // the fallback inside <object> offers the same file in a new tab instead.
        <object
          key={rev}
          title="Exact PDF preview"
          type="application/pdf"
          data={`/api/resumes/${resumeId}/export?format=pdf&inline=1&r=${rev}#toolbar=0&navpanes=0&view=FitH`}
          className="h-[85vh] w-full rounded-lg border border-slate-200 bg-white"
        >
          <div className="flex h-[40vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-600">
            <p>This browser can&apos;t show PDFs inside the page.</p>
            <a className="btn-primary" href={`/api/resumes/${resumeId}/export?format=pdf&inline=1&r=${rev}`} target="_blank" rel="noreferrer">
              Open the exact PDF
            </a>
          </div>
        </object>
      ) : (
        <div className="flex h-[60vh] items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-400">Preparing the PDF…</div>
      )}
    </div>
  );
}
