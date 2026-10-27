import type { ResumeSettings, SectionKey, TemplateId } from "../schema/resume";
import type { FontId } from "./fonts";

/**
 * Templates differ in typography, header treatment and heading style. All are single-column,
 * text-based, with standard headings and no tables, text boxes, icons, photos or rating bars,
 * so they extract cleanly as PDF, DOCX and plain text.
 */
export interface TemplateDef {
  id: TemplateId;
  label: string;
  description: string;
  /** "band" = name and contact on a full-width colour band (still real text). */
  header: "left" | "center" | "band";
  /** rule: line under heading · plain: no line · bar: accent bar at left · centered: centred with line */
  heading: "rule" | "plain" | "bar" | "centered";
  headingColor: "accent" | "ink" | "muted";
  nameCase: "normal" | "upper";
  /** Extra letter spacing on the name and headings, in points. */
  tracking: number;
  datesItalic: boolean;
  /** Show company/institution lines in a muted colour. */
  mutedSubtitles: boolean;
  /** Apply the accent colour (Classic stays black and white). */
  useAccent: boolean;
  /** Multiplier on vertical spacing. */
  density: number;
  nameSize: number;
  defaultFont: FontId;
  defaultHeadingFont: FontId | null;
  defaultAccent: string | null;
  /** Page margin in points this template is designed for; unset keeps the user's margin. */
  defaultMargin?: number;
  /** Shown as a small badge in the template picker. */
  badge?: string;
  /**
   * inline: "Title, Company, City" on one line.
   * stacked: "Title — Company" in bold, then location (italic) or degree on the line below,
   * project technologies as a final "Tech:" bullet and project links on the project name.
   */
  entryLayout: "inline" | "stacked";
  /** dot: "a · b". pipe: "a | b", with links shown by their label (LinkedIn, GitHub) in link blue. */
  contactStyle: "dot" | "pipe";
  /** Name in the accent colour, or always black. */
  nameColor: "accent" | "ink";
  headlineBold: boolean;
  /** Points added to every text size except the name, for templates set larger than the chosen font size. */
  textBoost: number;
  /** Points taken off the space above each section heading. */
  headingGapTrim: number;
  /** Space above each bullet point, in points (scaled by density). */
  bulletGap: number;
  /** Kept for callers that only need alignment. */
  nameAlign: "left" | "center";
}

type Optional = "nameAlign" | "entryLayout" | "contactStyle" | "nameColor" | "headlineBold" | "textBoost" | "headingGapTrim" | "bulletGap";
const T = (d: Omit<TemplateDef, Optional> & Partial<Pick<TemplateDef, Optional>>): TemplateDef => ({
  entryLayout: "inline",
  contactStyle: "dot",
  nameColor: "accent",
  headlineBold: false,
  textBoost: 0,
  headingGapTrim: 0,
  bulletGap: 1.8,
  ...d,
  nameAlign: d.header === "center" ? "center" : "left",
});

/**
 * Point sizes shared by the PDF, DOCX and preview renderers so all three match. The name follows
 * the chosen font size only; `textBoost` enlarges everything else.
 */
export function typeScale(t: TemplateDef, fontSize: number) {
  const body = fontSize + t.textBoost;
  // Stacked entries lead with a slightly larger "Role — Company" line over quieter dates.
  const stacked = t.entryLayout === "stacked";
  return {
    entryTitle: stacked ? body + 0.75 : body,
    // Project and college names (often long) sit a point below job titles.
    projectTitle: stacked ? body - 0.25 : body,
    dates: stacked ? body - 0.5 : body,
    name: t.nameSize * (fontSize / 10.5),
    body,
    // Bold headlines sit at 13.7pt with the default 10.5pt font size (body 11.25pt).
    headline: t.headlineBold ? body + 2.45 : body + 1.5,
    heading: t.headingColor === "muted" ? body + 0.5 : body + 1.5,
    /** Contact line, location/meta lines and inline links. */
    small: body - 0.5,
  };
}

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  classic: T({
    id: "classic",
    label: "Classic",
    description: "Centred name, ruled headings, Times. The most conservative choice; suits any industry.",
    header: "center",
    heading: "rule",
    headingColor: "ink",
    nameCase: "normal",
    tracking: 0.3,
    datesItalic: false,
    mutedSubtitles: false,
    useAccent: false,
    density: 1,
    nameSize: 20,
    defaultFont: "Times-Roman",
    defaultHeadingFont: null,
    defaultAccent: null,
    badge: "Most ATS-safe",
  }),
  modern: T({
    id: "modern",
    label: "Modern",
    description: "Left-aligned Inter with accent-coloured headings. Clean and current; suits tech, product and design.",
    header: "left",
    heading: "plain",
    headingColor: "accent",
    nameCase: "normal",
    tracking: 0.4,
    datesItalic: false,
    mutedSubtitles: true,
    useAccent: true,
    density: 1,
    nameSize: 24,
    defaultFont: "Inter",
    defaultHeadingFont: null,
    defaultAccent: "#1f3b63",
    badge: "Popular",
  }),
  executive: T({
    id: "executive",
    label: "Executive",
    description: "Spaced capitals, centred headings and Source Serif. Understated authority for senior and leadership roles.",
    header: "center",
    heading: "centered",
    headingColor: "accent",
    nameCase: "upper",
    tracking: 1.6,
    datesItalic: false,
    mutedSubtitles: true,
    useAccent: true,
    density: 1.05,
    nameSize: 21,
    defaultFont: "Source Serif 4",
    defaultHeadingFont: null,
    defaultAccent: "#1f3b63",
    badge: "Premium",
  }),
  elegant: T({
    id: "elegant",
    label: "Elegant",
    description: "EB Garamond with refined spacing and italic dates. For academia, law, consulting and the humanities.",
    header: "center",
    heading: "centered",
    headingColor: "accent",
    nameCase: "normal",
    tracking: 1.2,
    datesItalic: true,
    mutedSubtitles: false,
    useAccent: true,
    density: 1.05,
    nameSize: 27,
    defaultFont: "EB Garamond",
    defaultHeadingFont: null,
    defaultAccent: "#6b1e2e",
    badge: "Premium",
  }),
  bold: T({
    id: "bold",
    label: "Bold",
    description: "A colour band behind your name and accent bars on headings. Confident and memorable, still single-column text.",
    header: "band",
    heading: "bar",
    headingColor: "ink",
    nameCase: "normal",
    tracking: 0.3,
    datesItalic: false,
    mutedSubtitles: true,
    useAccent: true,
    density: 1,
    nameSize: 25,
    defaultFont: "Inter",
    defaultHeadingFont: null,
    defaultAccent: "#312e81",
    badge: "Premium",
  }),
  minimal: T({
    id: "minimal",
    label: "Minimal",
    description: "Generous whitespace, quiet grey headings and Source Sans. Lets the content speak; suits design and product.",
    header: "left",
    heading: "plain",
    headingColor: "muted",
    nameCase: "normal",
    tracking: 1.4,
    datesItalic: false,
    mutedSubtitles: true,
    useAccent: true,
    density: 1.15,
    nameSize: 23,
    defaultFont: "Source Sans 3",
    defaultHeadingFont: null,
    defaultAccent: null,
    badge: "Premium",
  }),
  technical: T({
    id: "technical",
    label: "Technical",
    description: "IBM Plex Sans with skills right under the summary and prominent projects. Suits engineering and data roles.",
    header: "left",
    heading: "rule",
    headingColor: "accent",
    nameCase: "normal",
    tracking: 0.4,
    datesItalic: false,
    mutedSubtitles: true,
    useAccent: true,
    density: 0.9,
    nameSize: 21,
    defaultFont: "IBM Plex Sans",
    defaultHeadingFont: null,
    defaultAccent: "#0f5257",
  }),
  compact: T({
    id: "compact",
    label: "Compact",
    description: "Tighter spacing to fit more on one page without shrinking the text too far.",
    header: "left",
    heading: "rule",
    headingColor: "accent",
    nameCase: "normal",
    tracking: 0.3,
    datesItalic: false,
    mutedSubtitles: false,
    useAccent: true,
    density: 0.72,
    nameSize: 19,
    defaultFont: "Source Sans 3",
    defaultHeadingFont: null,
    defaultAccent: null,
  }),
  professional: T({
    id: "professional",
    label: "Professional",
    description: "Centred capitals, bold headline, \"Role — Company\" lines with italic dates and a navy rule under each heading. Crisp and recruiter-friendly.",
    header: "center",
    heading: "rule",
    headingColor: "ink",
    nameCase: "upper",
    tracking: 0.3,
    datesItalic: true,
    mutedSubtitles: false,
    useAccent: true,
    density: 1.15,
    nameSize: 21,
    defaultFont: "Source Sans 3",
    defaultHeadingFont: null,
    defaultAccent: "#1f3864",
    // 0.5 inch, like a typical Word résumé: more words per line, less empty space at the sides.
    defaultMargin: 36,
    badge: "New",
    entryLayout: "stacked",
    contactStyle: "pipe",
    nameColor: "ink",
    headlineBold: true,
    textBoost: 0.75,
    headingGapTrim: 3,
    bulletGap: 2.6,
  }),
};

/** Settings to apply when a user picks a template (font, heading font, accent). */
export function templateDefaults(id: TemplateId): Pick<ResumeSettings, "template" | "fontFamily" | "headingFont" | "accentColor"> & Partial<Pick<ResumeSettings, "margin">> {
  const t = TEMPLATES[id];
  return {
    template: id,
    fontFamily: t.defaultFont,
    headingFont: t.defaultHeadingFont,
    accentColor: t.defaultAccent,
    ...(t.defaultMargin !== undefined ? { margin: t.defaultMargin } : {}),
  };
}

export interface LayoutPreset {
  id: string;
  label: string;
  description: string;
  template: TemplateId;
  sectionOrder: SectionKey[];
  /** Suggested skill group names for a new resume (empty groups are never exported). */
  skillCategories: string[];
  /** Heading for the skills section; developer layouts say "Technical Skills". */
  skillsTitle?: ResumeSettings["skillsTitle"];
}

/** The layout settings a preset applies. Only order and headings, never any résumé content. */
export function presetSettings(p: LayoutPreset): Pick<ResumeSettings, "sectionOrder" | "skillsTitle"> {
  return { sectionOrder: [...p.sectionOrder], skillsTitle: p.skillsTitle ?? "Skills" };
}

const ORDER = {
  experienced: ["summary", "experience", "skills", "projects", "education", "certifications", "additional"],
  fresher: ["summary", "education", "projects", "skills", "experience", "certifications", "additional"],
  technical: ["summary", "skills", "experience", "projects", "education", "certifications", "additional"],
  senior: ["summary", "experience", "skills", "education", "certifications", "additional", "projects"],
  academic: ["summary", "education", "additional", "experience", "projects", "skills", "certifications"],
  changer: ["summary", "skills", "projects", "experience", "education", "certifications", "additional"],
} satisfies Record<string, SectionKey[]>;

export const PRESETS: LayoutPreset[] = [
  { id: "experienced", label: "Experienced professional", description: "Experience first.", template: "professional", sectionOrder: ORDER.experienced, skillCategories: ["Core skills", "Tools"] },
  { id: "fresher", label: "Fresher / student", description: "Education and projects first; internships under Experience.", template: "modern", sectionOrder: ORDER.fresher, skillCategories: ["Technical", "Tools"] },
  { id: "intern", label: "Internship applicant", description: "Education, projects and coursework first.", template: "modern", sectionOrder: ORDER.fresher, skillCategories: ["Technical", "Tools"] },
  { id: "senior", label: "Senior / executive", description: "Leadership experience first; projects last.", template: "executive", sectionOrder: ORDER.senior, skillCategories: ["Leadership", "Domain"] },
  { id: "academic", label: "Academic / teaching", description: "Education, publications and teaching first.", template: "elegant", sectionOrder: ORDER.academic, skillCategories: ["Teaching", "Research"] },
  { id: "career-change", label: "Career changer", description: "Transferable skills and projects before past roles.", template: "minimal", sectionOrder: ORDER.changer, skillCategories: ["Transferable skills", "New skills"] },
  { id: "software", label: "Software engineer", description: "Skills under the summary; experience and projects.", template: "professional", sectionOrder: ORDER.technical, skillCategories: ["Languages", "Frameworks", "Databases", "Cloud & DevOps", "Tools"], skillsTitle: "Technical Skills" },
  { id: "backend", label: "Backend developer", description: "APIs, data stores and services.", template: "professional", sectionOrder: ORDER.technical, skillCategories: ["Languages", "Frameworks", "Databases", "Messaging", "Cloud & DevOps"], skillsTitle: "Technical Skills" },
  { id: "frontend", label: "Frontend developer", description: "UI frameworks, accessibility and tooling.", template: "professional", sectionOrder: ORDER.technical, skillCategories: ["Languages", "Frameworks", "Styling", "Testing", "Tools"], skillsTitle: "Technical Skills" },
  { id: "fullstack", label: "Full-stack developer", description: "Frontend, backend and deployment.", template: "professional", sectionOrder: ORDER.technical, skillCategories: ["Languages", "Frontend", "Backend", "Databases", "Cloud & DevOps"], skillsTitle: "Technical Skills" },
  { id: "database", label: "Database engineer", description: "Engines, modelling, performance.", template: "professional", sectionOrder: ORDER.technical, skillCategories: ["Databases", "Languages", "Performance & Tuning", "Tools"], skillsTitle: "Technical Skills" },
  { id: "cloud", label: "Cloud / DevOps engineer", description: "Platforms, IaC, CI/CD, observability.", template: "professional", sectionOrder: ORDER.technical, skillCategories: ["Cloud", "Containers", "IaC", "CI/CD", "Observability"], skillsTitle: "Technical Skills" },
  { id: "security", label: "Cybersecurity", description: "Domains, tools and certifications.", template: "professional", sectionOrder: ["summary", "skills", "experience", "certifications", "projects", "education", "additional"], skillCategories: ["Security domains", "Tools", "Frameworks & compliance"], skillsTitle: "Technical Skills" },
  { id: "data-analyst", label: "Data analyst", description: "Analysis, BI and SQL.", template: "professional", sectionOrder: ORDER.technical, skillCategories: ["Analysis", "BI & Visualisation", "Languages", "Databases"], skillsTitle: "Technical Skills" },
  { id: "ml", label: "AI / ML engineer", description: "Modelling, frameworks, MLOps.", template: "professional", sectionOrder: ORDER.technical, skillCategories: ["ML & AI", "Frameworks", "Languages", "Data", "MLOps"], skillsTitle: "Technical Skills" },
  { id: "manager", label: "Manager", description: "Leadership, delivery and stakeholders.", template: "executive", sectionOrder: ORDER.senior, skillCategories: ["Leadership", "Delivery", "Domain"] },
  { id: "nontech", label: "Non-technical role", description: "Experience first with core skills.", template: "classic", sectionOrder: ORDER.experienced, skillCategories: ["Core skills", "Software", "Languages"] },
];
