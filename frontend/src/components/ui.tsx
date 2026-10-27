"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export function Badge({ children, tone = "slate", title }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" | "violet"; title?: string }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
    amber: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
    red: "bg-red-50 text-red-800 ring-1 ring-red-200",
    blue: "bg-brand-50 text-brand-800 ring-1 ring-brand-100",
    violet: "bg-violet-50 text-violet-800 ring-1 ring-violet-200",
  };
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function scoreTone(score: number | null): "green" | "amber" | "red" | "slate" {
  if (score === null) return "slate";
  return score >= 75 ? "green" : score >= 50 ? "amber" : "red";
}

export function ScoreRing({ score, size = 72, label }: { score: number | null; size?: number; label: string }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const v = score ?? 0;
  const color = score === null ? "#cbd5e1" : v >= 75 ? "#10b981" : v >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${score === null ? "not available" : `${score} out of 100`}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={6} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(.2,.7,.2,1), stroke 0.3s" }} />
      </svg>
      <span className="absolute font-display font-extrabold tabular-nums text-slate-900" style={{ fontSize: size * 0.26 }}>{score ?? "–"}</span>
    </div>
  );
}

export function Bar({ value }: { value: number | null }) {
  const v = value ?? 0;
  const color = value === null ? "bg-slate-300" : v >= 75 ? "bg-emerald-600" : v >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100" aria-hidden>
      <div className={`h-1.5 rounded-full ${color} transition-[width] duration-500`} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl border border-slate-200 p-0 shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm ${wide ? "max-w-4xl" : "max-w-lg"}`}
    >
      {open ? (
        <div className="p-6">
          <div className="mb-3 flex items-start justify-between gap-4">
            <h2 id={id} className="text-lg font-bold">
              {title}
            </h2>
            <button className="btn-ghost -mr-2 -mt-1 px-2" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      ) : null}
    </dialog>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: ReactNode }) {
  const tones = {
    info: "border-brand-100 bg-brand-50 text-brand-800",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-xl border px-3.5 py-2.5 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-600" role="status">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" aria-hidden />
      {label}
    </span>
  );
}
