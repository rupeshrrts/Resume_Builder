import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Font } from "@react-pdf/renderer";
import * as fontkit from "fontkit";
import { FONTS, type FontId } from "@resume/shared/render/fonts";
import { toWinAnsi } from "@resume/shared/render/charset";

/**
 * Font files for PDF embedding (and optional DOCX embedding). The TTFs come from the
 * @expo-google-fonts packages, which ship the original Google Fonts files (SIL Open Font License).
 */

const require = createRequire(import.meta.url);

type FileFont = Exclude<FontId, "Helvetica" | "Times-Roman">;

const SOURCES: Record<FileFont, { pkg: string; prefix: string }> = {
  Inter: { pkg: "@expo-google-fonts/inter", prefix: "Inter" },
  "Source Sans 3": { pkg: "@expo-google-fonts/source-sans-3", prefix: "SourceSans3" },
  "IBM Plex Sans": { pkg: "@expo-google-fonts/ibm-plex-sans", prefix: "IBMPlexSans" },
  Merriweather: { pkg: "@expo-google-fonts/merriweather", prefix: "Merriweather" },
  "Source Serif 4": { pkg: "@expo-google-fonts/source-serif-4", prefix: "SourceSerif4" },
  "EB Garamond": { pkg: "@expo-google-fonts/eb-garamond", prefix: "EBGaramond" },
};

const FACES = { regular: "400Regular", italic: "400Regular_Italic", semibold: "600SemiBold", bold: "700Bold" } as const;
type Face = keyof typeof FACES;

function packageRoot(pkg: string): string {
  let dir = path.dirname(require.resolve(pkg));
  for (let i = 0; i < 6; i++) {
    const pj = path.join(dir, "package.json");
    if (fs.existsSync(pj) && JSON.parse(fs.readFileSync(pj, "utf8")).name === pkg) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`Font package not found: ${pkg}`);
}

const roots = new Map<string, string>();
export function fontFile(id: FileFont, face: Face): string {
  const s = SOURCES[id];
  if (!roots.has(s.pkg)) roots.set(s.pkg, packageRoot(s.pkg));
  return path.join(roots.get(s.pkg)!, FACES[face], `${s.prefix}_${FACES[face]}.ttf`);
}

export function isFileFont(id: FontId): id is FileFont {
  return !FONTS[id].builtin;
}

let registered = false;
export function registerPdfFonts() {
  if (registered) return;
  registered = true;
  for (const id of Object.keys(SOURCES) as FileFont[]) {
    Font.register({
      family: id,
      fonts: [
        { src: fontFile(id, "regular"), fontWeight: 400 },
        { src: fontFile(id, "italic"), fontWeight: 400, fontStyle: "italic" },
        { src: fontFile(id, "semibold"), fontWeight: 600 },
        { src: fontFile(id, "bold"), fontWeight: 700 },
      ],
    });
  }
  // Never hyphenate: split words break keyword matching when text is extracted.
  Font.registerHyphenationCallback((word) => [word]);
}

type LoadedSource = { data: unknown; loadResultPromise: Promise<void> | null };

/**
 * Drops the parsed font objects so the next PDF loads its own. Reusing them across documents
 * corrupted later PDFs: after a résumé with bold 11.25pt skill labels, a later one drew "B.Tech"
 * as ".Tech" and its text extracted as "#ce%h". react-pdf's own Font.reset() clears only `data`
 * and leaves the load promise, so fonts would never reload; this clears both.
 */
function releasePdfFonts() {
  // Only the font files registered above; react-pdf's built-in Helvetica/Times don't reload.
  const families = Font.getRegisteredFonts() as unknown as Record<string, { sources: LoadedSource[] }>;
  for (const id of Object.keys(SOURCES))
    for (const source of families[id]?.sources ?? []) {
      source.data = null;
      source.loadResultPromise = null;
    }
}

let queue: Promise<unknown> = Promise.resolve();
/**
 * Runs one PDF render at a time with freshly loaded fonts. Renders are serialised because
 * releasing fonts mid-way through another render would pull them out from under it.
 */
export function withPdfFonts<T>(render: () => Promise<T>): Promise<T> {
  const run = queue.then(() => {
    registerPdfFonts();
    return render();
  }).finally(releasePdfFonts);
  queue = run.catch(() => undefined);
  return run;
}

// ---- character coverage ----

const coverage = new Map<FileFont, { hasGlyphForCodePoint(cp: number): boolean }>();
function fontFor(id: FileFont) {
  if (!coverage.has(id)) {
    const open = (fontkit as unknown as { openSync: (p: string) => { hasGlyphForCodePoint(cp: number): boolean } }).openSync;
    coverage.set(id, open(fontFile(id, "regular")));
  }
  return coverage.get(id)!;
}

const REPLACEMENTS: Record<string, string> = { "₹": "Rs.", "→": "->", "←": "<-", "✓": "-", "✔": "-", "★": "*", "​": "" };

/**
 * Makes text safe for the chosen fonts: characters a font can't draw are mapped to close
 * equivalents (or "?") and reported, rather than silently rendering as blanks.
 */
export function makeFontSafe(text: string, fonts: FontId[]): { text: string; replaced: string[] } {
  if (fonts.some((f) => FONTS[f].builtin)) {
    const w = toWinAnsi(text);
    if (fonts.every((f) => FONTS[f].builtin)) return w;
    text = w.text;
  }
  const files = fonts.filter(isFileFont).map(fontFor);
  let out = "";
  const replaced: string[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (ch === "\n" || files.every((f) => f.hasGlyphForCodePoint(cp))) {
      out += ch;
      continue;
    }
    replaced.push(ch);
    if (ch in REPLACEMENTS) out += REPLACEMENTS[ch];
    else {
      const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      out += base && [...base].every((b) => files.every((f) => f.hasGlyphForCodePoint(b.codePointAt(0)!))) ? base : "?";
    }
  }
  return { text: out, replaced };
}

// ---- DOCX embedding ----

const EMBED_FAMILY_LIMIT = 900 * 1024;
const EMBED_TOTAL_LIMIT = 1400 * 1024;

export interface DocxFontPlan {
  body: string;
  heading: string;
  embedded: { name: string; data: Buffer; bold: Buffer }[];
  substituted: { font: FontId; with: string }[];
}

/**
 * Word files embed the chosen fonts when they're small enough to keep the DOCX upload-friendly;
 * otherwise a widely installed substitute is named instead (and reported).
 */
export function planDocxFonts(body: FontId, heading: FontId): DocxFontPlan {
  const plan: DocxFontPlan = { body: FONTS[body].docxName, heading: FONTS[heading].docxName, embedded: [], substituted: [] };
  let total = 0;
  for (const id of [...new Set([body, heading])]) {
    if (!isFileFont(id)) continue;
    const regular = fs.readFileSync(fontFile(id, "regular"));
    const bold = fs.readFileSync(fontFile(id, "bold"));
    const size = regular.length + bold.length;
    if (size <= EMBED_FAMILY_LIMIT && total + size <= EMBED_TOTAL_LIMIT) {
      plan.embedded.push({ name: FONTS[id].docxName, data: regular, bold });
      total += size;
    } else {
      plan.substituted.push({ font: id, with: FONTS[id].docxFallback });
      if (id === body) plan.body = FONTS[id].docxFallback;
      if (id === heading) plan.heading = FONTS[id].docxFallback;
    }
  }
  return plan;
}
