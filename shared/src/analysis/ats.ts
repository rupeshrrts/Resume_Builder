import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import type { ResumeData, ResumeSettings } from "../schema/resume";
import { allBullets, words, type TextLocation } from "./text";
import { analyzeBullet } from "./bullets";
import { nowMonthIndex, toMonthIndex } from "./dates";
import { SKILL_LEVEL_LABEL, findSkill } from "./skills";

/**
 * ATS-readability checks. These look for things that commonly make resumes hard for
 * applicant tracking systems (and people) to read: missing contact details, non-standard
 * headings, missing or inconsistent dates, layout features in uploaded files, and so on.
 * Applicant tracking systems differ; passing these checks does not guarantee any outcome.
 */

export type Severity = "critical" | "major" | "minor" | "info";
export type IssueCategory = "contact" | "structure" | "dates" | "content" | "skills" | "length" | "layout" | "personal" | "spelling";

export interface Issue {
  id: string;
  severity: Severity;
  category: IssueCategory;
  message: string;
  fix: string;
  loc?: TextLocation;
}

export const SEVERITY_PENALTY: Record<Severity, number> = { critical: 20, major: 8, minor: 3, info: 0 };
const CATEGORY_CAP = 40;

/** Layout signals detected in an uploaded PDF/DOCX (see lib/parse/extract). */
export interface LayoutSignals {
  format: "pdf" | "docx";
  pages: number | null;
  tables: number;
  textBoxes: number;
  images: number;
  columns: number;
  headerFooterText: boolean;
  /** True when a PDF has almost no extractable text (likely scanned). */
  imageOnly: boolean;
  unusualFonts: string[];
}

export interface AtsResult {
  score: number;
  issues: Issue[];
  passed: string[];
  estimatedPages: number;
}

const STANDARD_TITLES =
  /^(awards?|honou?rs|achievements?|accomplishments|publications?|research|languages?|volunteer(ing| experience| work)?|interests|hobbies|activities|extra[- ]?curricular( activities)?|leadership|positions? of responsibility|patents?|training|courses?|coursework|references|conferences|talks|presentations|memberships|professional memberships|affiliations|academic projects|internships?|open source|certifications?)$/i;

const PERSONAL_RE = /\b(date of birth|d\.?o\.?b\.?|marital status|married|unmarried|father'?s name|mother'?s name|religion|caste|gender|sex\s*:|nationality|age\s*[:\-]\s*\d{2}|height|weight)\b/i;
const ID_RE = /\b(aadhaar|aadhar|pan (no|number|card)|passport (no|number)|ssn|social security)\b|\b\d{4}\s?\d{4}\s?\d{4}\b|\b[A-Z]{5}\d{4}[A-Z]\b/;

const MARKET_COUNTRY: Partial<Record<ResumeSettings["market"], CountryCode>> = { IN: "IN", US: "US" };

export function checkAts(
  r: ResumeData,
  settings: ResumeSettings,
  opts: { layout?: LayoutSignals | null; spelling?: Issue[]; now?: Date } = {},
): AtsResult {
  const issues: Issue[] = [];
  const passed: string[] = [];
  const add = (i: Omit<Issue, "id">) => issues.push({ ...i, id: `${i.category}-${issues.length}` });
  const now = opts.now ?? new Date();

  // ----- contact -----
  const c = r.contact;
  if (!c.fullName.trim()) add({ severity: "critical", category: "contact", message: "Your name is missing.", fix: "Add your full name at the top." });
  if (!c.email.trim()) add({ severity: "critical", category: "contact", message: "Email address is missing.", fix: "Add a professional email address." });
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email.trim()))
    add({ severity: "major", category: "contact", message: "Email address doesn't look valid.", fix: "Check the email for typos." });
  if (!c.phone.trim()) add({ severity: "major", category: "contact", message: "Phone number is missing.", fix: "Add a phone number recruiters can call." });
  else {
    const country = MARKET_COUNTRY[settings.market];
    const p = parsePhoneNumberFromString(c.phone, country);
    if (!p || !p.isValid())
      add({
        severity: "minor",
        category: "contact",
        message: "Phone number doesn't look valid" + (country ? ` for ${country === "IN" ? "India" : "the US"}.` : "."),
        fix: country ? "Check the digits. Add the country code (e.g. +91) if you're applying abroad." : "Include the country code, e.g. +44 20 7946 0958.",
      });
    else if (settings.market !== "IN" && settings.market !== "US" && !c.phone.trim().startsWith("+"))
      add({ severity: "minor", category: "contact", message: "Phone number has no country code.", fix: "Use international format (+country code) for applications outside your country." });
  }
  if (!c.location.trim())
    add({ severity: "minor", category: "contact", message: "Location is missing.", fix: "Add your city and state/country. A full street address isn't needed." });
  else if (/\d{6}|\d{5}(-\d{4})?\b|\b(flat|house|plot|street|road|lane|apt|apartment|sector)\b/i.test(c.location))
    add({ severity: "minor", category: "personal", message: "Location looks like a full address.", fix: "City and state/country are enough. Leave out the street address and PIN/ZIP code." });
  for (const l of c.links) {
    if (l.url && !/^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(l.url.trim()))
      add({ severity: "minor", category: "contact", message: `Link “${l.label || l.url}” doesn't look like a valid URL.`, fix: "Use a full address such as linkedin.com/in/your-name." });
  }
  if (!c.links.some((l) => /linkedin\.com/i.test(l.url)))
    add({ severity: "info", category: "contact", message: "No LinkedIn profile link.", fix: "Many recruiters look for one; add it if you have an up-to-date profile." });
  if (issues.filter((i) => i.category === "contact" && i.severity !== "info").length === 0) passed.push("Contact details are complete.");

  // ----- personal information -----
  const allText = [r.summary.text, ...r.additional.flatMap((a) => a.bullets.map((b) => b.text)), c.headline].join("\n");
  if (ID_RE.test(allText) || ID_RE.test(c.location))
    add({ severity: "major", category: "personal", message: "Resume appears to include an ID number (Aadhaar, PAN, passport or SSN).", fix: "Remove ID numbers. Employers ask for them later, through secure channels." });
  if (PERSONAL_RE.test(allText))
    add({
      severity: settings.market === "IN" ? "info" : "minor",
      category: "personal",
      message: "Resume includes personal details (e.g. date of birth, marital status, gender).",
      fix:
        settings.market === "IN"
          ? "These are increasingly left off Indian resumes. Include them only if the employer or a government form asks."
          : "Leave these out. In this market they're not expected and can expose you to bias.",
    });

  // ----- structure -----
  const hidden = new Set(settings.hiddenSections);
  const hasExp = r.experience.length > 0 && !hidden.has("experience");
  const hasProj = r.projects.length > 0 && !hidden.has("projects");
  if (!hasExp && !hasProj)
    add({ severity: "major", category: "structure", message: "No experience or projects.", fix: "Add work experience, internships or projects. Freshers can lead with academic projects." });
  if (r.education.length === 0 || hidden.has("education"))
    add({ severity: "major", category: "structure", message: "No education section.", fix: "Add your highest qualification, institution and year." });
  if (r.skills.every((g) => g.items.length === 0) || hidden.has("skills"))
    add({ severity: "major", category: "structure", message: "No skills section.", fix: "Add a skills section. Many ATS search it directly." });
  // The summary is optional: leaving it out is a tip, not a scored issue.
  if (!r.summary.text.trim() || hidden.has("summary"))
    add({ severity: "info", category: "structure", message: "No summary (optional).", fix: "2–4 lines on your role, experience level and strongest skills help recruiters skim, but you can leave it out." });
  else {
    const n = words(r.summary.text).length;
    if (n > 90) add({ severity: "minor", category: "content", message: `Summary is long (${n} words).`, fix: "Keep it to about 30–80 words.", loc: { section: "summary", label: "Summary" } });
  }
  for (const a of r.additional) {
    if (a.title && !STANDARD_TITLES.test(a.title.trim()))
      add({
        severity: "info",
        category: "structure",
        message: `Section title “${a.title}” isn't a standard heading.`,
        fix: "Standard names (Awards, Publications, Languages, Volunteering) are easier for ATS to classify.",
        loc: { section: "additional", entryId: a.id, label: a.title },
      });
  }
  if (!issues.some((i) => i.category === "structure")) passed.push("Standard sections are present.");

  // ----- dates & chronology -----
  const nowIdx = nowMonthIndex(now);
  r.experience.forEach((e) => {
    const label = [e.title, e.company].filter(Boolean).join(" at ") || "Experience entry";
    const loc: TextLocation = { section: "experience", entryId: e.id, label };
    if (!e.title.trim()) add({ severity: "major", category: "structure", message: "A role has no job title.", fix: "Add the job title.", loc });
    if (!e.company.trim()) add({ severity: "major", category: "structure", message: `“${label}” has no employer name.`, fix: "Add the company or organisation.", loc });
    if (!e.startDate) add({ severity: "major", category: "dates", message: `“${label}” has no start date.`, fix: "Add at least the month and year you started.", loc });
    if (!e.current && !e.endDate) add({ severity: "minor", category: "dates", message: `“${label}” has no end date.`, fix: "Add an end date or mark the role as current.", loc });
    const a = toMonthIndex(e.startDate);
    const b = e.current ? nowIdx : toMonthIndex(e.endDate, true);
    if (a !== null && b !== null && b < a) add({ severity: "major", category: "dates", message: `“${label}” ends before it starts.`, fix: "Check the start and end dates.", loc });
    if (a !== null && a > nowIdx) add({ severity: "minor", category: "dates", message: `“${label}” starts in the future.`, fix: "Check the start date.", loc });
    if (e.bullets.filter((x) => x.text.trim()).length === 0)
      add({ severity: "major", category: "content", message: `“${label}” has no bullet points.`, fix: "Add 2–5 bullets on what you did and achieved.", loc });
    if (e.bullets.length > 8) add({ severity: "minor", category: "content", message: `“${label}” has ${e.bullets.length} bullets.`, fix: "Keep the 4–6 most relevant.", loc });
  });
  // Expected order: current roles first, then by end date (newest first).
  const key = (e: ResumeData["experience"][number]) => (e.current ? 1e9 : toMonthIndex(e.endDate, true) ?? toMonthIndex(e.startDate) ?? 0) * 1e5 + (toMonthIndex(e.startDate) ?? 0);
  const sorted = [...r.experience].sort((x, y) => key(y) - key(x));
  if (sorted.some((e, i) => e.id !== r.experience[i].id))
    add({ severity: "minor", category: "dates", message: "Experience isn't in reverse-chronological order.", fix: "List your most recent role first. Use “Sort by date” in the editor." });
  // Gaps over 6 months between consecutive roles (informational).
  const ivs = r.experience
    .map((e) => ({ e, a: toMonthIndex(e.startDate), b: e.current ? nowIdx : toMonthIndex(e.endDate, true) }))
    .filter((x) => x.a !== null && x.b !== null)
    .sort((x, y) => x.a! - y.a!);
  let reach = ivs[0]?.b ?? null;
  for (let i = 1; i < ivs.length; i++) {
    if (reach !== null && ivs[i].a! - reach > 6)
      add({
        severity: "info",
        category: "dates",
        message: `About ${ivs[i].a! - reach} months between roles before “${ivs[i].e.title || ivs[i].e.company}”.`,
        fix: "Gaps are common. Be ready to explain this one briefly; never adjust dates to hide it.",
      });
    reach = Math.max(reach ?? 0, ivs[i].b!);
  }
  r.education.forEach((ed) => {
    const loc: TextLocation = { section: "education", entryId: ed.id, label: ed.institution || ed.degree || "Education" };
    if (!ed.institution.trim()) add({ severity: "major", category: "structure", message: "An education entry has no institution.", fix: "Add the college/university/school.", loc });
    if (!ed.degree.trim()) add({ severity: "major", category: "structure", message: "An education entry has no degree or qualification.", fix: "Add the qualification, e.g. B.Tech, MBA, Class XII.", loc });
    if (!ed.endDate && !ed.startDate) add({ severity: "minor", category: "dates", message: `“${loc.label}” has no dates.`, fix: "Add the graduation year (or expected year).", loc });
  });
  if (!issues.some((i) => i.category === "dates")) passed.push("Dates are present and in order.");

  // ----- content repetition & consistency -----
  const bullets = allBullets(r).filter((b) => b.text.trim());
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const seen = new Map<string, number>();
  for (const b of bullets) {
    const k = norm(b.text);
    if (seen.has(k)) add({ severity: "major", category: "content", message: "Duplicate bullet point.", fix: "Remove or rewrite the repeated bullet.", loc: b.loc });
    else seen.set(k, 1);
  }
  const firstWords = new Map<string, number>();
  for (const b of bullets) {
    const f = (words(b.text)[0] ?? "").toLowerCase();
    if (f) firstWords.set(f, (firstWords.get(f) ?? 0) + 1);
  }
  const overused = [...firstWords.entries()].filter(([, n]) => n >= 3 && bullets.length >= 6).map(([w, n]) => `“${w}” ×${n}`);
  if (overused.length)
    add({ severity: "minor", category: "content", message: `Repeated opening words: ${overused.join(", ")}.`, fix: "Vary your verbs so each bullet reads as a distinct contribution." });
  const weakCounts = new Map<string, { n: number; loc: TextLocation }>();
  let pronouns = 0;
  for (const b of bullets) {
    const a = analyzeBullet(b.text);
    for (const w of a.weak) weakCounts.set(w.label, { n: (weakCounts.get(w.label)?.n ?? 0) + 1, loc: weakCounts.get(w.label)?.loc ?? b.loc });
    if (a.pronoun) pronouns++;
  }
  for (const [label, { n, loc }] of weakCounts)
    add({ severity: "minor", category: "content", message: `Generic wording ${label} used ${n}×.`, fix: "Replace with specific actions and results.", loc });
  if (pronouns) add({ severity: "minor", category: "content", message: `${pronouns} bullet(s) use personal pronouns.`, fix: "Resume bullets conventionally omit I/my/we." });
  if (bullets.length >= 4) {
    const withPeriod = bullets.filter((b) => /[.!]$/.test(b.text.trim())).length;
    const ratio = withPeriod / bullets.length;
    if (ratio > 0.2 && ratio < 0.8)
      add({ severity: "minor", category: "content", message: "Bullet punctuation is inconsistent.", fix: "End all bullets with a full stop, or none." });
  }
  if (!issues.some((i) => i.category === "content")) passed.push("No repetition or generic wording detected.");

  // ----- skills -----
  const skillItems = r.skills.flatMap((g) => g.items.map((i) => ({ i, g })));
  // Compare the user's own wording, not taxonomy aliases: aliases are broad for search
  // (PL/SQL finds SQL, GitHub finds Git), but those are different skills, not duplicates.
  // Only spelling variants of the same name count: "React" / "React.js", "Node JS" / "Node.js".
  const sameSkill = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, "").replace(/js$/, "");
  const dup = new Map<string, { label: string; n: number }>();
  for (const { i } of skillItems) {
    const k = sameSkill(i);
    if (!k) continue;
    dup.set(k, { label: dup.get(k)?.label ?? i.trim(), n: (dup.get(k)?.n ?? 0) + 1 });
  }
  const dups = [...dup.values()].filter((d) => d.n > 1).map((d) => d.label);
  if (dups.length) add({ severity: "minor", category: "skills", message: `Duplicate skills: ${dups.join(", ")}.`, fix: "List each skill once." });
  if (skillItems.length > 40) add({ severity: "minor", category: "skills", message: `${skillItems.length} skills listed.`, fix: "Trim to the skills most relevant to your target role." });
  const levelled = skillItems.filter(({ i }) => SKILL_LEVEL_LABEL.test(i)).map(({ i }) => i);
  if (levelled.length)
    add({
      severity: "minor",
      category: "skills",
      message: `Skill-level labels or ratings: ${levelled.slice(0, 4).join(", ")}.`,
      fix: "Ratings like “Expert” or 8/10 can't be parsed meaningfully and invite scrutiny. List the skill and show depth in your bullets.",
    });
  for (const { i } of skillItems) {
    const d = findSkill(i);
    if (d?.legacy) add({ severity: "info", category: "skills", message: `“${i}”: ${d.legacy}`, fix: "Keep it if the target role uses it; otherwise consider removing." });
  }

  // ----- length -----
  const totalWords = words(
    [r.summary.text, ...bullets.map((b) => b.text), ...r.skills.flatMap((g) => g.items), ...r.experience.map((e) => `${e.title} ${e.company}`)].join(" "),
  ).length;
  const estimatedPages = Math.max(1, Math.round((totalWords / 520) * 10) / 10);
  const years = r.experience.length;
  if (estimatedPages > 3) add({ severity: "major", category: "length", message: `Estimated ${estimatedPages} pages.`, fix: "Aim for 1–2 pages. Cut older or less relevant detail." });
  else if (estimatedPages > 2.1) add({ severity: "minor", category: "length", message: `Estimated ${estimatedPages} pages.`, fix: "Two pages is the norm for experienced candidates." });
  else if (estimatedPages > 1.2 && years <= 2) add({ severity: "info", category: "length", message: `Estimated ${estimatedPages} pages.`, fix: "Early-career resumes usually fit on one page." });

  // ----- layout (uploaded files) -----
  const L = opts.layout;
  if (L) {
    if (L.imageOnly) add({ severity: "critical", category: "layout", message: "The file has little or no selectable text (it may be scanned or an image).", fix: "ATS can't read images. Rebuild the resume as a text document. This editor exports text-based PDF and DOCX." });
    if (L.columns > 1) add({ severity: "major", category: "layout", message: `${L.columns}-column layout detected.`, fix: "Some ATS read columns in the wrong order. A single-column layout is the safest choice." });
    if (L.tables > 0) add({ severity: "major", category: "layout", message: `${L.tables} table(s) detected.`, fix: "Content inside tables is often skipped or scrambled. Move it into normal text." });
    if (L.textBoxes > 0) add({ severity: "major", category: "layout", message: `${L.textBoxes} text box(es) detected.`, fix: "Text boxes are frequently ignored by parsers. Move their content into the main body." });
    if (L.images > 0) add({ severity: "minor", category: "layout", message: `${L.images} image(s) or graphic(s) detected.`, fix: "Photos, icons and skill bars carry no parsable text. Remove them unless the market expects a photo." });
    if (L.headerFooterText) add({ severity: "minor", category: "layout", message: "Text found in the page header/footer.", fix: "Some ATS skip headers and footers. Keep contact details in the main body." });
    if (L.unusualFonts.length) add({ severity: "info", category: "layout", message: `Uncommon fonts: ${L.unusualFonts.slice(0, 3).join(", ")}.`, fix: "Standard fonts (Arial, Calibri, Helvetica, Times) extract most reliably." });
    if (!issues.some((i) => i.category === "layout")) passed.push("Uploaded file layout is simple and text-based.");
  } else {
    passed.push("Exports use a single-column, text-based layout with standard headings (no tables, text boxes or graphics).");
  }

  for (const s of opts.spelling ?? []) issues.push(s);

  const byCat = new Map<IssueCategory, number>();
  // Spelling is capped lower: the dictionary can't know every name and technical term.
  for (const i of issues)
    byCat.set(i.category, Math.min(i.category === "spelling" ? 12 : CATEGORY_CAP, (byCat.get(i.category) ?? 0) + SEVERITY_PENALTY[i.severity]));
  const penalty = [...byCat.values()].reduce((a, b) => a + b, 0);
  const order: Severity[] = ["critical", "major", "minor", "info"];
  issues.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return { score: Math.max(0, 100 - penalty), issues, passed, estimatedPages };
}
