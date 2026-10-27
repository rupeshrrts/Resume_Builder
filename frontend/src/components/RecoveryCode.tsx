"use client";

import { useState } from "react";
import { Check, Copy, Download, ShieldCheck } from "lucide-react";

/**
 * Shows a recovery code once, with copy and download. It's the way back in if the password is
 * forgotten (no email needed), so the user confirms they've saved it before moving on.
 */
export function RecoveryCodeCard({ code, email, onDone, doneLabel = "Continue" }: { code: string; email: string; onDone: () => void; doneLabel?: string }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const text = `Free ATS Resume Builder: recovery code\n\nAccount: ${email}\nRecovery code: ${code}\n\nUse it on the "Forgot password?" page to set a new password.\nEach code works once; you'll get a new one after using it.\n`;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p>Save this recovery code somewhere safe (notes app, photo, or download). If you forget your password, it lets you set a new one. It&apos;s shown only now.</p>
      </div>
      <p className="select-all rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 px-4 py-3 text-center font-mono text-xl font-bold tracking-widest text-brand-900" aria-label="Recovery code">
        {code}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setSaved(true);
            } catch {
              /* clipboard blocked: the code is selectable */
            }
          }}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copied ? "Copied" : "Copy"}
        </button>
        <a
          className="btn-secondary"
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
          download="resume-builder-recovery-code.txt"
          onClick={() => setSaved(true)}
        >
          <Download className="h-4 w-4" aria-hidden /> Download
        </a>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        I&apos;ve saved my recovery code
      </label>
      <button type="button" className="btn-primary w-full py-2.5" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  );
}
