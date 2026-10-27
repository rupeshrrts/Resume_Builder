import type { ResumeData } from "../schema/resume";
import { hrefFor } from "./model";
import { stripBold } from "./rich";

/**
 * Export to the open JSON Resume format (jsonresume.org, schema v1.0.0), so the content can
 * be used with its themes and other tools. Only resume content is exported; app-specific
 * fields (ids, AI provenance, layout settings) are left out.
 */

const NETWORKS: [RegExp, string][] = [
  [/linkedin\.com/i, "LinkedIn"],
  [/github\.com/i, "GitHub"],
  [/gitlab\.com/i, "GitLab"],
  [/(twitter|x)\.com/i, "Twitter"],
  [/behance\.net/i, "Behance"],
  [/dribbble\.com/i, "Dribbble"],
  [/kaggle\.com/i, "Kaggle"],
  [/stackoverflow\.com/i, "Stack Overflow"],
  [/medium\.com/i, "Medium"],
];

const lines = (bs: { text: string }[]) => bs.map((b) => stripBold(b.text).trim()).filter(Boolean);
const opt = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== undefined && !(Array.isArray(v) && !v.length))) as Partial<T>;

export function toJsonResume(r: ResumeData) {
  const c = r.contact;
  const [city, ...region] = c.location.split(",").map((s) => s.trim()).filter(Boolean);
  const profiles: { network: string; username: string; url: string }[] = [];
  let website = "";
  for (const l of c.links) {
    const url = hrefFor(l.url);
    const net = NETWORKS.find(([re]) => re.test(url))?.[1];
    if (net) profiles.push({ network: net, username: url.replace(/\/$/, "").split("/").pop() ?? "", url });
    else if (!website) website = url;
    else profiles.push({ network: l.label || "Website", username: "", url });
  }

  const languages: { language: string; fluency?: string }[] = [];
  const awards: { title: string; summary?: string }[] = [];
  const publications: { name: string }[] = [];
  const volunteer: { summary: string }[] = [];
  const other: { title: string; items: string[] }[] = [];
  for (const a of r.additional) {
    const items = lines(a.bullets);
    if (/language/i.test(a.title))
      for (const item of items)
        for (const part of item.split(/,(?![^(]*\))/)) {
          const m = /^\s*([^(]+?)\s*(?:\(([^)]+)\))?\s*$/.exec(part);
          if (m) languages.push(opt({ language: m[1], fluency: m[2] ?? "" }) as { language: string });
        }
    else if (/award|honou?r|achievement|recognition/i.test(a.title)) awards.push(...items.map((t) => ({ title: t })));
    else if (/publication|paper/i.test(a.title)) publications.push(...items.map((t) => ({ name: t })));
    else if (/volunt/i.test(a.title)) volunteer.push(...items.map((t) => ({ summary: t })));
    else other.push({ title: a.title, items });
  }

  return {
    $schema: "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json",
    basics: opt({
      name: c.fullName,
      label: c.headline,
      email: c.email,
      phone: c.phone,
      url: website,
      summary: r.summary.text,
      location: city ? opt({ city, region: region.join(", ") }) : undefined,
      profiles,
    }),
    work: r.experience.map((e) =>
      opt({ name: e.company, position: e.title, location: e.location, startDate: e.startDate, endDate: e.current ? "" : e.endDate, highlights: lines(e.bullets) }),
    ),
    volunteer,
    education: r.education.map((e) =>
      opt({ institution: e.institution, area: e.field, studyType: e.degree, startDate: e.startDate, endDate: e.endDate, score: e.grade, courses: lines(e.bullets) }),
    ),
    awards,
    certificates: r.certifications.map((x) => opt({ name: x.name, issuer: x.issuer, date: x.date, url: x.url ? hrefFor(x.url) : "" })),
    publications,
    skills: r.skills.map((g) => opt({ name: g.category || "Skills", keywords: g.items })),
    languages,
    projects: r.projects.map((p) =>
      opt({ name: p.name, roles: p.role ? [p.role] : [], url: p.url ? hrefFor(p.url) : "", keywords: p.technologies, startDate: p.startDate, endDate: p.endDate, highlights: lines(p.bullets) }),
    ),
    meta: opt({ version: "v1.0.0", additionalSections: other }),
  };
}
