import type { ResumeData } from "./schema/resume";
import type { DocKind, DocTone } from "./schema/document";
import type { JobAnalysis } from "./analysis/jd";
import { IMPORTANCE_WEIGHT } from "./analysis/jd";
import { SKILLS, textHasSkill } from "./analysis/skills";
import { totalExperienceYears } from "./analysis/dates";
import { topSkills, toPastTense } from "./compose";
import { analyzeBullet } from "./analysis/bullets";
import { stripBold } from "./render/rich";

/**
 * Template-based drafts of cover letters, messages and LinkedIn text, built only from the
 * resume (and the job's wording for the role and company). Used when AI isn't configured,
 * and as a reliable starting point the user then edits.
 */

export interface LetterInput {
  resume: ResumeData;
  job: JobAnalysis | null;
  role: string;
  company: string;
  recipient: string;
  tone: DocTone;
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ").replace(/[.\s]+$/, "");
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

interface Evidence {
  text: string;
  /** Company name, or project name for project bullets. */
  where: string;
  project?: boolean;
  current: boolean;
  score: number;
}

/** Bullets ranked by how much of the job they evidence (falls back to bullets with numbers). */
export function relevantEvidence(r: ResumeData, job: JobAnalysis | null, n = 3): Evidence[] {
  const items: Evidence[] = [];
  for (const e of r.experience)
    for (const b of e.bullets) if (b.text.trim()) items.push({ text: stripBold(b.text), where: e.company || e.title, current: e.current, score: 0 });
  for (const p of r.projects) for (const b of p.bullets) if (b.text.trim()) items.push({ text: stripBold(b.text), where: p.name, project: true, current: false, score: 0 });
  for (const it of items) {
    if (job)
      for (const s of job.skills) {
        const def = SKILLS.find((d) => d.name === s.name);
        if (def && textHasSkill(it.text, def)) it.score += IMPORTANCE_WEIGHT[s.importance];
      }
    if (/\d/.test(it.text)) it.score += 1;
    // Prefer strong, achievement-style bullets over duty descriptions.
    const a = analyzeBullet(it.text);
    if (a.startsWithActionVerb || a.presentTenseVerb) it.score += 2;
    it.score -= a.weak.length * 2;
  }
  return items.sort((a, b) => b.score - a.score).slice(0, n);
}

/** "a Full-Stack Developer", "an Engineer", "a .NET Developer": job titles keep the user's capitalisation. */
function aOrAn(title: string): string {
  const t = title.trim();
  return `${/^[aeiou]/i.test(t) && !/^(uni|use|eu)/i.test(t) ? "an" : "a"} ${t}`;
}

/** "At Acme, " / "For my Expense Splitter project, " */
function evidenceLead(e: Evidence): string {
  if (!e.where) return "";
  return e.project ? `For my ${e.where} project, ` : `At ${e.where}, `;
}

/** Evidence as flowing sentences: each place is named once, later points use "also"/"In addition". */
function evidenceSentences(ev: Evidence[]): string {
  let prevWhere: string | null = null;
  return ev
    .map((e, i) => {
      const sameAsBefore = e.where === prevWhere;
      prevWhere = e.where;
      const clause = firstPerson(e.text, e.current);
      if (i === 0 || !sameAsBefore) return `${evidenceLead(e)}${clause}.`;
      return i === 1 ? `${clause.replace(/^I /, "I also ")}.` : `In addition, ${clause}.`;
    })
    .join(" ");
}

/** "Built X…" -> "I built X…" (keeps the user's words; only tense and person change). */
export function firstPerson(bullet: string, current: boolean): string {
  const text = clean(current ? bullet : toPastTense(bullet));
  // Duty-style openers aren't verbs: "Responsible for X" -> "I was responsible for X".
  if (/^(responsible for|involved in|part of|in charge of|accountable for)\b/i.test(text)) return `I ${current ? "am" : "was"} ${lowerFirst(text)}`;
  return `I ${lowerFirst(text)}`;
}

function profile(r: ResumeData, role: string, job: JobAnalysis | null) {
  const years = Math.floor(totalExperienceYears(r.experience));
  const jobSkillNames = new Set(job?.skills.filter((s) => s.importance !== "preferred").map((s) => s.name) ?? []);
  const mine = topSkills(r, 10).map((s) => s.name);
  const overlap = mine.filter((s) => jobSkillNames.has(s));
  const skills = (overlap.length >= 2 ? overlap : mine).slice(0, 3);
  const headline = clean(r.contact.headline) || role || "professional";
  return { years, skills, headline };
}

export function composeDocument(kind: DocKind, input: LetterInput): { title: string; body: string } {
  const r = input.resume;
  const name = clean(r.contact.fullName) || "[Your name]";
  const role = clean(input.role) || clean(r.contact.headline) || "this role";
  const company = clean(input.company);
  const at = company ? ` at ${company}` : "";
  const { years, skills, headline } = profile(r, role, input.job);
  const exp = years >= 1 ? `${years}+ years of experience` : "hands-on experience";
  const skillText = skills.length ? ` in ${joinList(skills)}` : "";
  const evidence = relevantEvidence(r, input.job, 3);
  const greeting = input.recipient.trim() ? `Dear ${clean(input.recipient)},` : "Dear Hiring Manager,";

  switch (kind) {
    case "cover_letter": {
      const opening =
        input.tone === "warm"
          ? `I was excited to see the ${role} opening${at}. As ${aOrAn(headline)} with ${exp}${skillText}, I'd love to bring that experience to your team.`
          : input.tone === "concise"
            ? `I'm applying for the ${role} role${at}. I'm ${aOrAn(headline)} with ${exp}${skillText}.`
            : `I am writing to apply for the ${role} position${at}. I am ${aOrAn(headline)} with ${exp}${skillText}.`;
      const ev = evidence.slice(0, input.tone === "concise" ? 2 : 3);
      const middle = evidenceSentences(ev);
      const fit = skills.length && input.job ? `The role's focus on ${joinList(skills)} matches the work I've been doing, and I'm keen to keep growing in it.` : "";
      const close =
        input.tone === "concise"
          ? `I'd welcome a conversation about the role. Thank you for your time.`
          : `I would welcome the opportunity to discuss how I can contribute${company ? ` to ${company}` : ""}. Thank you for your time and consideration.`;
      const sign = input.tone === "warm" ? "Kind regards," : "Sincerely,";
      return {
        title: `Cover letter – ${[role, company].filter(Boolean).join(", ")}`,
        body: [greeting, "", opening, "", middle, fit ? `\n${fit}` : "", "", close, "", sign, name].filter((x, i, a) => !(x === "" && a[i - 1] === "")).join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      };
    }
    case "recruiter_message": {
      const hi = input.recipient.trim() ? `Hi ${clean(input.recipient).split(" ")[0]},` : "Hi,";
      const top = evidence[0];
      const body = [
        hi,
        `I saw the ${role} opening${at} and wanted to reach out. I'm ${aOrAn(headline)} with ${exp}${skillText}.`,
        top ? `Recently, ${lowerFirst(firstPerson(top.text, top.current))}.` : "",
        "Would you be open to a short conversation? Happy to share my resume.",
        `Thanks, ${name.split(" ")[0]}`,
      ]
        .filter(Boolean)
        .join("\n\n");
      return { title: `Message – ${[role, company].filter(Boolean).join(", ")}`, body };
    }
    case "application_email": {
      const body = [
        `Subject: Application for ${role}${company ? ` – ${name}` : ""}`,
        "",
        greeting,
        "",
        `Please find attached my resume for the ${role} position${at}. I'm ${aOrAn(headline)} with ${exp}${skillText}.`,
        evidence[0] ? `\n${evidenceLead(evidence[0])}${firstPerson(evidence[0].text, evidence[0].current)}.` : "",
        "",
        "I'd be glad to discuss how my experience fits the role.",
        "",
        "Best regards,",
        name,
        [r.contact.phone, r.contact.email].filter(Boolean).join(" · "),
      ]
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return { title: `Email – ${[role, company].filter(Boolean).join(", ")}`, body };
    }
    case "linkedin_headline": {
      const parts = [clean(r.contact.headline) || role, skills.length ? skills.join(" · ") : "", r.contact.location ? clean(r.contact.location).split(",")[0] : ""].filter(Boolean);
      return { title: "LinkedIn headline", body: parts.join(" | ").slice(0, 220) };
    }
    case "linkedin_about": {
      const summary = clean(r.summary.text);
      const highlights = relevantEvidence(r, input.job, 3).map((e) => `• ${clean(toPastTense(e.text))}`);
      // The user's own skill wording, most job-relevant first.
      const allSkills = r.skills.flatMap((g) => g.items).filter(Boolean).slice(0, 10);
      const body = [
        summary ? `${summary}.` : `${headline} with ${exp}${skillText}.`,
        highlights.length ? `\nSome things I've done:\n${highlights.join("\n")}` : "",
        allSkills.length ? `\nSkills: ${allSkills.join(" · ")}` : "",
        role ? `\nOpen to ${role} opportunities.` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return { title: "LinkedIn About", body: body.slice(0, 2600) };
    }
  }
}
