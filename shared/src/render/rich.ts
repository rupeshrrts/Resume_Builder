/**
 * Bold inside bullet text is written as **like this** (the Markdown convention), so it lives
 * in plain-text storage and is easy to type or toggle with Ctrl+B. The PDF, DOCX and preview
 * renderers turn it into real bold; anything that reads the text for meaning (ATS checks,
 * scores, cover letters, plain-text export) uses stripBold() and never sees the markers.
 */

export interface Span {
  text: string;
  bold: boolean;
}

const BOLD = /\*\*(.+?)\*\*/gs;

/** Splits text into normal and bold runs; unmatched "**" stays as typed. */
export function boldSpans(text: string): Span[] {
  const out: Span[] = [];
  let last = 0;
  for (const m of text.matchAll(BOLD)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length || !out.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

export function stripBold(text: string): string {
  return text.replace(BOLD, "$1");
}

/**
 * Bold on/off for a textarea selection. With nothing selected it toggles the whole point.
 * Returns the new text and the selection to restore (covering the same words).
 */
export function toggleBold(text: string, start: number, end: number): { text: string; start: number; end: number } {
  if (start === end) {
    const plain = stripBold(text).trim();
    const allBold = /^\*\*[^*][\s\S]*\*\*$/.test(text.trim()) && boldSpans(text.trim()).length === 1;
    const next = allBold ? plain : `**${plain}**`;
    return { text: next, start: 0, end: next.length };
  }
  // Selection sits just inside existing markers: **|word|** → remove them.
  if (text.slice(start - 2, start) === "**" && text.slice(end, end + 2) === "**") {
    const next = text.slice(0, start - 2) + text.slice(start, end) + text.slice(end + 2);
    return { text: next, start: start - 2, end: end - 2 };
  }
  // Keep spaces outside the markers ("**word** next", not "**word **next").
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  const selected = text.slice(start, end);
  if (/^\*\*[\s\S]+\*\*$/.test(selected)) {
    const inner = selected.slice(2, -2);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  const inner = stripBold(selected);
  const next = `${text.slice(0, start)}**${inner}**${text.slice(end)}`;
  return { text: next, start: start + 2, end: start + 2 + inner.length };
}
