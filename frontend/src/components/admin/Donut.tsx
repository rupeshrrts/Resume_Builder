"use client";

import { useState } from "react";

/**
 * Categorical colours in fixed order (validated for colour-blind separation). Three are below 3:1
 * contrast on white, so every chart also has a text legend with counts: colour is never the only cue.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"] as const;
/** "Other" and "not yet" slices: neutral, so they recede behind the named ones. */
export const NEUTRAL = "#cbd5e1";

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Keeps the largest slices and folds the rest into "Other" (never more than 5 named slices). */
export function topWithOther(slices: Slice[], keep = 4): Slice[] {
  const sorted = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= keep + 1) return sorted;
  const rest = sorted.slice(keep).reduce((a, s) => a + s.value, 0);
  return [...sorted.slice(0, keep), { label: "Other", value: rest, color: NEUTRAL }];
}

const pct = (v: number, total: number) => (total ? Math.round((v / total) * 100) : 0);

/** A donut (ring) chart for part-to-whole: total in the middle, legend with counts and shares. */
export function Donut({ title, slices, centerLabel, empty }: { title: string; slices: Slice[]; centerLabel: string; empty: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = slices.filter((s) => s.value > 0);
  const total = shown.reduce((a, s) => a + s.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  const gap = shown.length > 1 ? 2.5 : 0; // a sliver of background between slices
  let offset = 0;
  const focus = hover != null ? shown[hover] : null;

  return (
    <section className="card flex flex-col p-4" aria-label={title}>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <div className="mt-3 flex flex-1 items-center gap-4">
        <div className="relative shrink-0">
          <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`${title}: ${shown.map((s) => `${s.label} ${s.value}`).join(", ") || empty}`}>
            <g transform="rotate(-90 66 66)">
              <circle cx="66" cy="66" r={R} fill="none" stroke="#f1f5f9" strokeWidth="18" />
              {shown.map((s, i) => {
                const len = (s.value / total) * C;
                const dash = Math.max(0.5, len - gap);
                const el = (
                  <circle
                    key={s.label}
                    cx="66"
                    cy="66"
                    r={R}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={hover === i ? 21 : 18}
                    strokeDasharray={`${dash} ${C - dash}`}
                    strokeDashoffset={-offset}
                    opacity={hover == null || hover === i ? 1 : 0.35}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  />
                );
                offset += len;
                return el;
              })}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="font-display text-xl font-extrabold tabular-nums text-slate-900">{focus ? `${pct(focus.value, total)}%` : total.toLocaleString("en-IN")}</span>
            <span className="max-w-[70px] truncate text-[10px] text-slate-500">{focus ? focus.label : centerLabel}</span>
          </div>
        </div>
        {total === 0 ? (
          <p className="text-xs text-slate-500">{empty}</p>
        ) : (
          <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
            {shown.map((s, i) => (
              <li
                key={s.label}
                className={`flex items-center gap-2 rounded px-1 py-0.5 ${hover === i ? "bg-slate-50" : ""}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate text-slate-700">{s.label}</span>
                <span className="tabular-nums text-slate-900">{s.value.toLocaleString("en-IN")}</span>
                <span className="w-9 text-right tabular-nums text-slate-500">{pct(s.value, total)}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
