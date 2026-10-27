"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Lock } from "lucide-react";
import type { ResumeData, ResumeSettings } from "@resume/shared/schema/resume";
import { PreviewPanel } from "./editor/PreviewPanel";
import { Notice, Spinner } from "./ui";

type State =
  | { kind: "loading" }
  | { kind: "locked" }
  | { kind: "missing"; message: string }
  | { kind: "ready"; name: string; data: ResumeData; settings: ResumeSettings };

/** The public, read-only view behind a share link. Uses plain fetch so a 401 shows the password form instead of the sign-in page. */
export function SharedResume({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const base = `/api/public/r/${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    const res = await fetch(base, { credentials: "same-origin" });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) setState({ kind: "locked" });
    else if (!res.ok) setState({ kind: "missing", message: body.error ?? "This link isn't available." });
    else {
      setState({ kind: "ready", ...body });
      document.title = `${body.name} · Resume`;
    }
  }, [base]);

  useEffect(() => {
    load().catch(() => setState({ kind: "missing", message: "Can't reach the server. Check your connection and try again." }));
  }, [load]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${base}/unlock`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't unlock.");
      return;
    }
    await load();
  }

  if (state.kind === "loading") return <div className="py-20"><Spinner /></div>;
  if (state.kind === "missing")
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-bold">Link not available</h1>
        <p className="mt-2 text-sm text-slate-600">{state.message}</p>
      </div>
    );
  if (state.kind === "locked")
    return (
      <form onSubmit={unlock} className="card mx-auto mt-16 max-w-sm space-y-3 p-6">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white"><Lock className="h-6 w-6" aria-hidden /></span>
        <h1 className="text-center text-lg font-bold">This resume is password-protected</h1>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div>
          <label className="label" htmlFor="share-pw">Password</label>
          <input id="share-pw" type="password" autoComplete="off" className="field" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </div>
        <button className="btn-primary w-full" disabled={!password}>View resume</button>
      </form>
    );

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{state.name}</h1>
          <p className="text-xs text-slate-500">Shared resume · read-only</p>
        </div>
        <a className="btn-primary" href={`${base}/pdf`} download>
          <Download className="h-4 w-4" aria-hidden /> Download PDF
        </a>
      </div>
      <PreviewPanel data={state.data} settings={state.settings} caption={false} />
    </div>
  );
}
