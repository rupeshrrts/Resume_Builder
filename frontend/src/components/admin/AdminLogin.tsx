"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, ShieldCheck } from "lucide-react";
import type { SessionUser } from "@resume/shared/types/api";
import { api, ApiError } from "@/lib/api-client";
import { Notice } from "../ui";

type Me = { user: SessionUser; canActivateAdmin: boolean };

/**
 * Owner sign-in: email + password, then straight to /admin. The first time (admin not switched on yet)
 * it also asks for the setup code from the server log. Other accounts are told they aren't admins.
 */
export function AdminLogin() {
  const [step, setStep] = useState<"login" | "code" | "notAdmin">("login");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function afterSignIn() {
    const me = await api<Me>("/api/auth/me");
    if (me.user.isAdmin) window.location.href = "/admin";
    else setStep(me.canActivateAdmin ? "code" : "notAdmin");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-sm flex-col justify-center px-4 py-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-brand-700 text-white shadow-md"><ShieldCheck className="h-6 w-6" aria-hidden /></span>
      <h1 className="mt-4 text-2xl font-extrabold">Admin login</h1>
      <p className="mt-1 text-sm text-slate-600">For the site owner. Sign in to open the admin dashboard.</p>

      <div className="card mt-6 space-y-4 p-6">
        {error ? <Notice tone="error">{error}</Notice> : null}

        {step === "login" ? (
          <form
            className="space-y-4"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              // Read the boxes directly: browser autofill doesn't always tell React about its values.
              const fd = new FormData(e.currentTarget);
              const email = String(fd.get("email") ?? "").trim();
              const password = String(fd.get("password") ?? "");
              if (!email || !password) return setError(!email ? "Enter your email." : "Enter your password.");
              setBusy(true);
              setError(null);
              try {
                await api("/api/auth/login", { body: { email, password } });
                await afterSignIn();
              } catch (err) {
                setError(err instanceof ApiError ? err.message : "Something went wrong.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <div>
              <label className="label" htmlFor="al-email">Admin email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input id="al-email" name="email" type="email" autoComplete="email" className="field pl-9" placeholder="you@example.com" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="label" htmlFor="al-password">Password</label>
                <Link href="/forgot-password?owner=1" className="mb-1 text-xs font-semibold text-brand-700 hover:underline">Forgot password?</Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input id="al-password" name="password" type={show ? "text" : "password"} autoComplete="current-password" className="field pl-9 pr-10" />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? "Signing in…" : "Sign in to admin"}</button>
          </form>
        ) : null}

        {step === "code" ? (
          <form
            className="space-y-4"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const code = String(new FormData(e.currentTarget).get("code") ?? "");
              if (code.replace(/[^a-z]/gi, "").length < 12) return setError("Enter the full setup code, like ABCD-EFGH-JKLM.");
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
            <Notice>
              You&apos;re signed in. One time only: enter the setup code from your server log to switch on admin. Online it&apos;s in <strong>Render → your API → Logs</strong>; search for <code>admin_setup_code</code>.
            </Notice>
            <div>
              <label className="label" htmlFor="al-code">Setup code</label>
              <input id="al-code" name="code" autoComplete="off" spellCheck={false} className="field font-mono uppercase tracking-wider" placeholder="ABCD-EFGH-JKLM" />
            </div>
            <button className="btn-primary w-full py-2.5" disabled={busy}>{busy ? "Checking…" : "Activate and open dashboard"}</button>
          </form>
        ) : null}

        {step === "notAdmin" ? (
          <div className="space-y-3 text-sm">
            <Notice tone="warn">You&apos;re signed in, but this account isn&apos;t the site owner&apos;s, so it can&apos;t open the admin dashboard.</Notice>
            <Link href="/dashboard" className="btn-secondary w-full">Go to my resumes</Link>
          </div>
        ) : null}
      </div>

      <p className="mt-5 text-center text-sm text-slate-600">
        Not the owner? <Link href="/login" className="font-semibold text-brand-700 hover:underline">Normal sign in</Link>
      </p>
    </div>
  );
}
