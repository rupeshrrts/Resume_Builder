import type { ResumeData } from "./schema/resume";
import type { StoryInput } from "./schema/story";
import type { JobAnalysis } from "./analysis/jd";
import { matchResume } from "./analysis/match";
import { analyzeBullet, extractNumbers } from "./analysis/bullets";
import { nowMonthIndex, toMonthIndex, totalExperienceYears } from "./analysis/dates";
import { firstPerson, relevantEvidence } from "./letters";

/**
 * Interview preparation built only from the user's resume and the job posting: likely
 * questions with the reason each is likely, and STAR story skeletons drafted from the user's
 * own bullets. Nothing here predicts what a particular interviewer will ask.
 */

export type QuestionKind = "behavioural" | "technical" | "resume" | "gap" | "motivation";

export interface PrepQuestion {
  id: string;
  kind: QuestionKind;
  question: string;
  /** Why this question is likely, in terms of the resume or posting. */
  why: string;
  /** How to approach the answer. */
  hint: string;
  /** Story tags that would answer it (matched against the story bank). */
  tags: string[];
  /** Resume text the question is about, when there is one. */
  source?: string;
}

export const COMPETENCIES = ["ownership", "teamwork", "conflict", "failure", "deadline", "leadership", "learning", "impact", "customer", "ambiguity"] as const;

const BEHAVIOURAL: { tag: (typeof COMPETENCIES)[number]; q: string; hint: string; senior?: boolean }[] = [
  { tag: "impact", q: "Tell me about the achievement you're most proud of.", hint: "Pick a story with a measurable result and make your own part clear." },
  { tag: "ownership", q: "Describe a time you took ownership of a problem nobody had assigned to you.", hint: "Show what you noticed, why you acted, and what changed because of it." },
  { tag: "conflict", q: "Tell me about a disagreement with a teammate or stakeholder. How did you resolve it?", hint: "Stay respectful about the other person; focus on how you reached a decision." },
  { tag: "failure", q: "Tell me about a mistake you made or a project that didn't go to plan.", hint: "Own the mistake briefly, then spend most of the answer on what you changed afterwards." },
  { tag: "deadline", q: "Describe a time you had to deliver under a tight deadline.", hint: "Explain how you prioritised and what you chose not to do." },
  { tag: "learning", q: "Tell me about a time you had to learn a new tool or domain quickly.", hint: "Describe how you learned, and how soon you were productive." },
  { tag: "teamwork", q: "Give an example of working with another team to get something done.", hint: "Name the teams, the friction, and how you kept things moving." },
  { tag: "ambiguity", q: "Tell me about a time the requirements were unclear. What did you do?", hint: "Show how you clarified the goal before building." },
  { tag: "customer", q: "Describe a time you changed your approach based on user or customer feedback.", hint: "Make the feedback concrete and say what you shipped in response." },
  { tag: "leadership", q: "Tell me about a time you led or mentored others.", hint: "Focus on how you helped people grow or decide, not only on the outcome.", senior: true },
];

/** Tags inferred from a bullet's wording, used to file stories against behavioural questions. */
export function inferTags(text: string): string[] {
  const t = text.toLowerCase();
  const tags = new Set<string>();
  const rules: [RegExp, string][] = [
    [/\b(led|lead|mentor|mentored|coached|managed|hired|onboarded)\b/, "leadership"],
    [/\b(team|teams|cross-functional|collaborat|partnered|with (the )?(design|product|qa|ops|sales))/, "teamwork"],
    [/\b(customer|client|user|users|feedback|support|nps|csat)\b/, "customer"],
    [/\b(deadline|launch|launched|shipped|delivered|weeks?|days?)\b/, "deadline"],
    [/\b(learn|learned|learnt|new to|picked up|migrat|adopted|introduced)/, "learning"],
    [/\b(initiated|proposed|took ownership|owned|volunteered|identified|noticed)\b/, "ownership"],
    [/\b(incident|outage|bug|fix|fixed|root cause|postmortem|post-mortem|recovered)\b/, "failure"],
    [/\b(conflict|disagree|negotiat|aligned|consensus|pushback)\b/, "conflict"],
    [/\b(unclear|ambigu|scoped|discovery|research|prototype|prototyped)\b/, "ambiguity"],
  ];
  for (const [re, tag] of rules) if (re.test(t)) tags.add(tag);
  if (extractNumbers(text).length) tags.add("impact");
  return [...tags];
}

const RESULT_RE = /,?\s*\b(resulting in|which (reduced|increased|improved|cut|saved|grew|led to)|leading to|reducing|increasing|improving|cutting|saving|growing|boosting|lowering|raising|achieving|so that)\b/i;
const PURPOSE_RE = /\s+\b(to (enable|support|help|allow|let|reduce|improve|handle|replace|automate|speed up|make)\b.*)$/i;

const GERUND_PAST: Record<string, string> = {
  reducing: "reduced", increasing: "increased", improving: "improved", cutting: "cut", saving: "saved", growing: "grew",
  boosting: "boosted", lowering: "lowered", raising: "raised", achieving: "achieved",
};

/** "cutting deploy time…" -> "This cut deploy time…"; "resulting in X" -> "This resulted in X". */
function resultSentence(part: string): string {
  const p = part.trim();
  if (!p) return "";
  const [first, ...rest] = p.split(/\s+/);
  const w = first.toLowerCase();
  if (GERUND_PAST[w]) return `This ${GERUND_PAST[w]} ${rest.join(" ")}`;
  if (w === "resulting" && rest[0] === "in") return `This resulted in ${rest.slice(1).join(" ")}`;
  if (w === "leading" && rest[0] === "to") return `This led to ${rest.slice(1).join(" ")}`;
  if (w === "which") return `This ${rest.join(" ")}`;
  if (w === "so" && rest[0] === "that") return rest.slice(1).join(" ");
  return p;
}

/**
 * A STAR skeleton from one bullet. Action and Result keep the user's words; Situation and
 * Task are left for the user (they're context a resume line doesn't hold), with prompts.
 */
export function storyFromBullet(bullet: string, where: string): Pick<StoryInput, "title" | "situation" | "task" | "action" | "result" | "tags" | "sourceText"> {
  const text = bullet.trim().replace(/\.$/, "");
  let actionPart = text;
  let resultPart = "";
  const m = RESULT_RE.exec(text);
  if (m && m.index > 10) {
    actionPart = text.slice(0, m.index).replace(/[,;]\s*$/, "");
    resultPart = text.slice(m.index).replace(/^,?\s*/, "");
  } else {
    // "…, 40% faster" style trailing outcome (a comma inside "40,000" isn't a clause break).
    const t = /,\s+([^,]*\d[^,]*)$/.exec(text);
    if (t && t.index > 10) {
      actionPart = text.slice(0, t.index);
      resultPart = t[1].trim();
    }
  }
  let task = "";
  const p = PURPOSE_RE.exec(actionPart);
  if (p) {
    task = `I needed ${p[1].trim()}.`;
    actionPart = actionPart.slice(0, p.index);
  }
  // A story is told about something that happened, so always past tense ("I improved"), even for a current role.
  const action = `${firstPerson(actionPart, false)}.`;
  const outcome = resultSentence(resultPart);
  const result = outcome ? `${outcome[0].toUpperCase()}${outcome.slice(1)}.` : "";
  const firstWords = text.split(/\s+/).slice(0, 7).join(" ");
  return {
    title: where ? `${firstWords}… (${where})` : `${firstWords}…`,
    situation: "",
    task,
    action,
    result,
    tags: inferTags(text),
    sourceText: bullet,
  };
}

/** Months between consecutive jobs that aren't covered by any role (ignores the first job's start). */
function employmentGaps(r: ResumeData, now = new Date()): { after: string; before: string; months: number }[] {
  const roles = r.experience
    .map((e) => ({ e, a: toMonthIndex(e.startDate), b: e.current ? nowMonthIndex(now) : toMonthIndex(e.endDate, true) }))
    .filter((x): x is { e: (typeof r.experience)[number]; a: number; b: number } => x.a !== null && x.b !== null)
    .sort((x, y) => x.a - y.a);
  const gaps: { after: string; before: string; months: number }[] = [];
  let reach = -Infinity;
  let last: (typeof roles)[number] | null = null;
  for (const x of roles) {
    if (last && x.a - reach > 6) gaps.push({ after: last.e.company || last.e.title, before: x.e.company || x.e.title, months: x.a - reach - 1 });
    if (x.b > reach) {
      reach = x.b;
      last = x;
    }
  }
  return gaps;
}

export function interviewQuestions(r: ResumeData, job: JobAnalysis | null, opts: { company?: string; role?: string; now?: Date } = {}): PrepQuestion[] {
  const out: PrepQuestion[] = [];
  const now = opts.now ?? new Date();
  const years = totalExperienceYears(r.experience, now);
  const company = opts.company?.trim();
  const role = opts.role?.trim() || job?.titleGuess || r.contact.headline;
  let n = 0;
  const id = (k: string) => `${k}-${++n}`;

  // Motivation: almost always asked.
  out.push({
    id: id("m"),
    kind: "motivation",
    question: "Tell me about yourself.",
    why: "Most interviews open with it.",
    hint: `Two minutes: what you do now${years >= 1 ? ` (about ${Math.floor(years)} years of experience)` : ""}, one or two results you're proud of, and why this role is the next step.`,
    tags: [],
  });
  if (job || company)
    out.push({
      id: id("m"),
      kind: "motivation",
      question: company ? `Why do you want to work at ${company}?` : `Why are you interested in this ${role ? `${role} ` : ""}role?`,
      why: "Interviewers check that you've read the posting and know the company.",
      hint: "Connect two things from the posting to work you've already done; avoid generic praise.",
      tags: [],
    });

  // Technical: from the posting's skills, framed by how well the resume evidences each one.
  if (job) {
    const match = matchResume(r, job, now);
    const ranked = match.skills.filter((s) => s.importance !== "preferred").sort((a, b) => b.weight - a.weight).slice(0, 8);
    for (const s of ranked) {
      if (s.status === "strong") {
        const ev = s.evidence[0];
        out.push({
          id: id("t"),
          kind: "technical",
          question: `Walk me through how you used ${s.name}${ev ? ` (${ev.loc.label})` : ""}. What decisions did you make, and what would you do differently?`,
          why: `The posting lists ${s.jobWording} as ${s.importance === "essential" ? "a requirement" : "part of the role"}, and your resume shows it in use.`,
          hint: "Expect follow-up depth questions: trade-offs, scale, failure cases. Be specific about your part versus the team's.",
          tags: [],
          source: ev?.text,
        });
      } else if (s.status === "listed") {
        out.push({
          id: id("t"),
          kind: "technical",
          question: `You list ${s.resumeWording ?? s.name}. Can you give a concrete example of using it?`,
          why: `${s.name} is in the posting, but your resume only lists it without an example.`,
          hint: "Prepare one real example; if your experience is light, say so and describe what you did build with it.",
          tags: [],
        });
      } else {
        out.push({
          id: id("g"),
          kind: "gap",
          question: `This role uses ${s.jobWording}. What's your experience with it?`,
          why: `${s.name} is in the posting${s.importance === "essential" ? " as a requirement" : ""}, and it isn't on your resume.`,
          hint: s.related.length
            ? `Be honest about your exposure. You can point to related experience (${s.related.slice(0, 3).join(", ")}) and how you'd ramp up. Don't claim experience you don't have.`
            : "Be honest about your exposure and describe how you'd get up to speed. Don't claim experience you don't have.",
          tags: ["learning"],
        });
      }
    }
    if (match.experience.met === false && match.experience.requiredYears)
      out.push({
        id: id("g"),
        kind: "gap",
        question: `The posting asks for ${match.experience.requiredYears}+ years. How does your experience make up for that?`,
        why: `Your dated experience comes to about ${match.experience.resumeYears} years.`,
        hint: "Focus on scope and results rather than arguing about the number.",
        tags: ["impact"],
      });
  }

  // Resume-based: claims with numbers get verified; every bullet's numbers are fair game.
  for (const ev of relevantEvidence(r, job, 6).filter((e) => extractNumbers(e.text).length).slice(0, 3))
    out.push({
      id: id("r"),
      kind: "resume",
      question: `You wrote: "${ev.text.replace(/\.$/, "")}". How did you measure that, and what exactly was your part?`,
      why: "Interviewers often probe the numbers on a resume.",
      hint: "Know the baseline, how it was measured, the time frame, and who else was involved.",
      tags: ["impact"],
      source: ev.text,
    });
  for (const g of employmentGaps(r, now))
    out.push({
      id: id("g"),
      kind: "gap",
      question: `What were you doing between ${g.after} and ${g.before}?`,
      why: `There are about ${g.months} months between those roles on your resume.`,
      hint: "One or two calm sentences are enough: what you did, and why you're ready now.",
      tags: [],
    });

  // Behavioural: standard competencies, plus leadership for senior candidates or roles.
  const senior = years >= 6 || /\b(senior|lead|principal|staff|manager|head)\b/i.test(role ?? "");
  for (const b of BEHAVIOURAL)
    if (!b.senior || senior)
      out.push({ id: id("b"), kind: "behavioural", question: b.q, why: "A common behavioural question; answer with a STAR story.", hint: b.hint, tags: [b.tag] });

  out.push({
    id: id("m"),
    kind: "motivation",
    question: "What questions do you have for us?",
    why: "Asked at the end of nearly every interview.",
    hint: "Prepare two or three about the team's current challenges, how success is measured in this role, and next steps.",
    tags: [],
  });
  return out;
}

/** Bullets worth turning into stories: strongest first, with their inferred tags. */
export function storyCandidates(r: ResumeData, job: JobAnalysis | null, n = 8) {
  return relevantEvidence(r, job, 40)
    .filter((e) => analyzeBullet(e.text).wordCount >= 6)
    .slice(0, n)
    .map((e) => ({ text: e.text, where: e.where, current: e.current, tags: inferTags(e.text) }));
}
