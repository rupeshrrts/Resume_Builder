"use client";

import { toggleBold } from "@resume/shared/render/rich";

/** Bolds the selected words in a bullet textarea (the whole point when nothing is selected) and keeps them selected. */
export function applyBold(el: HTMLTextAreaElement | null, text: string, setText: (t: string) => void) {
  const r = toggleBold(text, el?.selectionStart ?? 0, el?.selectionEnd ?? 0);
  setText(r.text);
  requestAnimationFrame(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(r.start, r.end);
  });
}

export const isBoldKey = (e: React.KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "b";

/** "B" button for the bullet textarea with id `target`. */
export function BoldButton({ target, text, onText }: { target: string; text: string; onText: (t: string) => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-slate-200 bg-white px-1.5 text-xs font-bold text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      title="Bold: select words first, or click with nothing selected to bold the whole point (Ctrl+B)"
      aria-label="Bold"
      // Keep the textarea's focus and selection when the button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => applyBold(document.getElementById(target) as HTMLTextAreaElement | null, text, onText)}
    >
      B
    </button>
  );
}
