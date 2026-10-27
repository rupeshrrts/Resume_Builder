import { stripBold } from "../render/rich";
import type { ResumeData } from "../schema/resume";

export const STOPWORDS = new Set(
  `a an the and or but if then else of for to in on at by with from into onto over under about as is are was were be been being
   this that these those it its it's we you your our their they them he she his her i me my mine us
   will would can could should may might must shall do does did done have has had having not no nor so such than too very
   also any all each every both few more most other some own same only just per via etc e.g i.e eg ie
   who whom whose which what when where why how there here able across within without including include includes
   work working worked job role roles team teams candidate candidates company year years experience experiences
   strong good great excellent ability skills skill knowledge understanding using use used new well plus etc.`.split(/\s+/),
);

export function normalizeSpace(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

export function words(s: string): string[] {
  return s.match(/[A-Za-z][A-Za-z0-9'’+#.-]*/g)?.map((w) => w.replace(/[.'’-]+$/, "")) ?? [];
}

export function wordCount(s: string) {
  return words(s).length;
}

/** Light stemmer: enough to match "deploying"/"deployed"/"deployment" to "deploy". */
export function stem(w: string): string {
  let s = w.toLowerCase();
  for (const suf of ["ments", "ment", "ings", "ing", "ations", "ation", "ers", "er", "ies", "ied", "es", "ed", "s"]) {
    if (s.length - suf.length >= 4 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      if (suf === "ies" || suf === "ied") s += "y";
      break;
    }
  }
  return s;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])|\n+/)
    .map((s) => normalizeSpace(s))
    .filter(Boolean);
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A location inside the resume, used to link findings back to the editor. */
export interface TextLocation {
  section: "summary" | "experience" | "projects" | "education" | "skills" | "certifications" | "additional" | "contact";
  entryId?: string;
  bulletId?: string;
  label: string;
}

export interface LocatedText {
  text: string;
  loc: TextLocation;
  /** True for text that demonstrates use (bullets, project technologies), false for bare lists/summary. */
  evidence: boolean;
}

/** Flattens the resume into located text fragments for searching. */
export function collectText(r: ResumeData): LocatedText[] {
  const out: LocatedText[] = [];
  if (r.contact.headline) out.push({ text: r.contact.headline, loc: { section: "contact", label: "Headline" }, evidence: false });
  if (r.summary.text) out.push({ text: stripBold(r.summary.text), loc: { section: "summary", label: "Summary" }, evidence: false });
  for (const e of r.experience) {
    const label = [e.title, e.company].filter(Boolean).join(" at ") || "Experience entry";
    if (e.title) out.push({ text: e.title, loc: { section: "experience", entryId: e.id, label }, evidence: true });
    for (const b of e.bullets)
      if (b.text) out.push({ text: stripBold(b.text), loc: { section: "experience", entryId: e.id, bulletId: b.id, label }, evidence: true });
  }
  for (const p of r.projects) {
    const label = p.name || "Project";
    if (p.technologies.length)
      out.push({ text: p.technologies.join(", "), loc: { section: "projects", entryId: p.id, label: `${label} (technologies)` }, evidence: true });
    for (const b of p.bullets)
      if (b.text) out.push({ text: stripBold(b.text), loc: { section: "projects", entryId: p.id, bulletId: b.id, label }, evidence: true });
  }
  for (const ed of r.education) {
    const label = [ed.degree, ed.institution].filter(Boolean).join(", ") || "Education";
    out.push({ text: [ed.degree, ed.field].filter(Boolean).join(" "), loc: { section: "education", entryId: ed.id, label }, evidence: false });
    for (const b of ed.bullets)
      if (b.text) out.push({ text: stripBold(b.text), loc: { section: "education", entryId: ed.id, bulletId: b.id, label }, evidence: true });
  }
  for (const g of r.skills) {
    if (g.items.length)
      out.push({ text: g.items.join(", "), loc: { section: "skills", entryId: g.id, label: g.category || "Skills" }, evidence: false });
  }
  for (const c of r.certifications) {
    if (c.name) out.push({ text: c.name, loc: { section: "certifications", entryId: c.id, label: c.name }, evidence: true });
  }
  for (const a of r.additional) {
    for (const b of a.bullets)
      if (b.text) out.push({ text: stripBold(b.text), loc: { section: "additional", entryId: a.id, bulletId: b.id, label: a.title || "Additional" }, evidence: true });
  }
  return out;
}

/** All bullets in the resume with their location. */
export function allBullets(r: ResumeData) {
  const out: { id: string; text: string; origin: string; loc: TextLocation; current?: boolean }[] = [];
  for (const e of r.experience)
    for (const b of e.bullets)
      out.push({
        id: b.id,
        text: stripBold(b.text),
        origin: b.origin,
        current: e.current,
        loc: { section: "experience", entryId: e.id, bulletId: b.id, label: [e.title, e.company].filter(Boolean).join(" at ") || "Experience" },
      });
  for (const p of r.projects)
    for (const b of p.bullets)
      out.push({ id: b.id, text: b.text, origin: b.origin, loc: { section: "projects", entryId: p.id, bulletId: b.id, label: p.name || "Project" } });
  for (const ed of r.education)
    for (const b of ed.bullets)
      out.push({ id: b.id, text: b.text, origin: b.origin, loc: { section: "education", entryId: ed.id, bulletId: b.id, label: ed.institution || "Education" } });
  for (const a of r.additional)
    for (const b of a.bullets)
      out.push({ id: b.id, text: b.text, origin: b.origin, loc: { section: "additional", entryId: a.id, bulletId: b.id, label: a.title || "Additional" } });
  return out;
}
