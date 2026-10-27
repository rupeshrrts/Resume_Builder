"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import type { Origin } from "@resume/shared/schema/resume";
import type { DiffPart } from "@resume/shared/diff";
import { Badge } from "../ui";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} type={type} className="field" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-h` : undefined} />
      {hint ? (
        <p id={`${id}-h`} className="mt-0.5 text-[11px] text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextArea({ label, value, onChange, placeholder, rows = 3, hideLabel }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; hideLabel?: boolean }) {
  const id = useId();
  return (
    <div>
      <label className={hideLabel ? "sr-only" : "label"} htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className="field resize-y" rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Month + year picker producing "YYYY-MM", "YYYY" or "". */
export function DateField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  const [y, mStored] = value.split("-");
  const [yearText, setYearText] = useState(y ?? "");
  // A month picked before the year is held here until the year is typed.
  const [pendingMonth, setPendingMonth] = useState<string | undefined>(undefined);
  const m = mStored ?? pendingMonth;
  // Follow external changes (undo, restore) unless the user is mid-way through typing a year.
  useEffect(() => {
    setYearText((t) => (t.length === 4 || t === "" ? (y ?? "") : t));
  }, [y]);
  const year = /^\d{4}$/.test(yearText) ? yearText : "";
  const emit = (yy: string, mm: string | undefined) => {
    if (!yy) setPendingMonth(mm);
    onChange(yy ? (mm ? `${yy}-${mm}` : yy) : "");
  };
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="label">{label}</legend>
      <div className="flex gap-1">
        <label className="sr-only" htmlFor={`${id}-m`}>
          {label} month
        </label>
        <select id={`${id}-m`} className="field w-[4.75rem] px-1.5" value={m ?? ""} onChange={(e) => emit(year || y || "", e.target.value || undefined)}>
          <option value="">–</option>
          {MONTHS.map((mo, i) => (
            <option key={mo} value={String(i + 1).padStart(2, "0")}>
              {mo}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${id}-y`}>
          {label} year
        </label>
        <input
          id={`${id}-y`}
          inputMode="numeric"
          maxLength={4}
          placeholder="YYYY"
          className="field w-[4.5rem] px-1.5"
          value={disabled ? "" : yearText}
          onChange={(e) => {
            const t = e.target.value.replace(/\D/g, "").slice(0, 4);
            setYearText(t);
            if (t.length === 4) emit(t, m);
            else if (!t) onChange("");
          }}
        />
      </div>
    </fieldset>
  );
}

export function OriginBadge({ origin }: { origin: Origin }) {
  if (origin === "ai")
    return (
      <Badge tone="violet" title="Rewritten with AI and accepted by you. Your original wording is kept and can be restored.">
        ✦ AI-assisted
      </Badge>
    );
  if (origin === "imported") return <Badge tone="slate" title="Imported from your uploaded file.">Imported</Badge>;
  return null;
}

export function EntryCard({
  id,
  heading,
  sub,
  onUp,
  onDown,
  onRemove,
  children,
}: {
  id: string;
  heading: string;
  sub?: string;
  onUp?: () => void;
  onDown?: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div id={id} className="rounded-md border border-slate-200 bg-white scroll-mt-24">
      <div className="flex items-center gap-1 border-b border-slate-100 px-2 py-1.5">
        <button className="btn-ghost min-w-0 flex-1 justify-start px-1 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span aria-hidden className="text-slate-400">{open ? "▾" : "▸"}</span>
          <span className="truncate font-medium">{heading || "Untitled"}</span>
          {sub ? <span className="truncate text-xs font-normal text-slate-500">{sub}</span> : null}
        </button>
        <IconBtn label="Move up" onClick={onUp} disabled={!onUp}>↑</IconBtn>
        <IconBtn label="Move down" onClick={onDown} disabled={!onDown}>↓</IconBtn>
        <IconBtn label="Remove entry" onClick={() => confirm("Remove this entry?") && onRemove()}>✕</IconBtn>
      </div>
      {open ? <div className="space-y-3 p-3">{children}</div> : null}
    </div>
  );
}

export function IconBtn({ label, onClick, disabled, children }: { label: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" className="btn-ghost h-7 w-7 shrink-0 p-0 text-slate-500" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function DiffView({ parts, side }: { parts: DiffPart[]; side: "old" | "new" }) {
  return (
    <span>
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "del" && side === "old" ? (
          <del key={i} className="bg-red-100 text-red-900 decoration-red-400">
            {p.text}
          </del>
        ) : p.type === "add" && side === "new" ? (
          <ins key={i} className="bg-emerald-100 text-emerald-900 no-underline">
            {p.text}
          </ins>
        ) : null,
      )}
    </span>
  );
}

export function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const out = [...arr];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function SectionHeader({ id, title, help, action }: { id: string; title: string; help?: string; action?: ReactNode }) {
  return (
    <div id={id} className="mb-2 flex scroll-mt-24 items-end justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>
        {help ? <p className="text-xs text-slate-500">{help}</p> : null}
      </div>
      {action}
    </div>
  );
}
