import JSZip from "jszip";
import type { LayoutSignals } from "@resume/shared/analysis/ats";

/**
 * Text and layout extraction for uploaded resumes. Uploaded files are treated as untrusted:
 * type is decided by magic bytes (not file name or MIME type), sizes are capped, parsing
 * runs with a timeout, and the original file is never written to disk or stored.
 */

export class UploadError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

export interface Extraction {
  format: "pdf" | "docx";
  text: string;
  lines: string[];
  links: string[];
  layout: LayoutSignals;
  warnings: string[];
}

export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024;
const MAX_PDF_PAGES = 10;
const MAX_DOCX_XML_BYTES = 20 * 1024 * 1024;

export function sniffFormat(buf: Uint8Array): "pdf" | "docx" | "doc" | null {
  const head = Buffer.from(buf.subarray(0, 8));
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return "docx";
  if (head.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "doc";
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new UploadError(`${what} took too long to read. The file may be damaged or unusually complex.`, "timeout")), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export async function extractFile(buf: Uint8Array): Promise<Extraction> {
  if (buf.byteLength === 0) throw new UploadError("The file is empty.", "empty");
  if (buf.byteLength > MAX_UPLOAD_BYTES) throw new UploadError(`The file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`, "too_large");
  const fmt = sniffFormat(buf);
  if (fmt === "doc") throw new UploadError("Old .doc files aren't supported. Save it as .docx or PDF and upload again.", "doc");
  if (!fmt) throw new UploadError("Only PDF and DOCX files are supported.", "unsupported");
  return fmt === "pdf" ? withTimeout(extractPdf(buf), 20000, "PDF") : withTimeout(extractDocx(buf), 20000, "DOCX");
}

// ---------------- PDF ----------------

interface Item {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Groups text items into visual lines, top to bottom, left to right. */
function itemsToLines(items: Item[]): { y: number; x0: number; x1: number; text: string }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    const tol = Math.max(2, it.h * 0.45);
    if (row && Math.abs(row[0].y - it.y) <= tol) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = "";
    let prevEnd = -Infinity;
    for (const it of row) {
      const gap = it.x - prevEnd;
      if (text && gap > Math.max(1.5, it.h * 0.18) && !text.endsWith(" ") && !it.str.startsWith(" ")) text += gap > it.h * 2.5 ? "   " : " ";
      text += it.str;
      prevEnd = it.x + it.w;
    }
    return { y: row[0].y, x0: row[0].x, x1: prevEnd, text: text.replace(/\s+$/, "") };
  });
}

/**
 * Detects a vertical gutter: an x-band in the middle of the page that almost no text run
 * crosses, with substantial text on both sides. Works on raw text runs, because side-by-side
 * columns share baselines and would be merged into single rows. Returns the gutter x or null.
 */
function findGutter(items: Item[], pageWidth: number): number | null {
  const lines = items.map((i) => ({ x0: i.x, x1: i.x + i.w }));
  if (lines.length < 8) return null;
  const buckets = 50;
  const cover = new Array(buckets).fill(0);
  for (const l of lines) {
    const a = Math.max(0, Math.floor((l.x0 / pageWidth) * buckets));
    const b = Math.min(buckets - 1, Math.floor((l.x1 / pageWidth) * buckets));
    for (let i = a; i <= b; i++) cover[i]++;
  }
  let best: { i: number; v: number } | null = null;
  for (let i = Math.floor(buckets * 0.22); i <= Math.floor(buckets * 0.78); i++) {
    if (!best || cover[i] < best.v) best = { i, v: cover[i] };
  }
  if (!best || best.v > lines.length * 0.04) return null;
  const gx = ((best.i + 0.5) / buckets) * pageWidth;
  const left = lines.filter((l) => l.x1 <= gx).length;
  const right = lines.filter((l) => l.x0 >= gx).length;
  return left >= lines.length * 0.15 && right >= lines.length * 0.15 ? gx : null;
}

async function extractPdf(buf: Uint8Array): Promise<Extraction> {
  const { getDocumentProxy, getResolvedPDFJS } = await import("unpdf");
  let doc;
  try {
    doc = await getDocumentProxy(new Uint8Array(buf), { disableFontFace: true });
  } catch (e) {
    const name = (e as Error)?.name ?? "";
    if (/Password/i.test(name)) throw new UploadError("This PDF is password-protected. Remove the password and upload again.", "encrypted");
    throw new UploadError("This PDF couldn't be read. It may be damaged. Try exporting it again or upload a DOCX.", "malformed");
  }
  const pdfjs = await getResolvedPDFJS();
  const OPS = pdfjs.OPS as Record<string, number>;
  const imageOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].filter((x) => x !== undefined));

  const warnings: string[] = [];
  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  if (doc.numPages > MAX_PDF_PAGES) warnings.push(`Only the first ${MAX_PDF_PAGES} pages were read.`);
  const out: string[] = [];
  let columns = 1;
  let images = 0;
  for (let p = 1; p <= pages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items: Item[] = [];
    for (const raw of tc.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
      if (!raw.str || !raw.transform || !raw.str.trim()) continue;
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], w: raw.width ?? 0, h: raw.height || Math.abs(raw.transform[3]) || 10 });
    }
    let lines = itemsToLines(items);
    const gutter = findGutter(items, vp.width);
    if (gutter !== null) {
      columns = Math.max(columns, 2);
      // Read the left column fully, then the right one (how a person would read it).
      const left = itemsToLines(items.filter((i) => i.x + i.w / 2 < gutter));
      const right = itemsToLines(items.filter((i) => i.x + i.w / 2 >= gutter));
      lines = [...left, ...right];
    }
    out.push(...lines.map((l) => l.text));
    try {
      const ops = await page.getOperatorList();
      images += ops.fnArray.filter((f: number) => imageOps.has(f)).length;
    } catch {
      /* operator list is best-effort */
    }
    page.cleanup();
  }
  let links: string[] = [];
  try {
    const { extractLinks } = await import("unpdf");
    links = (await extractLinks(doc)).links ?? [];
  } catch {
    /* ignore */
  }
  await (doc as unknown as { destroy?: () => Promise<void> }).destroy?.();
  const text = out.join("\n");
  const imageOnly = text.replace(/\s/g, "").length < 150;
  if (imageOnly) warnings.push("Almost no text could be extracted. This is probably a scanned or image-based PDF.");
  return {
    format: "pdf",
    text,
    lines: out,
    links: dedupe(links),
    layout: { format: "pdf", pages: doc.numPages, tables: 0, textBoxes: 0, images, columns, headerFooterText: false, imageOnly, unusualFonts: [] },
    warnings,
  };
}

// ---------------- DOCX ----------------

const STANDARD_FONTS = /^(arial|calibri|cambria|helvetica|times new roman|times|georgia|garamond|verdana|tahoma|aptos|segoe ui|book antiqua|liberation (sans|serif)|carlito|caladea|roboto|open sans|lato|source sans pro|noto sans|noto serif|symbol|wingdings|courier new)$/i;

async function extractDocx(buf: Uint8Array): Promise<Extraction> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buf);
  } catch {
    throw new UploadError("This DOCX couldn't be opened. It may be damaged.", "malformed");
  }
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new UploadError("This file isn't a Word document (no document body found).", "malformed");
  // Guard against zip bombs: check declared uncompressed sizes before inflating.
  let total = 0;
  zip.forEach((_, f) => {
    total += (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0;
  });
  if (total > MAX_DOCX_XML_BYTES * 3) throw new UploadError("This DOCX expands to an unusually large size and was rejected.", "too_large");
  const warnings: string[] = [];
  if (zip.file("word/vbaProject.bin")) warnings.push("The document contains macros. They were ignored.");

  const xml = await docFile.async("string");
  if (xml.length > MAX_DOCX_XML_BYTES) throw new UploadError("The document body is too large.", "too_large");

  const count = (re: RegExp) => (xml.match(re) ?? []).length;
  const tables = count(/<w:tbl>/g) + count(/<w:tbl /g);
  const textBoxes = count(/<w:txbxContent[ >]/g);
  const images = count(/<w:drawing[ >]/g) + count(/<w:pict[ >]/g);
  const colsMatch = [...xml.matchAll(/<w:cols [^>]*w:num="(\d+)"/g)].map((m) => Number(m[1]));
  const columns = Math.max(1, ...colsMatch);

  let headerFooterText = false;
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))) {
    const hx = await zip.file(name)!.async("string");
    const t = [...hx.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("").trim();
    if (t.replace(/PAGE|\d|of|Page/gi, "").trim().length > 3) headerFooterText = true;
  }
  const fonts = new Set([...xml.matchAll(/w:ascii="([^"]+)"/g)].map((m) => m[1]));
  const unusualFonts = [...fonts].filter((f) => !STANDARD_FONTS.test(f) && !/^\+|^majorHAnsi|^minorHAnsi/.test(f));

  const relsXml = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const links = [...relsXml.matchAll(/Target="([^"]+)"[^>]*TargetMode="External"/g), ...relsXml.matchAll(/TargetMode="External"[^>]*Target="([^"]+)"/g)]
    .map((m) => decodeXml(m[1]))
    .filter((u) => /^(https?:|mailto:)/i.test(u));

  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  // Text boxes are often skipped by text extraction; pull their text so nothing is lost.
  let text = value;
  if (textBoxes) {
    const boxText = [...xml.matchAll(/<w:txbxContent[ >][\s\S]*?<\/w:txbxContent>/g)]
      .map((m) => [...m[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map((p) => [...p[0].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((t) => decodeXml(t[1])).join("")).join("\n"))
      .join("\n");
    const missing = boxText.split("\n").filter((l) => l.trim() && !text.includes(l.trim()));
    if (missing.length) {
      text += "\n" + missing.join("\n");
      warnings.push("Some text was inside text boxes. It was added at the end; check that it landed in the right section.");
    }
  }
  const lines = text.split(/\n+/).map((l) => l.replace(/\t+/g, "   ").trimEnd()).filter((l) => l.trim());
  return {
    format: "docx",
    text: lines.join("\n"),
    lines,
    links: dedupe(links),
    layout: { format: "docx", pages: null, tables, textBoxes, images, columns, headerFooterText, imageOnly: lines.join("").length < 100, unusualFonts },
    warnings,
  };
}

function decodeXml(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function dedupe(xs: string[]) {
  return [...new Set(xs.map((x) => x.trim()).filter(Boolean))].slice(0, 20);
}
