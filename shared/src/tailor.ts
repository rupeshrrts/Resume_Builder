import type { Bullet, ResumeData, ResumeSettings, SectionKey } from "./schema/resume";
import { SECTION_LABELS, normalizeSectionOrder } from "./schema/resume";
import { IMPORTANCE_WEIGHT, type JobAnalysis } from "./analysis/jd";
import { SKILLS, textHasSkill, findSkill } from "./analysis/skills";
import { stem, words } from "./analysis/text";

/**
 * Deterministic tailoring proposals: reorder what the user already has so the most
 * job-relevant evidence comes first, and align skill names with the posting's wording.
 * Nothing is added or reworded beyond renaming a skill to its exact synonym.
 */

export interface TailorDoc {
  data: ResumeData;
  settings: ResumeSettings;
}

export interface Proposal {
  id: string;
  kind: "skills-order" | "bullets-order" | "projects-order" | "section-order" | "terminology" | "summary" | "bullet-rewrite";
  title: string;
  why: string;
  before: string;
  after: string;
  /** Safe = only reorders or renames to an exact synonym; nothing new is claimed. */
  safe: boolean;
  /** Warnings from the fact guard (AI proposals); the user must confirm before applying. */
  warnings?: string[];
  apply: (doc: TailorDoc) => TailorDoc;
}

const skillDef = (name: string) => SKILLS.find((s) => s.name === name);

/** How relevant a piece of text is to the job: weighted job skills it evidences, plus key phrases. */
function relevance(text: string, job: JobAnalysis): number {
  let score = 0;
  for (const s of job.skills) {
    const def = skillDef(s.name);
    if (def && textHasSkill(text, def)) score += IMPORTANCE_WEIGHT[s.importance];
  }
  const stems = new Set(words(text).map(stem));
  for (const k of job.keyphrases) if (words(k.phrase).map(stem).every((w) => stems.has(w))) score += 1;
  return score;
}

/** Stable sort by descending score; returns null when the order wouldn't change. */
function reorder<T>(items: T[], score: (t: T) => number): T[] | null {
  const ranked = items.map((it, i) => ({ it, i, s: score(it) })).sort((a, b) => b.s - a.s || a.i - b.i);
  return ranked.some((r, i) => r.i !== i) ? ranked.map((r) => r.it) : null;
}

const list = (xs: string[]) => xs.map((x) => `• ${x}`).join("\n");

export function proposeTailoring(doc: TailorDoc, job: JobAnalysis): Proposal[] {
  const out: Proposal[] = [];
  const d = doc.data;

  // 1. Skills: job-matching skills first, within groups, and most relevant groups first.
  const itemScore = (item: string) => {
    const def = findSkill(item) ?? SKILLS.find((s) => textHasSkill(item, s));
    const js = def ? job.skills.find((j) => j.name === def.name) : undefined;
    return js ? IMPORTANCE_WEIGHT[js.importance] : 0;
  };
  const newGroups = d.skills.map((g) => ({ ...g, items: reorder(g.items, itemScore) ?? g.items }));
  const groupOrder = reorder(newGroups, (g) => g.items.reduce((a, i) => a + itemScore(i), 0)) ?? newGroups;
  const skillsChanged = groupOrder.some((g, i) => g.id !== d.skills[i]?.id || g.items.join("|") !== d.skills[i].items.join("|"));
  if (skillsChanged) {
    const fmt = (gs: typeof d.skills) => gs.map((g) => `${g.category ? `${g.category}: ` : ""}${g.items.join(", ")}`).join("\n");
    out.push({
      id: "skills-order",
      kind: "skills-order",
      title: "Lead your skills with what this job asks for",
      why: "Recruiters skim the first items in each line. Same skills, new order.",
      before: fmt(d.skills),
      after: fmt(groupOrder),
      safe: true,
      apply: (x) => ({ ...x, data: { ...x.data, skills: structuredClone(groupOrder) } }),
    });
  }

  // 2. Bullets inside each role/project: most relevant evidence first.
  const bulletScore = (b: Bullet) => relevance(b.text, job);
  for (const e of d.experience) {
    const next = reorder(e.bullets, bulletScore);
    if (next && bulletScore(next[0]) > bulletScore(e.bullets[0])) {
      out.push({
        id: `bullets-${e.id}`,
        kind: "bullets-order",
        title: `Put your most relevant work first in “${e.title || e.company}”`,
        why: "The first bullet under each role gets the most attention. Same bullets, new order.",
        before: list(e.bullets.map((b) => b.text)),
        after: list(next.map((b) => b.text)),
        safe: true,
        apply: (x) => ({ ...x, data: { ...x.data, experience: x.data.experience.map((ex) => (ex.id === e.id ? { ...ex, bullets: next.map((b) => ex.bullets.find((eb) => eb.id === b.id) ?? b) } : ex)) } }),
      });
    }
  }

  // 3. Projects: most relevant project first.
  const projScore = (p: ResumeData["projects"][number]) => relevance([p.name, p.technologies.join(", "), ...p.bullets.map((b) => b.text)].join("\n"), job);
  const projects = reorder(d.projects, projScore);
  if (projects && projScore(projects[0]) > projScore(d.projects[0])) {
    out.push({
      id: "projects-order",
      kind: "projects-order",
      title: "Show your most relevant project first",
      why: `“${projects[0].name}” uses more of what this job asks for.`,
      before: list(d.projects.map((p) => p.name)),
      after: list(projects.map((p) => p.name)),
      safe: true,
      apply: (x) => ({ ...x, data: { ...x.data, projects: projects.map((p) => x.data.projects.find((xp) => xp.id === p.id) ?? p) } }),
    });
  }

  // 4. Section order: for skill-heavy postings, skills right after the summary.
  const order = normalizeSectionOrder(doc.settings.sectionOrder);
  const techHeavy = job.skills.filter((s) => s.importance !== "preferred").length >= 5;
  const skillsIdx = order.indexOf("skills");
  const expIdx = order.indexOf("experience");
  if (techHeavy && skillsIdx > expIdx && d.skills.some((g) => g.items.length)) {
    const next: SectionKey[] = order.filter((k) => k !== "skills");
    next.splice(next.indexOf("summary") + 1, 0, "skills");
    out.push({
      id: "section-order",
      kind: "section-order",
      title: "Move Skills up, under your summary",
      why: `This posting names ${job.skills.length} specific skills; showing yours early helps both recruiters and keyword searches.`,
      before: order.map((k) => SECTION_LABELS[k]).join(" → "),
      after: next.map((k) => SECTION_LABELS[k]).join(" → "),
      safe: true,
      apply: (x) => ({ ...x, settings: { ...x.settings, sectionOrder: next } }),
    });
  }

  // 5. Terminology: a skill item written as a synonym → the posting's exact wording.
  for (const js of job.skills) {
    const def = skillDef(js.name);
    if (!def) continue;
    for (const g of d.skills) {
      for (const item of g.items) {
        if (item.toLowerCase() === js.wording.toLowerCase()) continue;
        // Postgres -> PostgreSQL and Node -> Node.js are synonyms (same start, no extra words).
        // ASP.NET Core vs .NET is a more specific technology, so it is left alone.
        const a = item.toLowerCase();
        const b = js.wording.toLowerCase();
        const [long, short] = a.length >= b.length ? [a, b] : [b, a];
        if (long.includes(short) && !(long.startsWith(short) && !/\s/.test(long.slice(short.length)))) continue;
        if (findSkill(item)?.name !== def.name) continue;
        // Only exact synonyms (the item is the skill's name or one of its aliases).
        const after = `${js.wording} (${item})`;
        out.push({
          id: `term-${g.id}-${item}`,
          kind: "terminology",
          title: `Use the posting's name for ${def.name}`,
          why: `The posting says “${js.wording}”; you wrote “${item}”. Same skill; matching the wording helps keyword searches.`,
          before: item,
          after,
          safe: true,
          apply: (x) => ({ ...x, data: { ...x.data, skills: x.data.skills.map((sg) => (sg.id === g.id ? { ...sg, items: sg.items.map((i) => (i === item ? after : i)) } : sg)) } }),
        });
      }
    }
  }
  return out;
}

/** Applies the chosen proposals in order. */
export function applyProposals(doc: TailorDoc, proposals: Proposal[]): TailorDoc {
  return proposals.reduce((acc, p) => p.apply(acc), structuredClone(doc));
}
