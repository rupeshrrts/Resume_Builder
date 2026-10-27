import JSZip from "jszip";
import { expectedAtoms, type DocModel } from "@resume/shared/render/model";
import { makeFontSafe, planDocxFonts } from "./fonts";
import { bodyFont, headingFont } from "./pdf";
import type { ExportCheck, ExportValidation } from "@resume/shared/types/api";

export type { ExportValidation };

/**
 * Re-opens a generated file and checks it: every piece of content is present and in order,
 * links survived, no page is blank, nothing runs past the right margin, and any characters
 * the font couldn't represent are reported.
 */


const squash = (s: string) => s.toLowerCase().replace(/[\s•]+/g, "");

function contentChecks(doc: DocModel, extracted: string, forPdf: boolean) {
  const hay = squash(extracted);
  const atoms = expectedAtoms(doc)
    .map((a) => (forPdf ? makeFontSafe(a, [...new Set([bodyFont(doc), headingFont(doc)])]).text : a))
    .filter((a) => a.trim());
  const missing: string[] = [];
  let cursor = 0;
  let outOfOrder = 0;
  for (const a of atoms) {
    const k = squash(a);
    const at = hay.indexOf(k, cursor);
    if (at >= 0) {
      cursor = at + k.length;
      continue;
    }
    const anywhere = hay.indexOf(k);
    if (anywhere >= 0) outOfOrder++;
    else missing.push(a);
  }
  const coverage = atoms.length ? Math.round(((atoms.length - missing.length) / atoms.length) * 1000) / 10 : 100;
  return { atoms, missing, outOfOrder, coverage };
}

export async function validatePdf(buf: Uint8Array, doc: DocModel, replaced: string[]): Promise<ExportValidation> {
  const { getDocumentProxy, extractLinks } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const pageTexts: string[] = [];
  let overflow = 0;
  const marginPt = doc.settings.margin;
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const width = page.getViewport({ scale: 1 }).width;
    const tc = await page.getTextContent();
    const parts: string[] = [];
    for (const it of tc.items as { str?: string; transform?: number[]; width?: number; hasEOL?: boolean }[]) {
      if (!it.str) continue;
      parts.push(it.str + (it.hasEOL ? "\n" : " "));
      if (it.transform && it.width && it.transform[4] + it.width > width - marginPt + 2) overflow++;
    }
    pageTexts.push(parts.join(""));
  }
  const links = ((await extractLinks(pdf)).links ?? []) as string[];
  await (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.();
  const text = pageTexts.join("\n");
  const { missing, outOfOrder, coverage } = contentChecks(doc, text, true);
  const blank = pageTexts.map((t, i) => ({ i, n: t.replace(/\s/g, "").length })).filter((x) => x.n < 20);
  const lastPageChars = pageTexts[pageTexts.length - 1]?.replace(/\s/g, "").length ?? 0;
  const expectedLinks = doc.contact.map((c) => c.href).filter(Boolean) as string[];
  const missingLinks = expectedLinks.filter((h) => !links.some((l) => l.replace(/\/$/, "") === h.replace(/\/$/, "")));

  const checks: ExportCheck[] = [
    { name: "All content present", ok: missing.length === 0, detail: missing.length ? `${missing.length} item(s) not found in the extracted text.` : `${coverage}% of content found when the file was re-read.` },
    { name: "Reading order", ok: outOfOrder === 0, detail: outOfOrder ? `${outOfOrder} item(s) extracted out of order.` : "Text extracts in the same order as the resume." },
    { name: "No blank pages", ok: blank.length === 0, detail: blank.length ? `Page(s) ${blank.map((b) => b.i + 1).join(", ")} contain no text.` : `${pdf.numPages} page(s), all with content.` },
    {
      name: "Last page",
      ok: pdf.numPages === 1 || lastPageChars > 250,
      detail: pdf.numPages > 1 && lastPageChars <= 250 ? "The last page has only a few lines. Tighten spacing or trim content to avoid a near-empty page." : "Last page is reasonably filled.",
    },
    { name: "Within margins", ok: overflow === 0, detail: overflow ? `${overflow} text run(s) extend past the right margin (often a long URL).` : "No text runs past the margins." },
    { name: "Links", ok: missingLinks.length === 0, detail: missingLinks.length ? `Missing clickable links: ${missingLinks.join(", ")}` : `${expectedLinks.length} contact link(s) are clickable.` },
    {
      name: "Characters",
      ok: replaced.length === 0,
      detail: replaced.length ? `The chosen font can't show ${replaced.map((c) => `“${c}”`).join(" ")}; replaced with close equivalents. Try another font, or use the DOCX, which keeps the originals.` : `All characters are supported by ${bodyFont(doc)}${headingFont(doc) !== bodyFont(doc) ? ` and ${headingFont(doc)}` : ""}.`,
    },
  ];
  return { format: "pdf", ok: checks.every((c) => c.ok || c.name === "Last page"), pages: pdf.numPages, coverage, missing, checks, extractedText: text };
}

export async function validateDocx(buf: Uint8Array, doc: DocModel): Promise<ExportValidation> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  const rels = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
  const { missing, outOfOrder, coverage } = contentChecks(doc, value, false);
  const expectedLinks = doc.contact.map((c) => c.href).filter(Boolean) as string[];
  const missingLinks = expectedLinks.filter((h) => !rels.includes(`Target="${h.replace(/&/g, "&amp;")}"`));
  const tables = (xml.match(/<w:tbl[ >]/g) ?? []).length;
  const boxes = (xml.match(/<w:txbxContent/g) ?? []).length;
  const headings = (xml.match(/<w:pStyle w:val="Heading1"\/>/g) ?? []).length;
  const checks: ExportCheck[] = [
    { name: "All content present", ok: missing.length === 0, detail: missing.length ? `${missing.length} item(s) not found when the file was re-read.` : `${coverage}% of content found when the file was re-read.` },
    { name: "Reading order", ok: outOfOrder === 0, detail: outOfOrder ? `${outOfOrder} item(s) out of order.` : "Text extracts in the same order as the resume." },
    { name: "No tables or text boxes", ok: tables === 0 && boxes === 0, detail: tables || boxes ? `${tables} table(s), ${boxes} text box(es).` : "Plain paragraphs only." },
    { name: "Real headings", ok: headings === doc.sections.length, detail: `${headings} of ${doc.sections.length} section titles use the Heading 1 style.` },
    { name: "Links", ok: missingLinks.length === 0, detail: missingLinks.length ? `Missing links: ${missingLinks.join(", ")}` : `${expectedLinks.length} contact link(s) are clickable.` },
    { name: "Fonts", ok: true, detail: fontDetail(doc) },
  ];
  return { format: "docx", ok: checks.every((c) => c.ok), pages: null, coverage, missing, checks, extractedText: value };
}

function fontDetail(doc: DocModel): string {
  const plan = planDocxFonts(bodyFont(doc), headingFont(doc));
  const parts: string[] = [];
  if (plan.embedded.length) parts.push(`Embedded: ${plan.embedded.map((e) => e.name).join(", ")}, so it looks the same on any computer.`);
  if (plan.substituted.length) parts.push(plan.substituted.map((s) => `${s.font} is too large to embed; Word uses ${s.with}.`).join(" "));
  if (!parts.length) parts.push(`Uses ${plan.body}, installed on virtually every computer.`);
  return parts.join(" ");
}