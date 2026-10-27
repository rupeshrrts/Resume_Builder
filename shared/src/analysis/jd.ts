import { SKILLS, findSkills, countSkillMentions, type SkillDef } from "./skills";
import { STOPWORDS, normalizeSpace, splitSentences, stem, words } from "./text";

/**
 * Deterministic job-description analysis. Splits the posting into requirement lines,
 * classifies each as essential / preferred / responsibility from section headings and
 * wording, and extracts skills, years of experience, education and keyphrases.
 */

export type Importance = "essential" | "responsibility" | "preferred" | "mentioned";

export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  essential: 3,
  responsibility: 2,
  mentioned: 2,
  preferred: 1,
};

export interface JobLine {
  id: string;
  text: string;
  importance: Importance;
  skills: string[];
}

export interface JobSkill {
  name: string;
  category: string;
  importance: Importance;
  mentions: number;
  /** Wording used in the posting, e.g. "Postgres" for PostgreSQL. */
  wording: string;
}

export interface JobAnalysis {
  lines: JobLine[];
  skills: JobSkill[];
  keyphrases: { phrase: string; count: number }[];
  minYears: number | null;
  yearsText: string | null;
  education: { level: number; label: string; text: string } | null;
  titleGuess: string;
  ignoredSections: string[];
  wordCount: number;
}

const HEADING_RULES: { re: RegExp; kind: Importance | "ignore" }[] = [
  { re: /(nice[- ]to[- ]have|preferred|bonus|desired|desirable|good[- ]to[- ]have|plus|additional|optional|added advantage)/i, kind: "preferred" },
  { re: /(requirement|qualification|must[- ]have|what you('ll)? (need|bring)|who you are|you have|skills|minimum|basic|essential|eligibility|what we('re)? look(ing)? for|technical expertise|competenc)/i, kind: "essential" },
  { re: /(responsib|what you('ll| will) do|duties|day[- ]to[- ]day|the role|your role|role overview|job description|key result|kra|in this role|you will)/i, kind: "responsibility" },
  { re: /(about (us|the company|the team)|benefits|perks|what we offer|why join|compensation|salary|equal opportunity|eeo|diversity|how to apply|our (values|culture)|life at|location|work mode)/i, kind: "ignore" },
];

const PREFERRED_WORDS = /\b(preferred|nice to have|a plus|is a plus|bonus|desirable|good to have|ideally|advantageous|added advantage|familiarity with|exposure to)\b/i;
const ESSENTIAL_WORDS = /\b(must|required|requires|minimum|at least|mandatory|essential|need to have|proven|strong (knowledge|experience|understanding)|proficien(t|cy)|hands[- ]on experience|solid experience|expertise in|experience (in|with))\b/i;

const EDU_LEVELS: { re: RegExp; level: number; label: string }[] = [
  { re: /\b(ph\.?\s?d|doctorate|doctoral)\b/i, level: 4, label: "Doctorate" },
  { re: /\b(master'?s?|m\.?\s?tech|m\.?\s?e\b|m\.?\s?sc|msc|m\.?\s?s\b|mba|pgdm|mca|m\.?\s?com|post[- ]?graduate|pg diploma)\b/i, level: 3, label: "Master's / postgraduate" },
  { re: /\b(bachelor'?s?|b\.?\s?tech|b\.?\s?e\b|be\/btech|b\.?\s?sc|bsc|b\.?\s?s\b|bca|b\.?\s?com|bba|b\.?\s?a\b|undergraduate|graduate degree|graduation|degree in|engineering degree|ug degree)\b/i, level: 2, label: "Bachelor's" },
  { re: /\b(diploma|iti|associate'?s? degree)\b/i, level: 1, label: "Diploma" },
];

export function educationLevel(text: string): { level: number; label: string } | null {
  for (const e of EDU_LEVELS) if (e.re.test(text)) return { level: e.level, label: e.label };
  return null;
}

function headingKind(line: string): Importance | "ignore" | null {
  const t = line.replace(/[:#*_\-–—]+$/g, "").trim();
  const looksLikeHeading = (t.length <= 60 && /:$/.test(line.trim())) || (t.length <= 45 && !/[.,;]$/.test(t) && t.split(/\s+/).length <= 7);
  if (!looksLikeHeading) return null;
  for (const r of HEADING_RULES) if (r.re.test(t)) return r.kind;
  return null;
}

const YEARS_RE = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*(\d{1,2})\s*)?\+?\s*(?:years?|yrs?)\b/i;

/** Splits a posting into candidate requirement lines, keeping heading context. */
export function analyzeJob(description: string): JobAnalysis {
  const raw = description.replace(/\r/g, "").slice(0, 30000);
  const lines: JobLine[] = [];
  const ignoredSections: string[] = [];
  let context: Importance | "ignore" | null = null;
  let n = 0;
  for (const rawLine of raw.split(/\n+/)) {
    const line = normalizeSpace(rawLine.replace(/^[\s•●▪◦‣\-*–·>]+|^\d+[.)]\s+/, ""));
    if (!line) continue;
    const hk = headingKind(line);
    if (hk) {
      context = hk;
      if (hk === "ignore") ignoredSections.push(line.replace(/:$/, ""));
      // A heading like "Skills: Java, Spring" also carries content after the colon.
      const after = line.includes(":") ? line.slice(line.indexOf(":") + 1).trim() : "";
      if (!after) continue;
    }
    if (context === "ignore") continue;
    const pieces = line.length > 220 ? splitSentences(line) : [line];
    for (const piece of pieces) {
      let importance: Importance = context ?? "mentioned";
      if (PREFERRED_WORDS.test(piece)) importance = "preferred";
      else if (ESSENTIAL_WORDS.test(piece) && importance !== "preferred") importance = "essential";
      lines.push({ id: `l${++n}`, text: piece, importance, skills: findSkills(piece).map((h) => h.skill.name) });
    }
  }

  const rank: Record<Importance, number> = { essential: 4, responsibility: 3, mentioned: 2, preferred: 1 };
  const skillMap = new Map<string, JobSkill>();
  for (const l of lines) {
    for (const h of findSkills(l.text)) {
      const prev = skillMap.get(h.skill.name);
      if (!prev) {
        skillMap.set(h.skill.name, {
          name: h.skill.name,
          category: h.skill.category,
          importance: l.importance,
          mentions: 0,
          wording: h.matched,
        });
      } else if (rank[l.importance] > rank[prev.importance]) {
        prev.importance = l.importance;
      }
    }
  }
  const relevantText = lines.map((l) => l.text).join("\n");
  for (const s of skillMap.values()) {
    const def = findSkillDef(s.name);
    s.mentions = def ? Math.max(1, countSkillMentions(relevantText, def)) : 1;
  }
  const skills = [...skillMap.values()].sort((a, b) => rank[b.importance] - rank[a.importance] || b.mentions - a.mentions);

  // Years of experience: the smallest figure stated on an essential/mentioned line.
  let minYears: number | null = null;
  let yearsText: string | null = null;
  for (const l of lines) {
    if (l.importance === "preferred") continue;
    const m = l.text.match(YEARS_RE);
    if (m && /experience|exp\b|working/i.test(l.text)) {
      const y = Number(m[1]);
      if (y > 0 && y < 40 && (minYears === null || y < minYears)) {
        minYears = y;
        yearsText = l.text;
      }
    }
  }

  let education: JobAnalysis["education"] = null;
  for (const l of lines) {
    if (l.importance === "preferred") continue;
    if (!/degree|graduat|bachelor|master|b\.?tech|b\.?e\b|mba|diploma|ph\.?d|qualification|mca|bca|b\.?sc|m\.?tech/i.test(l.text)) continue;
    const e = educationLevel(l.text);
    if (e && (!education || e.level < education.level)) education = { ...e, text: l.text };
  }

  return {
    lines,
    skills,
    keyphrases: extractKeyphrases(lines, new Set(skills.map((s) => s.name.toLowerCase()))),
    minYears,
    yearsText,
    education,
    titleGuess: guessTitle(raw),
    ignoredSections,
    wordCount: words(raw).length,
  };
}

function findSkillDef(name: string): SkillDef | undefined {
  return SKILLS.find((s) => s.name === name);
}

function guessTitle(raw: string): string {
  const first = raw.split(/\n+/).map((l) => l.trim()).find((l) => l.length > 2 && l.length < 80);
  if (!first) return "";
  const m = raw.match(/(?:job title|position|role)\s*[:\-]\s*(.+)/i);
  return normalizeSpace((m?.[1] ?? first).slice(0, 80));
}

/**
 * Two- and three-word phrases that recur in requirement lines and aren't already
 * covered by the skills taxonomy (e.g. "payment systems", "client onboarding").
 */
function extractKeyphrases(lines: JobLine[], skillNames: Set<string>) {
  const counts = new Map<string, { phrase: string; count: number; weight: number }>();
  for (const l of lines) {
    if (l.importance === "preferred") continue;
    const w = words(l.text).map((x) => x.toLowerCase());
    for (let size = 2; size <= 3; size++) {
      for (let i = 0; i + size <= w.length; i++) {
        const gram = w.slice(i, i + size);
        if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[size - 1])) continue;
        if (gram.some((g) => g.length < 3 || /^\d/.test(g))) continue;
        if (gram.filter((g) => STOPWORDS.has(g)).length > 0) continue;
        const phrase = gram.join(" ");
        if (skillNames.has(phrase)) continue;
        const key = gram.map(stem).join(" ");
        const cur = counts.get(key) ?? { phrase, count: 0, weight: 0 };
        cur.count++;
        cur.weight += l.importance === "essential" ? 2 : 1;
        counts.set(key, cur);
      }
    }
  }
  return [...counts.values()]
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.weight - a.weight || b.count - a.count)
    .slice(0, 12)
    .map(({ phrase, count }) => ({ phrase, count }));
}
