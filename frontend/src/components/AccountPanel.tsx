"use client";

import { useState } from "react";
import { KeyRound, MailCheck, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Notice } from "./ui";
import { RecoveryCodeCard } from "./RecoveryCode";

/** Shown only to an ADMIN_EMAILS account that isn't activated yet. */
function AdminActivation() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card space-y-3 border-violet-200 bg-violet-50/40 p-4 text-sm" aria-labelledby="admin-h">
      <h2 id="admin-h" className="flex items-center gap-2 font-semibold text-violet-900"><ShieldCheck className="h-4 w-4" aria-hidden /> Admin access</h2>
      <p className="text-slate-700">
        This is the site owner&apos;s email. To turn on the admin dashboard, enter the setup code from your server log: the terminal running the API locally, or <strong>Render → your API → Logs</strong> online. Look for the line <code className="rounded bg-white px-1">admin_setup_code</code>.
      </p>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/api/admin/activate", { body: { code } });
            window.location.href = "/admin";
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Couldn't activate.");
            setBusy(false);
          }
        }}
      >
        <label className="sr-only" htmlFor="admin-code">Setup code</label>
        <input id="admin-code" className="field font-mono uppercase tracking-wider" autoComplete="off" spellCheck={false} placeholder="ABCD-EFGH-JKLM" value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={busy || code.replace(/[^a-z]/gi, "").length < 8}>{busy ? "Checking…" : "Activate admin"}</button>
      </form>
    </section>
  );
}

/** A new recovery code on demand (e.g. the first one was lost). Needs the current password. */
function RecoverySection({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  return (
    <section className="card space-y-3 p-4 text-sm" aria-labelledby="rec-h">
      <h2 id="rec-h" className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-slate-500" aria-hidden /> Recovery code</h2>
      {code ? (
        <RecoveryCodeCard code={code} email={email} onDone={() => { setCode(null); setOpen(false); setPassword(""); }} doneLabel="Done" />
      ) : (
        <>
          <p className="text-slate-600">If you forget your password, your recovery code lets you set a new one on the &ldquo;Forgot password?&rdquo; page. Lost it? Make a new one; the old code stops working.</p>
          {!open ? (
            <button className="btn-secondary" onClick={() => setOpen(true)}>Create a new recovery code</button>
          ) : (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                try {
                  setCode((await api<{ recoveryCode: string }>("/api/auth/recovery-code", { body: { password } })).recoveryCode);
                } catch (err) {
                  setError(err instanceof ApiError ? err.message : "Couldn't create a code.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="sr-only" htmlFor="rec-pw">Password</label>
              <input id="rec-pw" type="password" autoComplete="current-password" placeholder="Confirm with your password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="btn-primary shrink-0" disabled={busy || !password}>{busy ? "Creating…" : "Create code"}</button>
            </form>
          )}
          {error ? <Notice tone="error">{error}</Notice> : null}
        </>
      )}
    </section>
  );
}

export function AccountPanel({
  email,
  emailVerified,
  isAdmin,
  canActivateAdmin,
  emailOn,
}: {
  email: string;
  emailVerified: boolean;
  isAdmin: boolean;
  canActivateAdmin: boolean;
  emailOn: boolean;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<{ state: "idle" | "sending" | "sent" | "error"; message?: string }>({ state: "idle" });
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Account</h1>
      {canActivateAdmin ? <AdminActivation /> : null}
      <section className="card space-y-2 p-4 text-sm" aria-labelledby="email-h">
        <h2 id="email-h" className="sr-only">Email address</h2>
        <p className="flex flex-wrap items-center gap-2">
          Signed in as <strong>{email}</strong>
          {isAdmin ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">Admin</span> : null}
          {emailVerified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700"><MailCheck className="h-3.5 w-3.5" aria-hidden /> Verified</span>
          ) : emailOn ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Not verified</span>
          ) : null}
        </p>
        {!emailVerified && emailOn ? (
          <>
            <p className="text-slate-600">Confirm your email so you can reset your password if you forget it. We sent a link when you signed up.</p>
            {verify.state === "sent" ? <Notice tone="success">Sent. Check your inbox (and Spam) for the link.</Notice> : null}
            {verify.state === "error" ? <Notice tone="error">{verify.message}</Notice> : null}
            <button
              className="btn-secondary"
              disabled={verify.state === "sending" || verify.state === "sent"}
              onClick={async () => {
                setVerify({ state: "sending" });
                try {
                  await api("/api/auth/send-verification", { body: {} });
                  setVerify({ state: "sent" });
                } catch (err) {
                  setVerify({ state: "error", message: err instanceof ApiError ? err.message : "Couldn't send the email." });
                }
              }}
            >
              {verify.state === "sending" ? "Sending…" : "Send verification email"}
            </button>
          </>
        ) : null}
      </section>
      <RecoverySection email={email} />
      <section className="card space-y-2 p-4 text-sm" aria-labelledby="data-h">
        <h2 id="data-h" className="font-semibold">Your data</h2>
        <ul className="list-disc space-y-1 pl-5 text-slate-700">
          <li>Uploaded files are read in memory and never stored. Only the sections you save are kept.</li>
          <li>Resumes, version history (up to 50 per resume) and saved jobs are kept until you delete them.</li>
          <li>Server logs record request types and errors, not resume or job text.</li>
          <li>When you use AI features, the relevant resume text is sent to the AI service this site uses (OpenAI, Google Gemini, Groq, NVIDIA or Anthropic) to generate suggestions.</li>
        </ul>
        <a className="btn-secondary mt-2" href="/api/account" download>Download all my data (JSON)</a>
      </section>
      <section className="card space-y-3 border-red-200 p-4 text-sm" aria-labelledby="del-h">
        <h2 id="del-h" className="font-semibold text-red-800">Delete account</h2>
        <p>Permanently deletes your account, every resume, version and saved job. This can&apos;t be undone.</p>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!confirm("Delete your account and all data permanently?")) return;
            setBusy(true);
            setError(null);
            try {
              await api("/api/account", { method: "DELETE", body: { password } });
              window.location.href = "/";
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "Couldn't delete the account.");
              setBusy(false);
            }
          }}
        >
          <label className="sr-only" htmlFor="del-pw">Password</label>
          <input id="del-pw" type="password" autoComplete="current-password" placeholder="Confirm with your password" className="field" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn-danger shrink-0" disabled={!password || busy}>Delete everything</button>
        </form>
      </section>
    </div>
  );
}
