import type { ResumeSettings } from "../schema/resume";

/**
 * Layouts to try, in order, until the résumé fits on one page. "Continue on next page" only
 * ever uses the user's own settings. "Fit on one page" tightens spacing first, then line
 * height and margins, and shrinks the text only as a last resort, never below readable limits.
 * If even the last step doesn't fit, callers keep the first (the user's own settings) and let
 * the content continue on the next page. The PDF/DOCX export and the live preview walk the
 * same steps, so they settle on the same one.
 */
export function fitSteps(s: ResumeSettings): ResumeSettings[] {
  if (s.pageFit !== "fit") return [s];
  const tighter: Partial<ResumeSettings>[] = [
    { sectionSpacing: Math.max(4, s.sectionSpacing - 3) },
    { lineHeight: Math.max(1.15, s.lineHeight - 0.08) },
    { margin: Math.max(32, s.margin - 8) },
    { fontSize: Math.max(9.5, s.fontSize - 0.5) },
    { fontSize: Math.max(9, s.fontSize - 1), lineHeight: Math.max(1.1, s.lineHeight - 0.15), margin: Math.max(28, s.margin - 12) },
  ];
  const steps = [s];
  for (const change of tighter) {
    const next = { ...steps[steps.length - 1], ...change };
    const prev = steps[steps.length - 1];
    if (next.sectionSpacing !== prev.sectionSpacing || next.lineHeight !== prev.lineHeight || next.margin !== prev.margin || next.fontSize !== prev.fontSize) steps.push(next);
  }
  return steps;
}
