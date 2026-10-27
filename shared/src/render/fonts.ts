/**
 * Typefaces available for resumes. The PDF embeds the actual font files (except the two
 * PDF built-ins), and the browser preview loads the same families, so what users see
 * matches what they download.
 */

export const FONT_IDS = ["Inter", "Source Sans 3", "IBM Plex Sans", "Merriweather", "Source Serif 4", "EB Garamond", "Helvetica", "Times-Roman"] as const;
export type FontId = (typeof FONT_IDS)[number];

export interface FontDef {
  id: FontId;
  label: string;
  kind: "sans" | "serif";
  /** CSS variable set by the frontend's font loader, used by the live preview. */
  cssVar: string | null;
  cssFallback: string;
  /** Font name written into DOCX files. */
  docxName: string;
  /** Widely installed substitute used in DOCX when the font isn't embedded. */
  docxFallback: string;
  /** Built-in PDF font (no embedding, WinAnsi characters only). */
  builtin: boolean;
}

export const FONTS: Record<FontId, FontDef> = {
  Inter: { id: "Inter", label: "Inter", kind: "sans", cssVar: "--font-body", cssFallback: "Arial, sans-serif", docxName: "Inter", docxFallback: "Calibri", builtin: false },
  "Source Sans 3": { id: "Source Sans 3", label: "Source Sans", kind: "sans", cssVar: "--font-rp-source-sans", cssFallback: "Arial, sans-serif", docxName: "Source Sans 3", docxFallback: "Calibri", builtin: false },
  "IBM Plex Sans": { id: "IBM Plex Sans", label: "IBM Plex Sans", kind: "sans", cssVar: "--font-rp-plex", cssFallback: "Arial, sans-serif", docxName: "IBM Plex Sans", docxFallback: "Calibri", builtin: false },
  Merriweather: { id: "Merriweather", label: "Merriweather", kind: "serif", cssVar: "--font-rp-merriweather", cssFallback: "Georgia, serif", docxName: "Merriweather", docxFallback: "Georgia", builtin: false },
  "Source Serif 4": { id: "Source Serif 4", label: "Source Serif", kind: "serif", cssVar: "--font-rp-source-serif", cssFallback: "Georgia, serif", docxName: "Source Serif 4", docxFallback: "Cambria", builtin: false },
  "EB Garamond": { id: "EB Garamond", label: "EB Garamond", kind: "serif", cssVar: "--font-rp-garamond", cssFallback: "Garamond, Georgia, serif", docxName: "EB Garamond", docxFallback: "Garamond", builtin: false },
  Helvetica: { id: "Helvetica", label: "Helvetica / Arial (basic)", kind: "sans", cssVar: null, cssFallback: "Helvetica, Arial, sans-serif", docxName: "Arial", docxFallback: "Arial", builtin: true },
  "Times-Roman": { id: "Times-Roman", label: "Times (basic)", kind: "serif", cssVar: null, cssFallback: '"Times New Roman", Times, serif', docxName: "Times New Roman", docxFallback: "Times New Roman", builtin: true },
};

/** CSS font-family value for the browser preview. */
export function cssFontStack(id: FontId): string {
  const f = FONTS[id];
  return f.cssVar ? `var(${f.cssVar}), ${f.cssFallback}` : f.cssFallback;
}
