"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import type { ResumeData, ResumeSettings } from "@resume/shared/schema/resume";
import { buildDocument } from "@resume/shared/render/model";
import { renderText } from "@resume/shared/render/text";
import { diffLines } from "@resume/shared/diff";
import { Modal, Notice, Spinner } from "../ui";

interface V {
  id: string;
  revision: number;
  note: string;
  createdAt: number;
}

export function VersionsModal({
  open,
  onClose,
  resumeId,
  current,
  flush,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  resumeId: string;
  current: { data: ResumeData; settings: ResumeSettings };
  flush: () => Promise<number | null>;
  onRestored: (r: { data: ResumeData; settings: ResumeSettings; revision: number }) => void;
}) {
  const [versions, setVersions] = useState<V[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<{ v: V; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setCompare(null);
    api<{ versions: V[] }>(`/api/resumes/${resumeId}/versions`)
      .then((r) => setVersions(r.versions))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Couldn't load versions."));
  }, [open, resumeId]);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const currentText = renderText(buildDocument(current.data, current.settings));

  return (
    <Modal open={open} onClose={onClose} title="Version history" wide>
      <div className="space-y-3 text-sm">
        {error ? <Notice tone="error">{error}</Notice> : null}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(async () => {
              await flush();
              const r = await api<{ versions: V[] }>(`/api/resumes/${resumeId}/versions`, { body: { note: note || "Saved version" } });
              setVersions(r.versions);
              setNote("");
            });
          }}
        >
          <label className="sr-only" htmlFor="vnote">Version note</label>
          <input id="vnote" className="field" placeholder="Note, e.g. Before tailoring for Infosys" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary shrink-0" disabled={busy}>Save version</button>
        </form>
        <p className="text-xs text-slate-500">Checkpoints are also saved automatically every 10 minutes while you edit, and before any restore. The 50 most recent are kept.</p>
        {!versions ? <Spinner /> : versions.length === 0 ? <p className="text-slate-600">No versions yet.</p> : null}
        <ul className="max-h-60 divide-y divide-slate-100 overflow-auto rounded border border-slate-200">
          {versions?.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 p-2">
              <div>
                <p className="font-medium">{v.note}</p>
                <p className="text-xs text-slate-500">{new Date(v.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-1">
                <button
                  className="btn-secondary h-7 text-xs"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      const r = await api<{ version: { data: ResumeData; settings: ResumeSettings } }>(`/api/resumes/${resumeId}/versions/${v.id}`);
                      setCompare({ v, text: renderText(buildDocument(r.version.data, r.version.settings)) });
                    })
                  }
                >
                  Compare
                </button>
                <button
                  className="btn-secondary h-7 text-xs"
                  disabled={busy}
                  onClick={() =>
                    confirm("Restore this version? Your current state is saved as a version first, so you can undo this.") &&
                    act(async () => {
                      await flush();
                      const r = await api<{ resume: { data: ResumeData; settings: ResumeSettings; revision: number } }>(`/api/resumes/${resumeId}/versions/${v.id}`, { method: "POST", body: {} });
                      onRestored(r.resume);
                      onClose();
                    })
                  }
                >
                  Restore
                </button>
              </div>
            </li>
          ))}
        </ul>
        {compare ? (
          <div>
            <p className="mb-1 font-medium">“{compare.v.note}” compared with now</p>
            <div className="grid max-h-[50vh] gap-2 overflow-auto sm:grid-cols-2">
              {(["old", "new"] as const).map((side) => (
                <pre key={side} className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">
                  <span className="mb-1 block font-sans font-semibold text-slate-500">{side === "old" ? "Version" : "Current"}</span>
                  {diffLines(compare.text, currentText).map((p, i) =>
                    p.type === "same" ? (
                      <span key={i}>{p.text + "\n"}</span>
                    ) : p.type === "del" && side === "old" ? (
                      <span key={i} className="block bg-red-100 text-red-900">{p.text}</span>
                    ) : p.type === "add" && side === "new" ? (
                      <span key={i} className="block bg-emerald-100 text-emerald-900">{p.text}</span>
                    ) : null,
                  )}
                </pre>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
