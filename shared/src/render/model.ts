import { SECTION_LABELS, normalizeSectionOrder, type ResumeData, type ResumeSettings, type SectionKey } from "../schema/resume";
import { formatDate, formatRange } from "../analysis/dates";
import { stripBold } from "./rich";
import { TEMPLATES, type TemplateDef } from "./templates";

/**
 * Format-neutral document model. PDF, DOCX, plain text and the on-screen preview are all
 * rendered from this, so they always contain the same content in the same order.
 */

export interface DocLink {
  text: string;
  href: string;
}

export interface DocEntry {
  type: "entry";
  /** e.g. "Senior Engineer" */
  title: string;
  /** Printed after the title as " — Acme Pvt Ltd" in regular weight (stacked templates). */
  titleSuffix: string;
  /** e.g. "Acme Pvt Ltd, Pune" */
  subtitle: string;
  /** Right-aligned dates. */
  dates: string;
  /** Extra line, e.g. technologies or grade. */
  meta: string;
  link: DocLink | null;
  /** Makes the title itself a link (stacked templates put project URLs here instead of in `link`). */
  titleHref: string | null;
  bullets: string[];
  /** Start this entry on a new page. */
  pageBreak?: boolean;
}

export type DocBlock =
  | DocEntry
  | { type: "paragraph"; text: string }
  | { type: "skills"; rows: { label: string; items: string }[] }
  | { type: "list"; items: string[] };

export interface DocSection {
  key: SectionKey | string;
  title: string;
  blocks: DocBlock[];
  /** Start this section on a new page. */
  pageBreak?: boolean;
}

/** Whether the user placed any page break; "Fit on one page" doesn't apply when they did. */
export function hasPageBreaks(doc: DocModel): boolean {
  return doc.sections.some((s) => s.pageBreak || s.blocks.some((b) => b.type === "entry" && b.pageBreak));
}

export interface DocModel {
  name: string;
  headline: string;
  contact: (DocLink | { text: string; href: null })[];
  sections: DocSection[];
  template: TemplateDef;
  settings: ResumeSettings;
}

/**
 * Joins line breaks into one flowing line. Text pasted from a PDF or Word file keeps a break
 * at the end of every visual line, which would otherwise print as a ragged column of short
 * lines. A word split at a line end ("client-" / "reported") is rejoined without a space.
 */
export function oneLine(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .reduce((acc, l) => (/\w-$/.test(acc) ? acc + l : acc ? `${acc} ${l}` : l), "")
    .replace(/[ \t]{2,}/g, " ");
}

/** "Title — Suffix" for formats without separate weights (plain text, Markdown). */
export function fullTitle(b: DocEntry): string {
  return b.titleSuffix ? `${b.title} — ${b.titleSuffix}` : b.title;
}

export function displayUrl(u: string) {
  return u.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

export function hrefFor(u: string) {
  const t = u.trim();
  if (/^mailto:/i.test(t) || /^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function heading(title: string, s: ResumeSettings) {
  return s.headingCase === "upper" ? title.toUpperCase() : title;
}

const join = (parts: (string | undefined)[], sep = ", ") => parts.map((p) => p?.trim()).filter(Boolean).join(sep);

export function buildDocument(r: ResumeData, s: ResumeSettings): DocModel {
  const t = TEMPLATES[s.template];
  const stacked = t.entryLayout === "stacked";
  const contact: DocModel["contact"] = [];
  const email = r.contact.email ? { text: r.contact.email, href: `mailto:${r.contact.email}` } : null;
  const phone = r.contact.phone ? { text: r.contact.phone, href: null } : null;
  const location = r.contact.location ? { text: r.contact.location, href: null } : null;
  for (const c of t.contactStyle === "pipe" ? [location, phone, email] : [email, phone, location]) if (c) contact.push(c);
  for (const l of r.contact.links)
    if (l.url.trim()) contact.push({ text: t.contactStyle === "pipe" && l.label.trim() ? l.label.trim() : displayUrl(l.url), href: hrefFor(l.url) });

  const hidden = new Set(s.hiddenSections);
  const sections: DocSection[] = [];
  const keep = (b: { text: string }) => b.text.trim().length > 0;

  for (const key of normalizeSectionOrder(s.sectionOrder)) {
    if (hidden.has(key)) continue;
    const title = heading(SECTION_LABELS[key], s);
    switch (key) {
      case "summary":
        if (r.summary.text.trim()) sections.push({ key, title: heading(s.summaryTitle, s), blocks: [{ type: "paragraph", text: oneLine(r.summary.text) }] });
        break;
      case "experience": {
        const blocks: DocBlock[] = r.experience
          .filter((e) => e.title || e.company)
          .map((e): DocEntry => {
            const type =e.employmentType && e.employmentType !== "Full-time" ? e.employmentType : "";
            return {
              type: "entry",
              title: e.title || e.company,
              titleSuffix: stacked && e.title ? e.company.trim() : "",
              subtitle: stacked ? "" : e.title ? join([e.company, e.location, type]) : join([e.location]),
              dates: formatRange(e.startDate, e.endDate, e.current, s.dateFormat),
              meta: stacked ? join([e.location, type], " · ") : "",
              link: null,
              titleHref: null,
              bullets: e.bullets.filter(keep).map((b) => oneLine(b.text)),
              pageBreak: e.pageBreakBefore,
            };
          });
        if (blocks.length) sections.push({ key, title, blocks });
        break;
      }
      case "projects": {
        const blocks: DocBlock[] = r.projects
          .filter((p) => p.name)
          .map((p): DocEntry => {
            const bullets = p.bullets.filter(keep).map((b) => oneLine(b.text));
            const tech = p.technologies.join(", ");
            return stacked
              ? {
                  type: "entry",
                  title: p.name,
                  titleSuffix: p.role.trim(),
                  subtitle: "",
                  dates: formatRange(p.startDate, p.endDate, false, s.dateFormat),
                  meta: "",
                  link: null,
                  titleHref: p.url ? hrefFor(p.url) : null,
                  bullets: tech ? [...bullets, `Technologies: ${tech}`] : bullets,
                  pageBreak: p.pageBreakBefore,
                }
              : {
                  type: "entry",
                  title: p.name,
                  titleSuffix: "",
                  subtitle: p.role,
                  dates: formatRange(p.startDate, p.endDate, false, s.dateFormat),
                  meta: tech ? `Technologies: ${tech}` : "",
                  link: p.url ? { text: displayUrl(p.url), href: hrefFor(p.url) } : null,
                  titleHref: null,
                  bullets,
                  pageBreak: p.pageBreakBefore,
                };
          });
        if (blocks.length) sections.push({ key, title, blocks });
        break;
      }
      case "skills": {
        const rows = r.skills.filter((g) => g.items.some((i) => i.trim())).map((g) => ({ label: g.category.trim(), items: g.items.filter((i) => i.trim()).join(", ") }));
        if (rows.length) sections.push({ key, title: heading(s.skillsTitle, s), blocks: [{ type: "skills", rows }] });
        break;
      }
      case "education": {
        const blocks: DocBlock[] = r.education
          .filter((e) => e.degree || e.institution)
          .map((e): DocEntry => {
            const degree = join([e.degree, e.field], e.degree && e.field ? " in " : "");
            return {
              type: "entry",
              title: stacked ? e.institution || degree : degree || e.institution,
              titleSuffix: stacked ? e.location.trim() : "",
              subtitle: stacked ? join([e.institution ? degree : "", e.grade], " | ") : degree ? join([e.institution, e.location]) : join([e.location]),
              dates: formatRange(e.startDate, e.endDate, false, s.dateFormat),
              meta: stacked ? "" : e.grade,
              link: null,
              titleHref: null,
              bullets: e.bullets.filter(keep).map((b) => oneLine(b.text)),
              pageBreak: e.pageBreakBefore,
            };
          });
        if (blocks.length) sections.push({ key, title, blocks });
        break;
      }
      case "certifications": {
        const items = r.certifications
          .filter((c) => c.name)
          .map((c) => join([c.name, c.issuer, formatDate(c.date, s.dateFormat)], " – "));
        if (items.length) sections.push({ key, title, blocks: [{ type: "list", items }] });
        break;
      }
      case "additional":
        for (const a of r.additional) {
          const items = a.bullets.filter(keep).map((b) => oneLine(b.text));
          if (a.title.trim() && items.length) sections.push({ key: `additional:${a.id}`, title: heading(a.title.trim(), s), blocks: [{ type: "list", items }] });
        }
        break;
    }
  }

  // Section page breaks; for custom sections ("additional:<id>") the break goes on the first one.
  const breaks = new Set<string>(s.pageBreaks);
  for (const sec of sections) {
    const base = String(sec.key).split(":")[0];
    if (breaks.delete(base)) sec.pageBreak = true;
  }

  return { name: r.contact.fullName.trim(), headline: r.contact.headline.trim(), contact, sections, template: t, settings: s };
}

/** Text fragments every export must contain, in order. Used by export validation. */
export function expectedAtoms(doc: DocModel): string[] {
  const out: string[] = [];
  if (doc.name) out.push(doc.name);
  if (doc.headline) out.push(doc.headline);
  for (const c of doc.contact) out.push(c.text);
  for (const s of doc.sections) {
    out.push(s.title);
    for (const b of s.blocks) {
      // Bold markers (**…**) are formatting, not text the reader or an ATS sees.
      if (b.type === "paragraph") out.push(stripBold(b.text));
      else if (b.type === "list") out.push(...b.items.map(stripBold));
      else if (b.type === "skills") for (const r of b.rows) out.push(...(r.label ? [r.label, r.items] : [r.items]));
      else {
        out.push(b.title);
        if (b.titleSuffix) out.push(b.titleSuffix);
        // Stacked templates print the subtitle on its own line, after the right-aligned dates.
        const stacked = doc.template.entryLayout === "stacked";
        if (b.subtitle && !stacked) out.push(b.subtitle);
        if (b.dates) out.push(b.dates);
        if (b.subtitle && stacked) out.push(b.subtitle);
        if (b.link) out.push(b.link.text);
        if (b.meta) out.push(b.meta);
        out.push(...b.bullets.map(stripBold));
      }
    }
  }
  return out;
}
