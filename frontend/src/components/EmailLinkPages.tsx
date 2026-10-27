"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, Mail, MailCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Notice, Spinner } from "./ui";
import { RecoveryCodeCard } from "./RecoveryCode";

function Shell({ icon: Icon, title, sub, children }: { icon: typeof Mail; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-sm flex-col justify-center px-4 py-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-md"><Icon className="h-6 w-6" aria-hidden /></span>
      <h1 className="mt-4 text-2xl font-extrabold">{title}</h1>
      <p className="mt-1 text-sm text-slate-600">{sub}</p>
      <div className="card mt-6 space-y-4 p-6">{children}</div>
    </div>
  );
}

/**
 * "Forgot password?": with the recovery code from sign-up (always available, no email needed), or,
 * when the server has an email service, a link sent to the inbox.
 */
export function ForgotPassword({ owner = false }: { owner?: boolean }) {
  const [method, setMethod] = useState<"code" | "email" | "owner">(owner ? "owner" : "code");
  const [emailOn, setEmailOn] = useState(false);
  useEffect(() => {
    api<{ email: boolean }>("/api/auth/features")
      .then((f) => setEmailOn(f.email))
      .catch(() => undefined);
  }, []);
  const switcher = (
    <div className="space-y-1 text-center">
      {method !== "code" ? (
        <p className="text-sm text-slate-600">
          Have your recovery code? <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setMethod("code")}>Use it instead</button>
        </p>
      ) : emailOn ? (
        <p className="text-sm text-slate-600">
          Don&apos;t have the code? <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setMethod("email")}>Email me a link instead</button>
        </p>
      ) : (
        <p className="text-xs text-slate-500">Lost the code too? Contact the site owner; they can send you a reset link.</p>
      )}
      {method !== "owner" ? (
        <p className="text-xs text-slate-500">
          Site owner? <button type="button" className="font-semibold text-slate-600 hover:underline" onClick={() => setMethod("owner")}>Reset with the server setup code</button>
        </p>
      ) : null}
    </div>
  );
  if (method === "email") return <EmailResetLink footer={switcher} />;
  return <RecoverWithCode key={method} owner={method === "owner"} footer={switcher} />;
}

/** Recovery code (any user), or, for the site owner, the setup code printed in the server log. */
function RecoverWithCode({ footer, owner = false }: { footer: React.ReactNode; owner?: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCode, setNewCode] = useState<string | null>(null);
  if (newCode)
    return (
      <Shell icon={CheckCircle2} title="Password changed" sub="You're signed in. Your old recovery code no longer works, so save this new one.">
        <RecoveryCodeCard code={newCode} email={email} onDone={() => (window.location.href = "/dashboard")} doneLabel="Go to my dashboard" />
      </Shell>
    );
  return (
    <Shell
      icon={KeyRound}
      title={owner ? "Site owner: reset password" : "Forgot your password?"}
      sub={
        owner
          ? "Use the newest admin_setup_code from your server log (the terminal running the API, or Render → API → Logs). This also turns on admin access."
          : "Use the recovery code you saved when you created your account."
      }
    >
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          // Read the boxes directly: browser autofill doesn't always tell React about its values.
          const fd = new FormData(e.currentTarget);
          const values = { email: String(fd.get("email") ?? "").trim(), code: String(fd.get("code") ?? ""), password: String(fd.get("password") ?? "") };
          setEmail(values.email);
          const letters = values.code.replace(/[^a-z]/gi, "").length;
          const problem = !values.email
            ? "Enter your email."
            : letters < (owner ? 12 : 16)
              ? owner ? "Enter the full setup code, like ABCD-EFGH-JKLM." : "Enter the full recovery code, like ABCD-EFGH-JKLM-NPQR."
              : values.password.length < 10
                ? "The new password needs at least 10 characters."
                : null;
          if (problem) return setError(problem);
          setBusy(true);
          setError(null);
          try {
            const r = await api<{ recoveryCode: string }>(owner ? "/api/auth/owner-reset" : "/api/auth/recover", { body: values });
            setNewCode(r.recoveryCode);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div>
          <label className="label" htmlFor="rc-email">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="rc-email" name="email" type="email" autoComplete="email" className="field pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="rc-code">{owner ? "Setup code from the server log" : "Recovery code"}</label>
          <input id="rc-code" name="code" autoComplete="off" spellCheck={false} className="field font-mono uppercase tracking-wider" value={code} onChange={(e) => setCode(e.target.value)} placeholder={owner ? "ABCD-EFGH-JKLM" : "ABCD-EFGH-JKLM-NPQR"} />
        </div>
        <div>
          <label className="label" htmlFor="rc-new">New password</label>
          <div className="relative">
            <input id="rc-new" name="password" type={show ? "text" : "password"} autoComplete="new-password" className="field pr-10" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="rc-help" />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p id="rc-help" className="mt-1 text-xs text-slate-500">At least 10 characters, with letters and a number or symbol.</p>
        </div>
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? "Checking…" : "Set new password"}
        </button>
        {footer}
      </form>
    </Shell>
  );
}

function EmailResetLink({ footer }: { footer: React.ReactNode }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sent)
    return (
      <Shell icon={MailCheck} title="Check your email" sub={`If an account exists for ${email}, we've sent a link to reset the password.`}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>The link works for 1 hour.</li>
          <li>Can&apos;t find it? Look in Spam or Promotions.</li>
        </ul>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setSent(false)}>Use another email</button>
          <Link href="/login" className="btn-ghost">Back to sign in</Link>
        </div>
      </Shell>
    );
  return (
    <Shell icon={KeyRound} title="Reset by email" sub="Enter the email you signed up with and we'll send you a link to choose a new one.">
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          const typed = String(new FormData(e.currentTarget).get("email") ?? "").trim();
          if (!typed) return setError("Enter your email.");
          setEmail(typed);
          setBusy(true);
          setError(null);
          try {
            await api("/api/auth/forgot-password", { body: { email: typed } });
            setSent(true);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div>
          <label className="label" htmlFor="fp-email">Email</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="fp-email" name="email" type="email" autoComplete="email" required className="field pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
        </div>
        <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        {footer}
      </form>
    </Shell>
  );
}

/** Opened from the reset email: chooses a new password and signs in. */
export function ResetPassword({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!token)
    return (
      <Shell icon={KeyRound} title="Link incomplete" sub="This page needs the link from the email.">
        <Link href="/forgot-password" className="btn-primary w-full">Send a new link</Link>
      </Shell>
    );
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <Shell icon={Lock} title="Choose a new password" sub="At least 10 characters, with letters and a number or symbol. You'll be signed in afterwards.">
      <form
        className="space-y-4"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirm) return;
          setBusy(true);
          setError(null);
          try {
            await api("/api/auth/reset-password", { body: { token, password } });
            window.location.href = "/dashboard";
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Something went wrong.");
            setBusy(false);
          }
        }}
      >
        {error ? (
          <Notice tone="error">
            {error} {/expired|used/i.test(error) ? <Link href="/forgot-password" className="font-semibold underline">Send a new link</Link> : null}
          </Notice>
        ) : null}
        <div>
          <label className="label" htmlFor="rp-new">New password</label>
          <div className="relative">
            <input id="rp-new" type={show ? "text" : "password"} autoComplete="new-password" className="field pr-10" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label={show ? "Hide password" : "Show password"}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="rp-confirm">Type it again</label>
          <input id="rp-confirm" type={show ? "text" : "password"} autoComplete="new-password" className="field" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-invalid={mismatch} />
          {mismatch ? <p className="mt-1 text-xs text-red-700">The two passwords don&apos;t match.</p> : null}
        </div>
        <button className="btn-primary w-full py-2.5" disabled={busy || password.length < 10 || password !== confirm}>{busy ? "Saving…" : "Save and sign in"}</button>
      </form>
    </Shell>
  );
}

/** Opened from the confirmation email: verifies the address straight away. */
export function VerifyEmail({ token }: { token: string }) {
  const [state, setState] = useState<"working" | "done" | "error">(token ? "working" : "error");
  const [error, setError] = useState("This page needs the link from the email.");
  const ran = useRef(false);
  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // the link is single-use, so don't send it twice
    api("/api/auth/verify-email", { body: { token } })
      .then(() => setState("done"))
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
        setState("error");
      });
  }, [token]);
  if (state === "working")
    return (
      <Shell icon={Mail} title="Confirming your email…" sub="One moment.">
        <Spinner label="Checking the link" />
      </Shell>
    );
  if (state === "done")
    return (
      <Shell icon={CheckCircle2} title="Email confirmed" sub="Thanks! Your email address is verified.">
        <Link href="/dashboard" className="btn-primary w-full">Go to my dashboard</Link>
      </Shell>
    );
  return (
    <Shell icon={Mail} title="This link didn't work" sub={error}>
      <Link href="/account" className="btn-primary w-full">Send a new link from my account</Link>
    </Shell>
  );
}
