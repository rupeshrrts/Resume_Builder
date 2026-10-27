/**
 * The built-in PDF fonts (Helvetica, Times) use the WinAnsi character set. Characters outside
 * it would render as blanks, so they are mapped to close equivalents and reported to the user.
 */

const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const REPLACEMENTS: Record<string, string> = {
  "₹": "Rs.",
  "→": "->",
  "←": "<-",
  "⇒": "=>",
  "≥": ">=",
  "≤": "<=",
  "≈": "~",
  "✓": "-",
  "✔": "-",
  "★": "*",
  "●": "•",
  "▪": "•",
  "◦": "•",
  "‣": "•",
  "➢": "•",
  "►": "•",
  "‐": "-",
  "‑": "-",
  "‒": "–",
  "−": "-",
  " ": " ",
  "​": "",
  " ": " ",
};

function supported(ch: string) {
  const c = ch.codePointAt(0)!;
  return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.includes(ch) || ch === "\n";
}

export function toWinAnsi(s: string): { text: string; replaced: string[] } {
  let out = "";
  const replaced: string[] = [];
  for (const ch of s) {
    if (supported(ch)) out += ch;
    else if (ch in REPLACEMENTS) {
      out += REPLACEMENTS[ch];
      if (REPLACEMENTS[ch] !== "" && ch.trim()) replaced.push(ch);
    } else {
      // Strip combining accents if the base letter is supported (e.g. "ā" -> "a").
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (base && [...base].every(supported)) out += base;
      else out += "?";
      replaced.push(ch);
    }
  }
  return { text: out, replaced };
}
