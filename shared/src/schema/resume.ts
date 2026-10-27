import { z } from "zod";
import { FONT_IDS } from "../render/fonts";

/**
 * Structured resume data. This is the single source of truth for a resume's content;
 * layouts (templates, fonts, margins) live separately in ResumeSettings so the same
 * facts can be rendered to PDF, DOCX and plain text without duplication.
 */

const str = (max: number) => z.string().max(max).default("");

/** Where a piece of text came from. Used to separate verified user facts from AI suggestions. */
export const Origin = z.enum(["user", "imported", "ai"]);
export type Origin = z.infer<typeof Origin>;

/** "YYYY-MM", "YYYY", or "" (unknown). Display formatting is applied at render time. */
export const PartialDate = z
  .string()
  .max(7)
  .regex(/^$|^\d{4}(-(0[1-9]|1[0-2]))?$/, "Use YYYY or YYYY-MM")
  .default("");

export const Bullet = z.object({
  id: z.string().min(1).max(40),
  text: str(600),
  origin: Origin.default("user"),
  /** The user's own wording before an accepted AI rewrite, kept so it can be compared and restored. */
  sourceText: z.string().max(600).optional(),
});
export type Bullet = z.infer<typeof Bullet>;

export const Link = z.object({
  id: z.string().min(1).max(40),
  label: str(60),
  url: str(300),
});

export const Contact = z.object({
  fullName: str(120),
  headline: str(160),
  email: str(200),
  phone: str(40),
  location: str(120),
  links: z.array(Link).max(6).default([]),
});
type ContactData = z.infer<typeof Contact>;

/** Profile links that get their own field in the contact forms, in the order they print. */
export const PROFILE_LINKS = [
  { label: "LinkedIn", host: /linkedin\.com/i, placeholder: "linkedin.com/in/your-name" },
  { label: "GitHub", host: /github\.com/i, placeholder: "github.com/your-username" },
  // Portfolios live on any domain, so they're matched by label only.
  { label: "Portfolio", host: null, placeholder: "your-name.dev" },
] as const;
export type ProfileLabel = (typeof PROFILE_LINKS)[number]["label"];

/** Index of a profile link, matched by label or by its URL host (imports may label it differently). */
export function profileLinkIndex(links: ContactData["links"], label: ProfileLabel): number {
  const host = PROFILE_LINKS.find((x) => x.label === label)!.host;
  const byLabel = links.findIndex((l) => l.label.trim().toLowerCase() === label.toLowerCase());
  return byLabel >= 0 || !host ? byLabel : links.findIndex((l) => host.test(l.url));
}

/** Sets a profile link's URL, adding it after the profile links that print before it. An empty URL is left out of exports. */
export function setProfileLink(c: ContactData, label: ProfileLabel, url: string): void {
  const i = profileLinkIndex(c.links, label);
  if (i >= 0) {
    c.links[i].url = url;
    c.links[i].label = label;
    return;
  }
  if (!url.trim() || c.links.length >= 6) return;
  const before = PROFILE_LINKS.slice(0, PROFILE_LINKS.findIndex((x) => x.label === label)).map((x) => profileLinkIndex(c.links, x.label));
  c.links.splice(Math.max(-1, ...before) + 1, 0, { id: newId("l"), label, url });
}

export const Experience = z.object({
  id: z.string().min(1).max(40),
  title: str(120),
  company: str(120),
  location: str(120),
  employmentType: str(40),
  startDate: PartialDate,
  endDate: PartialDate,
  current: z.boolean().default(false),
  bullets: z.array(Bullet).max(20).default([]),
  /** Start this entry on a new page (the user decides where a page ends). */
  pageBreakBefore: z.boolean().optional(),
});
export type Experience = z.infer<typeof Experience>;

export const Education = z.object({
  id: z.string().min(1).max(40),
  degree: str(160),
  field: str(160),
  institution: str(160),
  location: str(120),
  startDate: PartialDate,
  endDate: PartialDate,
  grade: str(60),
  bullets: z.array(Bullet).max(10).default([]),
  pageBreakBefore: z.boolean().optional(),
});
export type Education = z.infer<typeof Education>;

export const Project = z.object({
  id: z.string().min(1).max(40),
  name: str(160),
  role: str(120),
  url: str(300),
  technologies: z.array(z.string().max(60)).max(30).default([]),
  startDate: PartialDate,
  endDate: PartialDate,
  bullets: z.array(Bullet).max(12).default([]),
  pageBreakBefore: z.boolean().optional(),
});
export type Project = z.infer<typeof Project>;

export const SkillGroup = z.object({
  id: z.string().min(1).max(40),
  category: str(80),
  items: z.array(z.string().max(80)).max(60).default([]),
});
export type SkillGroup = z.infer<typeof SkillGroup>;

export const Certification = z.object({
  id: z.string().min(1).max(40),
  name: str(200),
  issuer: str(120),
  date: PartialDate,
  url: str(300),
});
export type Certification = z.infer<typeof Certification>;

/** Free-form sections such as Awards, Publications, Languages, Volunteering. */
export const AdditionalSection = z.object({
  id: z.string().min(1).max(40),
  title: str(60),
  bullets: z.array(Bullet).max(20).default([]),
});
export type AdditionalSection = z.infer<typeof AdditionalSection>;

export const ResumeData = z.object({
  contact: Contact.default(() => Contact.parse({})),
  summary: z
    .object({ text: str(1500), origin: Origin.default("user"), sourceText: z.string().max(1500).optional() })
    .default(() => ({ text: "", origin: "user" as const })),
  experience: z.array(Experience).max(30).default([]),
  education: z.array(Education).max(15).default([]),
  projects: z.array(Project).max(25).default([]),
  skills: z.array(SkillGroup).max(15).default([]),
  certifications: z.array(Certification).max(30).default([]),
  additional: z.array(AdditionalSection).max(8).default([]),
});
export type ResumeData = z.infer<typeof ResumeData>;

export const SECTION_KEYS = ["summary", "experience", "projects", "skills", "education", "certifications", "additional"] as const;
export const SectionKey = z.enum(SECTION_KEYS);
export type SectionKey = z.infer<typeof SectionKey>;

export const SECTION_LABELS: Record<SectionKey, string> = {
  summary: "Summary",
  experience: "Experience",
  projects: "Projects",
  skills: "Skills",
  education: "Education",
  certifications: "Certifications",
  additional: "Additional",
};

export const TemplateId = z.enum(["classic", "modern", "compact", "technical", "executive", "elegant", "bold", "minimal", "professional"]);
export type TemplateId = z.infer<typeof TemplateId>;

export const SUMMARY_TITLES = ["Summary", "Professional Summary"] as const;
export const SKILLS_TITLES = ["Skills", "Technical Skills"] as const;

export const Market = z.enum(["IN", "US", "EU", "OTHER"]);
export type Market = z.infer<typeof Market>;

export const ResumeSettings = z.object({
  template: TemplateId.default("classic"),
  fontFamily: z.enum(FONT_IDS).default("Helvetica"),
  /** Font for the name and section headings; null = same as body. */
  headingFont: z.enum(FONT_IDS).nullable().default(null),
  fontSize: z.number().min(9).max(12).default(10.5),
  /** Page margin in points (72pt = 1 inch). */
  margin: z.number().min(28).max(72).default(48),
  lineHeight: z.number().min(1.1).max(1.6).default(1.3),
  sectionSpacing: z.number().min(4).max(20).default(10),
  /** Hex accent colour for headings, or null for black-and-white. */
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
  headingCase: z.enum(["upper", "title"]).default("upper"),
  /** Printed heading for the summary section. */
  summaryTitle: z.enum(SUMMARY_TITLES).default("Summary"),
  /** Printed heading for the skills section. */
  skillsTitle: z.enum(SKILLS_TITLES).default("Skills"),
  sectionOrder: z.array(SectionKey).default([...SECTION_KEYS]),
  hiddenSections: z.array(SectionKey).default([]),
  /** Sections that start on a new page. */
  pageBreaks: z.array(SectionKey).default([]),
  pageSize: z.enum(["A4", "LETTER"]).default("A4"),
  /** Content longer than a page: continue on the next page, or tighten the layout to fit one. */
  pageFit: z.enum(["continue", "fit"]).default("continue"),
  market: Market.default("IN"),
  dateFormat: z.enum(["MMM YYYY", "MM/YYYY", "YYYY-MM"]).default("MMM YYYY"),
  writingStyle: z.enum(["conservative", "balanced", "achievement"]).default("balanced"),
});
export type ResumeSettings = z.infer<typeof ResumeSettings>;

export const ResumeKind = z.enum(["master", "tailored"]);
export type ResumeKind = z.infer<typeof ResumeKind>;

export function emptyResume(): ResumeData {
  return ResumeData.parse({});
}

export function defaultSettings(overrides: Partial<ResumeSettings> = {}): ResumeSettings {
  return ResumeSettings.parse(overrides);
}

let counter = 0;
/** Short collision-resistant id usable on client and server. */
export function newId(prefix = "id"): string {
  counter = (counter + 1) % 1_000_000;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${rand}`;
}

/** Ensures every section in the canonical list appears exactly once in the order array. */
export function normalizeSectionOrder(order: SectionKey[]): SectionKey[] {
  const seen = new Set<SectionKey>();
  const out: SectionKey[] = [];
  for (const k of order) if (!seen.has(k)) { seen.add(k); out.push(k); }
  for (const k of SECTION_KEYS) if (!seen.has(k)) out.push(k);
  return out;
}
