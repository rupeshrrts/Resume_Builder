import type { ResumeData } from "./schema/resume";
import { PRESENT_TO_PAST } from "./analysis/bullets";
import { findSkills, type SkillDef } from "./analysis/skills";
import { collectText } from "./analysis/text";
import { stripBold } from "./render/rich";
import { totalExperienceYears } from "./analysis/dates";

/**
 * Deterministic writing helpers for the guided builder. They only rearrange and polish the
 * user's own words (strong verb first, how, then result); they never add facts or numbers.
 */

export interface Intent {
  id: string;
  label: string;
  verbs: string[];
}

/** "What kind of thing did you do?" → strong verbs to start the bullet with. */
export const INTENTS: Intent[] = [
  { id: "build", label: "Built or created something", verbs: ["Built", "Developed", "Designed", "Created", "Launched", "Implemented", "Engineered"] },
  { id: "improve", label: "Improved or fixed something", verbs: ["Improved", "Optimized", "Streamlined", "Redesigned", "Refactored", "Fixed", "Modernized"] },
  { id: "reduce", label: "Saved time, money or effort", verbs: ["Reduced", "Cut", "Automated", "Eliminated", "Simplified", "Consolidated"] },
  { id: "grow", label: "Grew a number or result", verbs: ["Increased", "Grew", "Expanded", "Boosted", "Accelerated", "Generated"] },
  { id: "lead", label: "Led people or a project", verbs: ["Led", "Managed", "Coordinated", "Directed", "Mentored", "Oversaw", "Organized"] },
  { id: "analyze", label: "Analysed or researched", verbs: ["Analyzed", "Researched", "Evaluated", "Identified", "Assessed", "Investigated", "Forecasted"] },
  { id: "support", label: "Supported customers or colleagues", verbs: ["Resolved", "Supported", "Handled", "Served", "Trained", "Onboarded", "Guided"] },
  { id: "sell", label: "Sold, negotiated or persuaded", verbs: ["Negotiated", "Closed", "Secured", "Pitched", "Won", "Partnered"] },
  { id: "teach", label: "Taught, wrote or presented", verbs: ["Taught", "Wrote", "Presented", "Documented", "Authored", "Published"] },
];

const PAST_TO_PRESENT: Record<string, string> = Object.fromEntries(Object.entries(PRESENT_TO_PAST).map(([p, past]) => [past, p]));
const IRREGULAR_PRESENT: Record<string, string> = { led: "Lead", built: "Build", wrote: "Write", cut: "Cut", won: "Win", oversaw: "Oversee", taught: "Teach", grew: "Grow", drove: "Drive" };

/** Current roles read naturally in present tense ("Lead…"), past roles in past tense ("Led…"). */
export function verbForTense(verb: string, current: boolean): string {
  const v = verb.trim();
  if (!current) return v;
  const lower = v.toLowerCase();
  if (IRREGULAR_PRESENT[lower]) return IRREGULAR_PRESENT[lower];
  if (PAST_TO_PRESENT[lower]) return cap(PAST_TO_PRESENT[lower]);
  if (lower.endsWith("ied")) return cap(lower.slice(0, -3) + "y");
  if (lower.endsWith("ed")) {
    const stem = lower.slice(0, -2);
    // optimized -> optimize, reduced -> reduce, automated -> automate
    if (/(at|iz|is|uc|ag|ov|ar|ur|in)$/.test(stem)) return cap(stem + "e");
    return cap(stem.replace(/(.)\1$/, "$1"));
  }
  return v;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const clean = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[.;,\s]+$/, "");

/** Ordinary words people capitalise out of habit at the start of a phrase. */
const COMMON_STARTERS = new Set(
  "a an the our my their its this that these those new internal existing weekly monthly daily annual all key multiple several many various over more less customer customers client clients company team teams data sales report reports dashboards dashboard website site app apps application applications system systems process processes product products feature features tests test students staff users user end".split(
    " ",
  ),
);

/**
 * Lower-cases the first word only when it's an ordinary word ("The checkout page" -> "the checkout page")
 * or an -ing phrase; names, tools and acronyms (React, Node.js, AWS, Infosys) stay as typed.
 */
function lead(s: string) {
  const t = clean(s);
  const first = (t.split(" ")[0] ?? "").toLowerCase();
  if (COMMON_STARTERS.has(first) || (/ing$/.test(first) && t[0] === t[0].toUpperCase() && /^[A-Z][a-z]+$/.test(t.split(" ")[0]))) return t[0].toLowerCase() + t.slice(1);
  return t;
}

export interface BulletParts {
  verb: string;
  what: string;
  how?: string;
  result?: string;
  purpose?: string;
}

/**
 * Assembles one bullet: "<Verb> <what> [to <purpose>] [using <how>], [<result>]."
 * Example: Built | an order-tracking API | Node.js and PostgreSQL | used by 25,000 customers a month
 *  -> "Built an order-tracking API using Node.js and PostgreSQL, used by 25,000 customers a month."
 */
export function composeBullet(p: BulletParts, current = false): string {
  const what = clean(p.what);
  if (!what) return "";
  const verb = verbForTense(p.verb || "Delivered", current);
  // If the user already started with a verb, don't double it.
  const firstWord = what.split(" ")[0].toLowerCase();
  const startsWithVerb = /ed$/.test(firstWord) || PRESENT_TO_PAST[firstWord] !== undefined || ["led", "built", "wrote", "ran", "won", "cut"].includes(firstWord);
  let out = startsWithVerb ? cap(what) : `${verb} ${lead(what)}`;
  if (p.purpose && clean(p.purpose)) out += ` to ${lead(p.purpose).replace(/^to\s+/i, "")}`;
  if (p.how && clean(p.how)) {
    const how = lead(p.how);
    out += /^(using|with|in|via|through|by)\b/i.test(how) ? ` ${how}` : ` using ${how}`;
  }
  if (p.result && clean(p.result)) {
    const r = lead(p.result);
    out += /^(resulting|which|that|so|and|leading|cutting|reducing|increasing|raising|saving|improving|growing|helping|enabling)\b/i.test(r) ? `, ${r}` : `, ${r.match(/^(used|adopted|serving|handling)\b/i) ? "" : "resulting in "}${r}`;
  }
  return `${out.replace(/\s+,/g, ",")}.`;
}

/**
 * Turns free-form notes into a single bullet without AI. Everything pasted stays one point:
 * line breaks (often just wrapping copied from a PDF or document) are joined back together,
 * list markers and filler openings are trimmed, and the first verb is capitalised.
 */
export function notesToBullet(notes: string, current = false): string {
  const joined = notes
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^([-•*▪●◦]|\d+[.)])\s+/, ""))
    .filter(Boolean)
    // A word split at the line end ("client-" / "reported") is rejoined without a space.
    .reduce((acc, l) => (/\w-$/.test(acc) ? acc + l : acc ? `${acc} ${l}` : l), "");
  let s = clean(joined);
  // Strip stacked filler openings: "I was responsible for testing" -> "testing".
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/^(i was |i am |i |my job was to |my role was to |was |responsible for |worked on |working on |helped (to )?|assisted (with |in )?)/i, "");
  }
  if (!s) return "";
  const first = s.split(" ")[0].toLowerCase();
  const past = PRESENT_TO_PAST[first];
  const body = past && !current ? `${cap(past)}${s.slice(first.length)}` : cap(s);
  return /[.!?]$/.test(body) ? body : `${body}.`;
}

export type CareerStage = "student" | "early" | "experienced" | "senior" | "changer";

/** A first-draft summary built only from what the user entered. */
export function composeSummary(r: ResumeData, opts: { targetRole: string; stage: CareerStage }): string {
  const role = clean(opts.targetRole) || clean(r.contact.headline) || "Professional";
  const years = totalExperienceYears(r.experience);
  const skills = topSkills(r, 4).map((s) => s.name);
  const skillText = skills.length > 1 ? `${skills.slice(0, -1).join(", ")} and ${skills[skills.length - 1]}` : skills[0] ?? "";
  const highlight = bestBullet(r);
  const edu = r.education[0];
  const parts: string[] = [];
  if (opts.stage === "student" || years < 1) {
    const deg = edu ? [edu.degree, edu.field && `in ${edu.field}`].filter(Boolean).join(" ") : "";
    parts.push(`${deg ? `${deg} ${edu?.endDate && Number(edu.endDate.slice(0, 4)) > new Date().getFullYear() ? "student" : "graduate"}` : `Aspiring ${role}`}${skillText ? ` with hands-on experience in ${skillText}` : ""}.`);
    if (highlight) parts.push(`Highlights include: ${lead(highlight).replace(/\.$/, "")}.`);
    parts.push(`Seeking a ${role} role.`);
  } else if (opts.stage === "changer") {
    parts.push(`${cap(role)} bringing ${Math.floor(years)}+ years of professional experience${skillText ? ` and skills in ${skillText}` : ""}.`);
    if (highlight) parts.push(`${cap(highlight.replace(/\.$/, ""))}.`);
  } else {
    const yrs = years >= 1 ? `${Math.floor(years)}+ years of experience` : "experience";
    parts.push(`${cap(role)} with ${yrs}${skillText ? ` in ${skillText}` : ""}.`);
    if (highlight) parts.push(`${cap(highlight.replace(/\.$/, ""))}.`);
    if (opts.stage === "senior" && r.experience.some((e) => /lead|manag|head|director|principal/i.test(e.title))) parts.push("Experienced in leading teams and delivery.");
  }
  return parts.join(" ");
}

/** The resume's most evidence-rich bullet (has a number, longest), used as a summary highlight. */
function bestBullet(r: ResumeData): string | null {
  const all = [...r.experience.flatMap((e) => e.bullets), ...r.projects.flatMap((p) => p.bullets)].map((b) => stripBold(b.text).trim()).filter(Boolean);
  const withNum = all.filter((t) => /\d/.test(t));
  const pool = withNum.length ? withNum : all;
  const best = pool.sort((a, b) => b.length - a.length).find((t) => t.split(" ").length <= 28) ?? null;
  return best ? toPastTense(best) : null;
}

/** "Improve the report…" (a current-role bullet) reads as an instruction in a summary; use "Improved…". */
export function toPastTense(sentence: string): string {
  const [first, ...rest] = sentence.split(" ");
  const lower = first.toLowerCase();
  const irregular: Record<string, string> = { lead: "led", build: "built", write: "wrote", run: "ran", win: "won", cut: "cut", oversee: "oversaw", teach: "taught", grow: "grew", drive: "drove", make: "made", sell: "sold" };
  let past = irregular[lower] ?? PRESENT_TO_PAST[lower];
  if (!past) {
    if (lower.endsWith("ed")) return sentence;
    if (/^(design|develop|implement|create|automate|analy[sz]e|optimi[sz]e|manage|deliver|launch|reduce|increase|improve|migrate|maintain|support|test|deploy|integrate|streamline|coordinate|mentor|train)$/.test(lower))
      past = lower.endsWith("e") ? `${lower}d` : `${lower}ed`;
  }
  return past ? [cap(past), ...rest].join(" ") : sentence;
}

/** Skills mentioned across the resume, most-mentioned first. */
export function topSkills(r: ResumeData, n = 6): SkillDef[] {
  const counts = new Map<string, { def: SkillDef; n: number }>();
  for (const t of collectText(r)) for (const h of findSkills(t.text)) counts.set(h.skill.name, { def: h.skill, n: (counts.get(h.skill.name)?.n ?? 0) + (t.evidence ? 2 : 1) });
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, n).map((x) => x.def);
}

/** Skills that appear in the user's experience/projects but aren't in their skills list yet. */
export function suggestSkillsFromText(r: ResumeData): SkillDef[] {
  const listed = new Set(r.skills.flatMap((g) => g.items.map((i) => i.toLowerCase())));
  const listedNames = new Set(findSkills(r.skills.flatMap((g) => g.items).join(", ")).map((h) => h.skill.name));
  const evidence = collectText(r).filter((t) => t.evidence).map((t) => t.text).join("\n");
  return findSkills(evidence)
    .map((h) => h.skill)
    .filter((s) => !listedNames.has(s.name) && !listed.has(s.name.toLowerCase()));
}
