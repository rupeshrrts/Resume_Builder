"use client";

import Link from "next/link";
import { useState } from "react";
import { Eye, EyeOff, Lock, Mail, Phone, ShieldCheck, Target, UserRound, WandSparkles } from "lucide-react";
import { api, ApiError } from "@/lib/api-client";
import { Notice } from "./ui";
import { RecoveryCodeCard } from "./RecoveryCode";

function strength(pw: string) {
  let s = 0;
  if (pw.length >= 10) s++;
  if (pw.length >= 14) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const isLogin = mode === "login";
  const st = strength(password);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read what's actually in the boxes: browser autofill doesn't always tell React about its values.
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) ?? "").trim();
    const values = { fullName: v("fullName"), phone: v("phone"), email: v("email"), password: String(fd.get("password") ?? "") };
    setEmail(values.email);
    const missing = !values.email ? "Enter your email." : !values.password ? "Enter your password." : !isLogin && !values.fullName ? "Enter your full name." : !isLogin && !values.phone ? "Enter your mobile number." : null;
    if (missing) return setError(missing);
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ recoveryCode?: string }>(`/api/auth/${mode}`, { body: isLogin ? { email: values.email, password: values.password } : values });
      if (r.recoveryCode) {
        setRecovery(r.recoveryCode);
        setBusy(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-2">
      <div className="hidden lg:block">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 p-10 text-white shadow-[var(--shadow-lift)]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <h2 className="relative text-3xl font-extrabold leading-tight">Your experience, presented clearly.</h2>
          <ul className="relative mt-8 space-y-5">
            {[
              [Target, "Match any job", "See exactly which requirements your resume shows evidence for."],
              [WandSparkles, "Improve truthfully", "AI suggestions use only your facts, and new claims need your OK."],
              [ShieldCheck, "Private by default", "Uploads are never stored. Export or delete your data any time."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Target;
              return (
                <li key={t as string} className="flex gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15"><I className="h-5 w-5" aria-hidden /></span>
                  <span><span className="block font-semibold">{t as string}</span><span className="text-sm text-brand-100">{d as string}</span></span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {recovery ? (
        <div className="mx-auto w-full max-w-sm animate-fade-up">
          <h1 className="text-2xl font-extrabold">Account created 🎉</h1>
          <p className="mt-1 text-sm text-slate-600">One last step before you start.</p>
          <div className="card mt-6 p-6">
            <RecoveryCodeCard code={recovery} email={email} onDone={() => (window.location.href = "/dashboard")} doneLabel="Start building my resume" />
          </div>
        </div>
      ) : (
      <div className="mx-auto w-full max-w-sm animate-fade-up">
        <h1 className="text-2xl font-extrabold">{isLogin ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-slate-600">{isLogin ? "Sign in to continue to your resumes." : "Free to use. Your resumes stay private to your account."}</p>
        <form onSubmit={submit} className="card mt-6 space-y-4 p-6" noValidate>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {!isLogin ? (
            <>
              <div>
                <label className="label" htmlFor="full-name">Full name</label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input id="full-name" name="fullName" autoComplete="name" required className="field pl-9" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Rupesh Kumar" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="phone">Mobile number</label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" required className="field pl-9" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" />
                </div>
              </div>
            </>
          ) : null}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input id="email" name="email" type="email" autoComplete="email" required className="field pl-9" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label" htmlFor="password">Password</label>
              {isLogin ? <Link href="/forgot-password" className="mb-1 text-xs font-semibold text-brand-700 hover:underline">Forgot password?</Link> : null}
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                autoComplete={isLogin ? "current-password" : "new-password"}
                required
                className="field pl-9 pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-describedby={isLogin ? undefined : "pw-help"}
              />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {!isLogin ? (
              <>
                <div className="mt-2 grid grid-cols-4 gap-1" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className={`h-1 rounded-full transition ${i < st ? (st <= 1 ? "bg-red-400" : st <= 2 ? "bg-amber-400" : "bg-emerald-500") : "bg-slate-200"}`} />
                  ))}
                </div>
                <p id="pw-help" className="mt-1 text-xs text-slate-500">At least 10 characters, with letters and a number or symbol.</p>
              </>
            ) : null}
          </div>
          <button className="btn-primary w-full py-2.5" disabled={busy}>
            {busy ? "Please wait…" : isLogin ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="mt-5 text-center text-sm text-slate-600">
          {isLogin ? "New here? " : "Already have an account? "}
          <Link className="font-semibold text-brand-700 hover:underline" href={isLogin ? "/register" : "/login"}>
            {isLogin ? "Create an account" : "Sign in"}
          </Link>
        </p>
        {isLogin ? (
          <p className="mt-2 text-center text-xs text-slate-500">
            Site owner? <Link className="font-semibold text-slate-600 hover:underline" href="/admin/login">Admin login</Link>
          </p>
        ) : null}
      </div>
      )}
    </div>
  );
}
