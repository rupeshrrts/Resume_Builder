import type { ResumeData, ResumeSettings } from "../schema/resume";
import { analyzeBullet, suspiciousClaims } from "./bullets";
import { checkAts, type AtsResult, type Issue, type LayoutSignals } from "./ats";
import { analyzeJob, type JobAnalysis } from "./jd";
import { matchResume, type MatchResult } from "./match";
import { findSkills, SKILL_LEVEL_LABEL } from "./skills";
import { allBullets, collectText, words, type TextLocation } from "./text";

/**
 * Resume quality score: six documented subscores, each with the reasons it was given and
 * the fixes that would raise it, ranked by estimated impact on the overall score.
 */

export type SubscoreKey = "relevance" | "skills" | "evidence" | "readability" | "ats" | "formatting";

export const SUBSCORE_WEIGHTS: Record<SubscoreKey, number> = {
  relevance: 0.25,
  skills: 0.15,
  evidence: 0.2,
  readability: 0.1,
  ats: 0.2,
  formatting: 0.1,
};

export const SUBSCORE_INFO: Record<SubscoreKey, { label: string; how: string }> = {
  relevance: { label: "Job relevance", how: "The job-match score for the selected job description. Left out when no job is selected." },
  skills: {
    label: "Skills coverage",
    how: "With a job: weighted share of the posting's skills that your resume evidences. Without one: 40% for listing at least 8 skills, 20% for grouping them into categories, 40% for the share of listed skills that also appear in your experience or project bullets.",
  },
  evidence: {
    label: "Experience evidence",
    how: "Average across bullets of four checks: starts with an action verb, includes a measurable detail, is 8–35 words long, and avoids generic or passive wording. Roles without bullets count as zero.",
  },
  readability: {
    label: "Readability",
    how: "Share of bullets of a readable length (40%), share without personal pronouns (20%), share without passive voice (20%), and a summary of 30–90 words (20%).",
  },
  ats: { label: "ATS compatibility", how: "100 minus penalties from the ATS check (critical 20, major 8, minor 3; each category capped at 40)." },
  formatting: {
    label: "Formatting",
    how: "Dated entries (35%), consistent bullet punctuation (20%), appropriate estimated length (25%), standard section headings (20%).",
  },
};

export interface Improvement {
  subscore: SubscoreKey;
  /** Estimated overall points gained if fixed. */
  impact: number;
  message: string;
  fix: string;
  loc?: TextLocation;
  /** Suggests the "Improve with AI" action is relevant here. */
  aiAssist?: boolean;
}

export interface Subscore {
  key: SubscoreKey;
  label: string;
  score: number | null;
  weight: number;
  how: string;
  reasons: string[];
}

export interface VerifyItem {
  text: string;
  reason: string;
  loc: TextLocation;
}

export interface QualityReport {
  overall: number;
  subscores: Subscore[];
  improvements: Improvement[];
  verify: VerifyItem[];
  ats: AtsResult;
  match: MatchResult | null;
  job: JobAnalysis | null;
  aiContentCount: number;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export function scoreResume(
  r: ResumeData,
  settings: ResumeSettings,
  opts: { jobDescription?: string | null; layout?: LayoutSignals | null; spelling?: Issue[]; now?: Date } = {},
): QualityReport {
  const ats = checkAts(r, settings, { layout: opts.layout, spelling: opts.spelling, now: opts.now });
  const job = opts.jobDescription && opts.jobDescription.trim().length > 40 ? analyzeJob(opts.jobDescription) : null;
  const match = job ? matchResume(r, job, opts.now) : null;
  const improvements: Improvement[] = [];
  const bullets = allBullets(r).filter((b) => b.text.trim());
  const analyses = bullets.map((b) => ({ b, a: analyzeBullet(b.text) }));

  // --- relevance ---
  const relevance: Subscore = {
    key: "relevance",
    label: SUBSCORE_INFO.relevance.label,
    score: match ? match.score : null,
    weight: SUBSCORE_WEIGHTS.relevance,
    how: SUBSCORE_INFO.relevance.how,
    reasons: match ? match.components.filter((c) => c.score !== null).map((c) => `${c.label}: ${Math.round(c.score!)} (${c.detail})`) : ["No job description selected."],
  };
  if (match) {
    for (const rec of match.recommendations.slice(0, 6))
      improvements.push({ subscore: "relevance", impact: rec.priority === "high" ? 6 : rec.priority === "medium" ? 3 : 1, message: rec.text, fix: rec.text });
  }

  // --- skills ---
  const listed = r.skills.flatMap((g) => g.items).filter(Boolean);
  const evidenceText = collectText(r).filter((t) => t.evidence).map((t) => t.text).join("\n");
  const evidenced = new Set(findSkills(evidenceText).map((h) => h.skill.name));
  const listedRecognised = findSkills(listed.join(", ")).map((h) => h.skill.name);
  const listedEvidenced = listedRecognised.filter((n) => evidenced.has(n));
  let skillsScore: number;
  const skillsReasons: string[] = [];
  if (match && match.skills.length) {
    skillsScore = Math.round(match.components.find((c) => c.key === "skills")!.score ?? 0);
    skillsReasons.push(match.components[0].detail);
  } else {
    const countPart = Math.min(1, listed.length / 8) * 40;
    const groupPart = r.skills.filter((g) => g.items.length).length >= 2 || (r.skills[0]?.category ?? "") !== "" ? 20 : 0;
    const evidPart = listedRecognised.length ? (listedEvidenced.length / listedRecognised.length) * 40 : 0;
    skillsScore = Math.round(countPart + groupPart + evidPart);
    skillsReasons.push(`${listed.length} skills listed${listed.length < 8 ? " (fewer than 8)" : ""}.`);
    skillsReasons.push(groupPart ? "Skills are grouped into categories." : "Skills aren't grouped into categories.");
    if (listedRecognised.length)
      skillsReasons.push(`${listedEvidenced.length} of ${listedRecognised.length} recognised skills are also shown in your experience or projects.`);
    const unevidenced = listedRecognised.filter((n) => !evidenced.has(n));
    if (unevidenced.length)
      improvements.push({
        subscore: "skills",
        impact: Math.round(((unevidenced.length / Math.max(1, listedRecognised.length)) * 40 * SUBSCORE_WEIGHTS.skills) / 2) || 1,
        message: `Listed but not shown in your work: ${unevidenced.slice(0, 6).join(", ")}${unevidenced.length > 6 ? "…" : ""}.`,
        fix: "Where true, mention these in a bullet that shows how you used them. Remove any you can't discuss in an interview.",
      });
  }

  // --- evidence ---
  const rolesWithoutBullets = r.experience.filter((e) => !e.bullets.some((b) => b.text.trim())).length;
  const units = analyses.map((x) => x.a.strength).concat(Array(rolesWithoutBullets).fill(0));
  const evidenceScore = units.length ? Math.round((units.reduce((a, b) => a + b, 0) / units.length) * 100) : 0;
  const noVerb = analyses.filter((x) => !x.a.startsWithActionVerb && !x.a.presentTenseVerb).length;
  const noMetric = analyses.filter((x) => !x.a.hasMetric).length;
  const evidenceReasons = [
    `${bullets.length} bullets analysed.`,
    `${pct(bullets.length - noVerb, bullets.length)}% start with an action verb.`,
    `${pct(bullets.length - noMetric, bullets.length)}% include a measurable detail.`,
  ];
  if (rolesWithoutBullets) evidenceReasons.push(`${rolesWithoutBullets} role(s) have no bullets.`);
  // Bullets with the most room to improve, each worth roughly its share of the subscore.
  const perBullet = units.length ? (100 / units.length) * SUBSCORE_WEIGHTS.evidence : 0;
  for (const { b, a } of analyses.filter((x) => x.a.strength < 0.75).sort((x, y) => x.a.strength - y.a.strength).slice(0, 8)) {
    improvements.push({
      subscore: "evidence",
      impact: Math.max(1, Math.round((1 - a.strength) * perBullet)),
      message: `“${b.text.length > 90 ? b.text.slice(0, 90) + "…" : b.text}”`,
      fix: a.issues.slice(0, 2).join(" "),
      loc: b.loc,
      aiAssist: true,
    });
  }
  for (const e of r.experience.filter((x) => !x.bullets.some((b) => b.text.trim())))
    improvements.push({
      subscore: "evidence",
      impact: Math.max(1, Math.round(perBullet)),
      message: `“${e.title || e.company || "A role"}” has no bullets.`,
      fix: "Add 2–5 bullets describing what you did and what changed as a result.",
      loc: { section: "experience", entryId: e.id, label: e.title || e.company },
    });

  // --- readability ---
  const okLen = analyses.filter((x) => x.a.wordCount >= 8 && x.a.wordCount <= 35).length;
  const noPronoun = analyses.filter((x) => !x.a.pronoun).length;
  const active = analyses.filter((x) => !x.a.passive).length;
  // The summary is optional: without one (empty or hidden), readability is scored on bullets alone.
  const hasSummary = !!r.summary.text.trim() && !settings.hiddenSections.includes("summary");
  const sumWords = words(r.summary.text).length;
  const summaryOk = sumWords >= 30 && sumWords <= 90;
  const n = analyses.length || 1;
  const bulletPart = (okLen / n) * 40 + (noPronoun / n) * 20 + (active / n) * 20;
  const readability = Math.round(hasSummary ? bulletPart + (summaryOk ? 20 : 0) : (bulletPart * 100) / 80);
  const readReasons = [
    `${pct(okLen, analyses.length)}% of bullets are 8–35 words.`,
    `${pct(analyses.length - noPronoun, analyses.length)}% use personal pronouns.`,
    `${pct(analyses.length - active, analyses.length)}% use passive voice.`,
    hasSummary ? `Summary is ${sumWords} words${summaryOk ? "" : " (aim for 30–90)"}.` : "No summary (optional, not scored).",
  ];
  if (hasSummary && !summaryOk)
    improvements.push({
      subscore: "readability",
      impact: Math.round(20 * SUBSCORE_WEIGHTS.readability),
      message: `Summary is ${sumWords} words.`,
      fix: "Write 2–4 lines (30–90 words): your role, years of experience, strongest relevant skills and one notable result.",
      loc: { section: "summary", label: "Summary" },
      aiAssist: true,
    });

  // --- formatting ---
  const dated = r.experience.filter((e) => e.startDate && (e.current || e.endDate)).length + r.education.filter((e) => e.endDate || e.startDate).length;
  const datable = r.experience.length + r.education.length;
  const punctIssue = ats.issues.some((i) => i.message.startsWith("Bullet punctuation"));
  const lengthIssue = ats.issues.some((i) => i.category === "length" && i.severity !== "info");
  const headingIssue = ats.issues.some((i) => i.message.includes("isn't a standard heading"));
  // An empty resume has nothing to format; it shouldn't score well here.
  const hasContent = datable > 0 || bullets.length > 0;
  const formatting = hasContent
    ? Math.round((datable ? (dated / datable) * 35 : 0) + (punctIssue ? 0 : 20) + (lengthIssue ? 0 : 25) + (headingIssue ? 10 : 20))
    : 0;
  const fmtReasons = [
    datable ? `${dated} of ${datable} entries are fully dated.` : "No dated experience or education entries yet.",
    punctIssue ? "Bullet punctuation is inconsistent." : "Bullet punctuation is consistent.",
    `Estimated length: ${ats.estimatedPages} page(s).`,
    headingIssue ? "Some section headings are non-standard." : "Section headings are standard.",
  ];

  // ATS issues become improvements too.
  for (const i of ats.issues.filter((x) => x.severity !== "info")) {
    improvements.push({
      subscore: i.category === "length" ? "formatting" : "ats",
      impact: Math.max(1, Math.round(((i.severity === "critical" ? 20 : i.severity === "major" ? 8 : 3) * SUBSCORE_WEIGHTS.ats))),
      message: i.message,
      fix: i.fix,
      loc: i.loc,
    });
  }

  const subscores: Subscore[] = [
    relevance,
    { key: "skills", label: SUBSCORE_INFO.skills.label, score: skillsScore, weight: SUBSCORE_WEIGHTS.skills, how: SUBSCORE_INFO.skills.how, reasons: skillsReasons },
    { key: "evidence", label: SUBSCORE_INFO.evidence.label, score: evidenceScore, weight: SUBSCORE_WEIGHTS.evidence, how: SUBSCORE_INFO.evidence.how, reasons: evidenceReasons },
    { key: "readability", label: SUBSCORE_INFO.readability.label, score: readability, weight: SUBSCORE_WEIGHTS.readability, how: SUBSCORE_INFO.readability.how, reasons: readReasons },
    { key: "ats", label: SUBSCORE_INFO.ats.label, score: ats.score, weight: SUBSCORE_WEIGHTS.ats, how: SUBSCORE_INFO.ats.how, reasons: [`${ats.issues.filter((i) => i.severity !== "info").length} issue(s) found.`, ...ats.passed] },
    { key: "formatting", label: SUBSCORE_INFO.formatting.label, score: formatting, weight: SUBSCORE_WEIGHTS.formatting, how: SUBSCORE_INFO.formatting.how, reasons: fmtReasons },
  ];
  const activeScores = subscores.filter((s) => s.score !== null);
  const wsum = activeScores.reduce((a, s) => a + s.weight, 0);
  const overall = Math.round(activeScores.reduce((a, s) => a + s.score! * s.weight, 0) / wsum);
  // Rescale impacts when relevance is excluded so they still reflect overall points.
  const scale = 1 / wsum;
  for (const imp of improvements) imp.impact = Math.max(1, Math.round(imp.impact * scale));
  improvements.sort((a, b) => b.impact - a.impact);

  // --- verify: claims and labels the user should double-check ---
  const verify: VerifyItem[] = [];
  for (const b of bullets) for (const reason of suspiciousClaims(b.text)) verify.push({ text: b.text, reason, loc: b.loc });
  for (const reason of suspiciousClaims(r.summary.text)) verify.push({ text: r.summary.text, reason, loc: { section: "summary", label: "Summary" } });
  for (const g of r.skills)
    for (const item of g.items)
      if (SKILL_LEVEL_LABEL.test(item))
        verify.push({ text: item, reason: "Proficiency label or rating. Make sure you can back it up, or remove the label.", loc: { section: "skills", entryId: g.id, label: g.category || "Skills" } });

  const aiContentCount = bullets.filter((b) => b.origin === "ai").length + (r.summary.origin === "ai" ? 1 : 0);

  return { overall, subscores, improvements, verify, ats, match, job, aiContentCount };
}
