"use client";

import { useState } from "react";
import { newId, type Bullet } from "@resume/shared/schema/resume";
import { analyzeBullet } from "@resume/shared/analysis/bullets";
import { stripBold } from "@resume/shared/render/rich";
import { BoldButton, applyBold, isBoldKey } from "./bold";
import { diffWords } from "@resume/shared/diff";
import { DiffView, IconBtn, OriginBadge, move } from "./fields";
import { BulletAssist } from "./BulletAssist";
import { useEditor } from "./context";

export function BulletList({
  bullets,
  onChange,
  label = "Bullet points",
  placeholder = "What did you do, how, and what changed as a result?",
}: {
  bullets: Bullet[];
  onChange: (b: Bullet[], structural?: boolean) => void;
  label?: string;
  placeholder?: string;
}) {
  const ed = useEditor();
  const [tipsFor, setTipsFor] = useState<string | null>(null);
  const [compareFor, setCompareFor] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Bullet>, structural = false) => onChange(bullets.map((b, j) => (j === i ? { ...b, ...patch } : b)), structural);

  return (
    <div>
      <p className="label">
        {label} <span className="font-normal text-slate-400">· select words and press B (Ctrl+B) to make them bold</span>
      </p>
      <ul className="space-y-2">
        {bullets.map((b, i) => {
          const a = b.text.trim() ? analyzeBullet(stripBold(b.text)) : null;
          const open = ed.assistTarget === b.id;
          return (
            <li key={b.id} id={`b-${b.id}`} className="scroll-mt-28">
              <div className="flex items-start gap-1">
                <span aria-hidden className="mt-2 text-slate-400">•</span>
                <div className="min-w-0 flex-1">
                  <label className="sr-only" htmlFor={`bt-${b.id}`}>{`${label} ${i + 1}`}</label>
                  <textarea
                    id={`bt-${b.id}`}
                    className="field resize-y"
                    rows={Math.min(5, Math.max(2, Math.ceil(b.text.length / 80)))}
                    value={b.text}
                    placeholder={placeholder}
                    // Editing an AI-assisted bullet keeps its origin so the original stays restorable.
                    onChange={(e) => set(i, { text: e.target.value })}
                    onKeyDown={(e) => {
                      if (!isBoldKey(e)) return;
                      e.preventDefault();
                      applyBold(e.currentTarget, b.text, (text) => set(i, { text }));
                    }}
                  />
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <BoldButton target={`bt-${b.id}`} text={b.text} onText={(text) => set(i, { text })} />
                    <OriginBadge origin={b.origin} />
                    {a ? (
                      <span className="text-[11px] text-slate-500">
                        {a.wordCount} words{a.hasMetric ? " · has a measurable detail" : ""}
                      </span>
                    ) : null}
                    {a && a.issues.length ? (
                      <button className="text-[11px] text-amber-800 underline" onClick={() => setTipsFor(tipsFor === b.id ? null : b.id)} aria-expanded={tipsFor === b.id}>
                        {a.issues.length} tip{a.issues.length > 1 ? "s" : ""}
                      </button>
                    ) : null}
                    {b.text.trim() ? (
                      <button className="text-[11px] font-medium text-violet-800 underline" onClick={() => ed.setAssistTarget(open ? null : b.id)} aria-expanded={open}>
                        ✦ Improve with AI
                      </button>
                    ) : null}
                    {b.origin === "ai" && b.sourceText !== undefined ? (
                      <>
                        <button className="text-[11px] text-slate-700 underline" onClick={() => setCompareFor(compareFor === b.id ? null : b.id)} aria-expanded={compareFor === b.id}>
                          Compare with original
                        </button>
                        <button className="text-[11px] text-slate-700 underline" onClick={() => set(i, { text: b.sourceText!, origin: "user", sourceText: undefined }, true)}>
                          Restore original
                        </button>
                      </>
                    ) : null}
                  </div>
                  {tipsFor === b.id && a ? (
                    <ul className="mt-1 list-disc space-y-0.5 rounded bg-amber-50 py-1.5 pl-6 pr-2 text-xs text-amber-900">
                      {a.issues.map((t) => <li key={t}>{t}</li>)}
                    </ul>
                  ) : null}
                  {compareFor === b.id && b.sourceText !== undefined ? (
                    <div className="mt-1 grid gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs sm:grid-cols-2">
                      <div><p className="font-medium text-slate-500">Your original</p><DiffView parts={diffWords(b.sourceText, b.text)} side="old" /></div>
                      <div><p className="font-medium text-slate-500">Current</p><DiffView parts={diffWords(b.sourceText, b.text)} side="new" /></div>
                    </div>
                  ) : null}
                  {open ? (
                    <BulletAssist
                      bulletId={b.id}
                      original={b.text}
                      onClose={() => ed.setAssistTarget(null)}
                      onAccept={(text) => {
                        set(i, { text, origin: "ai", sourceText: b.sourceText ?? b.text }, true);
                        ed.setAssistTarget(null);
                      }}
                    />
                  ) : null}
                </div>
                <div className="flex flex-col">
                  <IconBtn label="Move bullet up" onClick={i > 0 ? () => onChange(move(bullets, i, -1), true) : undefined} disabled={i === 0}>↑</IconBtn>
                  <IconBtn label="Move bullet down" onClick={i < bullets.length - 1 ? () => onChange(move(bullets, i, 1), true) : undefined} disabled={i === bullets.length - 1}>↓</IconBtn>
                  <IconBtn label="Delete bullet" onClick={() => onChange(bullets.filter((_, j) => j !== i), true)}>✕</IconBtn>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <button className="btn-ghost mt-1 h-7 px-2 text-xs text-brand-700" onClick={() => onChange([...bullets, { id: newId("b"), text: "", origin: "user" }], true)}>
        + Add bullet
      </button>
    </div>
  );
}
