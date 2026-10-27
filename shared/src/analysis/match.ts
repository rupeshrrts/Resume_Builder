import type { ResumeData } from "../schema/resume";
import { IMPORTANCE_WEIGHT, educationLevel, type Importance, type JobAnalysis } from "./jd";
import { SKILLS, findSkills, textHasSkill, type SkillDef } from "./skills";
import { collectText, stem, words, type TextLocation } from "./text";
import { totalExperienceYears } from "./dates";

/**
 * Job-match scoring. Every number here is derived from documented rules (see SCORING_RULES)
 * so users can see exactly why a score was given. This is an estimate of how well the resume
 * evidences the posting's requirements, not a prediction of any employer's ATS or decision.
 */

export type EvidenceStatus = "strong" | "listed" | "missing";

export const EVIDENCE_FACTOR: Record<EvidenceStatus, number> = { strong: 1, listed: 0.5, missing: 0 };

export const MATCH_COMPONENT_WEIGHTS = { skills: 0.65, keyphrases: 0.1, experience: 0.15, education: 0.1 } as const;

export const SCORING_RULES = [
  "Skills (65%): each skill found in the posting is weighted by importance (essential ×3, responsibility or unlabelled ×2, preferred ×1). It earns full credit when your experience or project bullets show it in use, half credit when it only appears in your skills list or summary, and none when it's missing.",
  "Key phrases (10%): recurring phrases from the posting's requirement lines (not skills) that appear in your resume.",
  "Experience (15%): your total dated experience (overlaps counted once, internships excluded) against the posting's minimum years. Left out if the posting states no minimum.",
  "Education (10%): your highest detected degree level against the posting's minimum. Left out if the posting states none.",
  "Components that don't apply are left out and the remaining weights are rescaled to 100%.",
];

export interface Evidence {
  text: string;
  loc: TextLocation;
}

export interface SkillMatch {
  name: string;
  category: string;
  importance: Importance;
  weight: number;
  status: EvidenceStatus;
  jobWording: string;
  resumeWording: string | null;
  evidence: Evidence[];
  /** Skills on the resume in the same family (transferable, not equivalent). */
  related: string[];
}

export interface MatchComponent {
  key: keyof typeof MATCH_COMPONENT_WEIGHTS;
  label: string;
  weight: number;
  score: number | null;
  detail: string;
}

export interface MatchResult {
  score: number;
  components: MatchComponent[];
  skills: SkillMatch[];
  keyphrases: { phrase: string; found: boolean; where: string | null }[];
  experience: { requiredYears: number | null; resumeYears: number; met: boolean | null; text: string | null };
  education: { required: string | null; resume: string | null; met: boolean | null };
  terminology: { skill: string; resumeTerm: string; jobTerm: string }[];
  recommendations: { priority: "high" | "medium" | "low"; text: string }[];
}

function findDef(name: string): SkillDef | undefined {
  return SKILLS.find((s) => s.name === name);
}

export function resumeSkillNames(r: ResumeData): Set<string> {
  const all = collectText(r).map((t) => t.text).join("\n");
  return new Set(findSkills(all).map((h) => h.skill.name));
}

export function matchResume(resume: ResumeData, job: JobAnalysis, now = new Date()): MatchResult {
  const fragments = collectText(resume);
  const onResume = resumeSkillNames(resume);

  const skills: SkillMatch[] = job.skills.map((js) => {
    const def = findDef(js.name)!;
    const evidence: Evidence[] = [];
    let listedOnly: Evidence[] = [];
    let resumeWording: string | null = null;
    for (const f of fragments) {
      const hit = textHasSkill(f.text, def);
      if (!hit) continue;
      resumeWording ??= hit;
      (f.evidence ? evidence : listedOnly).push({ text: f.text, loc: f.loc });
    }
    const status: EvidenceStatus = evidence.length ? "strong" : listedOnly.length ? "listed" : "missing";
    if (status === "listed") listedOnly = listedOnly.slice(0, 3);
    const related =
      status === "missing" && def.family
        ? SKILLS.filter((s) => s.family === def.family && s.name !== def.name && onResume.has(s.name)).map((s) => s.name)
        : [];
    return {
      name: js.name,
      category: js.category,
      importance: js.importance,
      weight: IMPORTANCE_WEIGHT[js.importance],
      status,
      jobWording: js.wording,
      resumeWording,
      evidence: status === "strong" ? evidence.slice(0, 4) : listedOnly,
      related,
    };
  });

  // Skills component
  const totalW = skills.reduce((a, s) => a + s.weight, 0);
  const gotW = skills.reduce((a, s) => a + s.weight * EVIDENCE_FACTOR[s.status], 0);
  const skillScore = totalW ? (gotW / totalW) * 100 : null;

  // Keyphrases: all stems of the phrase present in one resume fragment.
  const stemmedFragments = fragments.map((f) => ({ f, stems: new Set(words(f.text).map(stem)) }));
  const keyphrases = job.keyphrases.map((k) => {
    const ks = words(k.phrase).map(stem);
    const hit = stemmedFragments.find((x) => ks.every((s) => x.stems.has(s)));
    return { phrase: k.phrase, found: !!hit, where: hit ? hit.f.loc.label : null };
  });
  const kpScore = keyphrases.length ? (keyphrases.filter((k) => k.found).length / keyphrases.length) * 100 : null;

  // Experience
  const resumeYears = totalExperienceYears(resume.experience, now);
  const reqYears = job.minYears;
  const expScore = reqYears ? Math.min(1, resumeYears / reqYears) * 100 : null;

  // Education
  let resumeEdu: { level: number; label: string } | null = null;
  for (const e of resume.education) {
    const lv = educationLevel(`${e.degree} ${e.field}`);
    if (lv && (!resumeEdu || lv.level > resumeEdu.level)) resumeEdu = lv;
  }
  const eduReq = job.education;
  const eduScore = eduReq ? (resumeEdu ? (resumeEdu.level >= eduReq.level ? 100 : 50) : 0) : null;

  const components: MatchComponent[] = [
    {
      key: "skills",
      label: "Skills evidence",
      weight: MATCH_COMPONENT_WEIGHTS.skills,
      score: skillScore,
      detail: skills.length
        ? `${skills.filter((s) => s.status === "strong").length} shown in your work, ${skills.filter((s) => s.status === "listed").length} only listed, ${skills.filter((s) => s.status === "missing").length} not found (of ${skills.length} skills in the posting).`
        : "No recognised skills in the posting.",
    },
    {
      key: "keyphrases",
      label: "Key phrases",
      weight: MATCH_COMPONENT_WEIGHTS.keyphrases,
      score: kpScore,
      detail: keyphrases.length ? `${keyphrases.filter((k) => k.found).length} of ${keyphrases.length} recurring phrases found.` : "No recurring phrases detected.",
    },
    {
      key: "experience",
      label: "Years of experience",
      weight: MATCH_COMPONENT_WEIGHTS.experience,
      score: expScore,
      detail: reqYears ? `Posting asks for ${reqYears}+ years; your dated experience totals about ${resumeYears} years.` : "Posting states no minimum.",
    },
    {
      key: "education",
      label: "Education level",
      weight: MATCH_COMPONENT_WEIGHTS.education,
      score: eduScore,
      detail: eduReq
        ? `Posting asks for ${eduReq.label}; detected on your resume: ${resumeEdu?.label ?? "none"}.`
        : "Posting states no minimum.",
    },
  ];
  const active = components.filter((c) => c.score !== null);
  const wSum = active.reduce((a, c) => a + c.weight, 0);
  const score = wSum ? Math.round(active.reduce((a, c) => a + (c.score as number) * c.weight, 0) / wSum) : 0;

  const terminology = skills
    // Only when the posting's exact term appears nowhere on the resume.
    .filter((s) => s.status !== "missing" && s.resumeWording && !fragments.some((f) => f.text.toLowerCase().includes(s.jobWording.toLowerCase())))
    .map((s) => ({ skill: s.name, resumeTerm: s.resumeWording!, jobTerm: s.jobWording }));

  const recommendations: MatchResult["recommendations"] = [];
  for (const s of skills.filter((x) => x.status === "missing" && x.importance === "essential")) {
    recommendations.push({
      priority: "high",
      text: s.related.length
        ? `“${s.name}” is required and not on your resume. You list related ${s.related.join(", ")}: describe that work clearly, and add ${s.name} only if you have actually used it.`
        : `“${s.name}” is required and not on your resume. Add it only if you have real experience; otherwise address the gap honestly (for example in a cover letter).`,
    });
  }
  for (const s of skills.filter((x) => x.status === "listed" && (x.importance === "essential" || x.importance === "responsibility"))) {
    recommendations.push({
      priority: "medium",
      text: `“${s.name}” appears only in your skills list. If you used it in a role or project, add a bullet that shows how.`,
    });
  }
  for (const t of terminology) {
    recommendations.push({
      priority: "low",
      text: `The posting says “${t.jobTerm}” and your resume says “${t.resumeTerm}”. If they mean the same thing in your work, using the posting's wording once helps keyword searches.`,
    });
  }
  if (reqYears && resumeYears < reqYears) {
    recommendations.push({
      priority: "medium",
      text: `The posting asks for ${reqYears}+ years and your dated experience is about ${resumeYears}. Check all roles have start and end dates; don't stretch dates to close the gap.`,
    });
  }

  return {
    score,
    components,
    skills,
    keyphrases,
    experience: { requiredYears: reqYears, resumeYears, met: reqYears ? resumeYears >= reqYears : null, text: job.yearsText },
    education: { required: eduReq?.label ?? null, resume: resumeEdu?.label ?? null, met: eduReq ? (resumeEdu?.level ?? 0) >= eduReq.level : null },
    terminology,
    recommendations,
  };
}
