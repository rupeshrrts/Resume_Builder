import { z } from "zod";
import { callStructured, tag } from "./client";
import { guardText, presentInSource, squashForGuard, type GuardResult } from "./guard";
import { ResumeData, emptyResume, newId, PartialDate, type ResumeSettings } from "@resume/shared/schema/resume";
import { collectText } from "@resume/shared/analysis/text";
import type { DocKind, DocTone } from "@resume/shared/schema/document";

// ---------- helpers ----------

const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: "string" };
const strArr = { type: "array", items: str };

const STYLE_GUIDE: Record<ResumeSettings["writingStyle"], string> = {
  conservative: "Conservative: plain, factual, closest to the original wording. No added emphasis.",
  balanced: "Balanced: clear action verb, specific contribution, and the result if the material states one.",
  achievement: "Achievement-focused: lead with the outcome or impact the material supports, then how it was achieved. Still no invented figures.",
};

/** A compact plain-text view of the resume to give the model context. */
export function resumeAsContext(r: ResumeData): string {
  const lines: string[] = [];
  const c = r.contact;
  lines.push(`Name: ${c.fullName}`, `Headline: ${c.headline}`);
  if (r.summary.text) lines.push(`Summary: ${r.summary.text}`);
  for (const e of r.experience) {
    lines.push(`Role: ${e.title} | ${e.company} | ${e.startDate || "?"} to ${e.current ? "present" : e.endDate || "?"}${e.employmentType ? ` | ${e.employmentType}` : ""}`);
    for (const b of e.bullets) if (b.text) lines.push(`  - ${b.text}`);
  }
  for (const p of r.projects) {
    lines.push(`Project: ${p.name}${p.technologies.length ? ` | Technologies: ${p.technologies.join(", ")}` : ""}`);
    for (const b of p.bullets) if (b.text) lines.push(`  - ${b.text}`);
  }
  for (const e of r.education) lines.push(`Education: ${e.degree} ${e.field} | ${e.institution} | ${e.endDate}${e.grade ? ` | ${e.grade}` : ""}`);
  for (const g of r.skills) if (g.items.length) lines.push(`Skills${g.category ? ` (${g.category})` : ""}: ${g.items.join(", ")}`);
  for (const ce of r.certifications) lines.push(`Certification: ${ce.name}${ce.issuer ? `, ${ce.issuer}` : ""}`);
  for (const a of r.additional) for (const b of a.bullets) lines.push(`${a.title}: ${b.text}`);
  return lines.join("\n");
}

// ---------- bullet rewrite ----------

const BulletOut = z.object({
  alternatives: z
    .array(z.object({ style: z.enum(["conservative", "balanced", "achievement"]), text: z.string().min(3).max(400), why: z.string().max(400) }))
    .min(1)
    .max(3),
  questions: z.array(z.string().max(300)).max(4),
  already_strong: z.boolean(),
});

export interface BulletSuggestion {
  style: "conservative" | "balanced" | "achievement";
  text: string;
  why: string;
  guard: GuardResult;
}

export async function rewriteBullet(input: {
  bullet: string;
  context: string;
  siblings: string[];
  resume: ResumeData;
  jobTerms: string[];
  preferredStyle: ResumeSettings["writingStyle"];
  facts: string;
}): Promise<{ alternatives: BulletSuggestion[]; questions: string[]; alreadyStrong: boolean }> {
  const out = await callStructured({
    task: "rewrite_bullet",
    system: `Rewrite one resume bullet point. Return three alternatives, one per style:
- ${STYLE_GUIDE.conservative}
- ${STYLE_GUIDE.balanced}
- ${STYLE_GUIDE.achievement}
Each alternative: one sentence, 12-30 words, starts with a strong past-tense verb (present tense if the role is current), no first-person pronouns, no trailing period unless the original had one.
In "why", explain in one plain sentence what makes it stronger than the original.
The candidate's preferred style is ${input.preferredStyle}.
If the job terms list contains a skill the candidate demonstrably used in this bullet's context, you may use the job's wording for it. Never add a job term the material doesn't show.
In "questions", ask for specific missing facts (numbers, scale, outcome, tools) that would make the bullet stronger. Ask nothing if the bullet already has them.
Set already_strong to true if the original needs no real change.`,
    user: [
      tag("resume_data", `Bullet to rewrite: ${input.bullet}\nContext: ${input.context}\nOther bullets in this entry:\n${input.siblings.map((s) => `- ${s}`).join("\n") || "(none)"}`),
      input.facts.trim() ? tag("candidate_facts", input.facts.trim()) : "",
      input.jobTerms.length ? `Job terms (for wording only): ${input.jobTerms.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: obj({
      alternatives: { type: "array", items: obj({ style: { type: "string", enum: ["conservative", "balanced", "achievement"] }, text: str, why: str }) },
      questions: strArr,
      already_strong: { type: "boolean" },
    }),
    validate: BulletOut,
    maxTokens: 4000,
  });
  // Sources the rewrite may draw on: the bullet, its entry, the candidate's own facts, and their listed skills.
  const sources = [input.bullet, input.context, ...input.siblings, input.facts, input.resume.skills.flatMap((g) => g.items).join(", ")];
  return {
    alternatives: out.alternatives.map((a) => ({ ...a, text: a.text.trim(), guard: guardText(a.text, sources) })),
    questions: out.questions,
    alreadyStrong: out.already_strong,
  };
}

// ---------- bullets from free-form notes (guided builder) ----------

const NotesOut = z.object({
  // The builder keeps whatever the user pasted as one point, so exactly one bullet comes back.
  bullets: z.array(z.object({ text: z.string().min(3).max(400) })).length(1),
  questions: z.array(z.string().max(300)).max(4),
});

export async function bulletsFromNotes(input: {
  notes: string;
  context: string;
  current: boolean;
  style: ResumeSettings["writingStyle"];
}): Promise<{ bullets: { text: string; guard: GuardResult }[]; questions: string[] }> {
  const out = await callStructured({
    task: "bullets_from_notes",
    system: `Turn the candidate's rough notes into exactly ONE resume bullet point. Never split the notes into several bullets, even if they span several lines or sentences.
- One bullet, at most 45 words, starting with a strong ${input.current ? "present-tense" : "past-tense"} verb. No first-person pronouns. Keep every distinct fact the notes give.
- Use only what the notes say. Keep every number, tool and name exactly as written; add none.
- Style: ${STYLE_GUIDE[input.style]}
- If an important detail is missing (scale, outcome, tools), ask for it in "questions" instead of guessing.`,
    user: [tag("resume_data", `Context: ${input.context}`), tag("candidate_facts", input.notes)].join("\n\n"),
    schema: obj({ bullets: { type: "array", items: obj({ text: str }) }, questions: strArr }),
    validate: NotesOut,
    maxTokens: 4000,
  });
  return {
    bullets: out.bullets.map((b) => ({ text: b.text.trim(), guard: guardText(b.text, [input.notes, input.context]) })),
    questions: out.questions,
  };
}

// ---------- cover letters, messages, LinkedIn text ----------

const DOC_BRIEF: Record<DocKind, string> = {
  cover_letter: `A cover letter of 250-380 words: greeting (use the recipient's name if given, else "Dear Hiring Manager,"), an opening naming the role and company, one or two paragraphs citing 2-3 specific achievements from the resume that match the job, a short close, then "Sincerely," and the candidate's name.`,
  recruiter_message: "A LinkedIn or email message to a recruiter, under 550 characters: who the candidate is, one concrete achievement, and a polite ask for a short conversation.",
  application_email: `An email to send with the resume attached, under 1,500 characters, starting with a line "Subject: ..." then a blank line and the body. Mention the role, one or two relevant achievements, and a sign-off with the candidate's name, phone and email.`,
  linkedin_headline: "A LinkedIn headline under 220 characters, one line, e.g. role | core skills | focus area. No emojis, no buzzwords like 'passionate' or 'ninja'.",
  linkedin_about: "A LinkedIn About section under 2,400 characters, first person, short paragraphs: who they are and what they do, 3 achievements as • bullets, key skills, what they're looking for.",
};

const DocOut = z.object({ title: z.string().max(160), body: z.string().min(10).max(12000), questions: z.array(z.string().max(300)).max(4) });

export async function generateDocument(input: {
  kind: DocKind;
  resume: ResumeData;
  jobDescription: string;
  role: string;
  company: string;
  recipient: string;
  tone: DocTone;
  facts: string;
}): Promise<{ title: string; body: string; questions: string[]; guard: GuardResult }> {
  const out = await callStructured({
    task: `doc_${input.kind}`,
    system: `Write ${DOC_BRIEF[input.kind]}
Tone: ${input.tone === "warm" ? "warm and personable, still professional" : input.tone === "concise" ? "direct and brief" : "professional and confident"}.
Use only achievements, numbers, skills and employers that appear in the resume or the candidate's notes. Do not claim skills from the job description that the resume doesn't show; if the candidate lacks a requirement, leave it out rather than implying it.
Write naturally, no clichés ("I am writing to express my keen interest", "team player", "passionate"). In "questions", ask for facts that would make it stronger (e.g. why this company).`,
    user: [
      tag("resume_data", resumeAsContext(input.resume)),
      input.jobDescription.trim() ? tag("job_description", input.jobDescription.slice(0, 20000)) : "",
      `Role: ${input.role || "(not given)"}\nCompany: ${input.company || "(not given)"}\nRecipient: ${input.recipient || "(not given)"}`,
      input.facts.trim() ? tag("candidate_facts", input.facts.trim()) : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: obj({ title: str, body: str, questions: strArr }),
    validate: DocOut,
    maxTokens: 6000,
  });
  // Facts may come from the resume, the candidate's notes, and (for names only) the role/company/recipient.
  const guard = guardText(out.body, [resumeAsContext(input.resume), input.facts, input.role, input.company, input.recipient]);
  return { ...out, body: out.body.trim(), guard };
}

// ---------- STAR interview stories ----------

const StarOut = z.object({
  situation: z.string().max(1200),
  task: z.string().max(1200),
  action: z.string().max(2000),
  result: z.string().max(1200),
  questions: z.array(z.string().max(300)).max(4),
});

export async function draftStar(input: { bullet: string; context: string; notes: string }): Promise<{
  situation: string;
  task: string;
  action: string;
  result: string;
  questions: string[];
  guard: GuardResult;
}> {
  const out = await callStructured({
    task: "star_story",
    system: `Draft a spoken STAR interview answer (Situation, Task, Action, Result) from one resume bullet and the candidate's notes.
- First person, natural spoken English, 1-3 sentences per part.
- Use only facts in the bullet, its context and the notes. Keep every number, tool and name exactly; add none.
- If the material doesn't say something (the situation, the result), leave that part "" and ask for it in "questions" instead of guessing.
- Action should make the candidate's own part clear ("I", not "we").`,
    user: [tag("resume_data", `Bullet: ${input.bullet}\nContext: ${input.context}`), input.notes.trim() ? tag("candidate_facts", input.notes.trim()) : ""].filter(Boolean).join("\n\n"),
    schema: obj({ situation: str, task: str, action: str, result: str, questions: strArr }),
    validate: StarOut,
    maxTokens: 3000,
  });
  const all = [out.situation, out.task, out.action, out.result].join("\n");
  return { ...out, guard: guardText(all, [input.bullet, input.context, input.notes]) };
}

// ---------- summary ----------

const SummaryOut = z.object({ text: z.string().min(20).max(900), why: z.string().max(500), questions: z.array(z.string().max(300)).max(4) });

export async function generateSummary(input: {
  resume: ResumeData;
  targetRole: string;
  jobFocus: string[];
  style: ResumeSettings["writingStyle"];
  facts: string;
}): Promise<{ text: string; why: string; questions: string[]; guard: GuardResult }> {
  const out = await callStructured({
    task: "summary",
    system: `Write a professional summary for the top of this resume: 2-4 sentences, 40-80 words, third person without pronouns (start with the role or a noun phrase, not "I").
Cover: target role and experience level (only years that the dates support), strongest relevant skills that the resume shows in use, and one notable result if the resume states one.
Style: ${STYLE_GUIDE[input.style]}
${input.targetRole ? `Target role: ${input.targetRole}.` : ""}
${input.jobFocus.length ? `The target job emphasises: ${input.jobFocus.join(", ")}. Mention these only where the resume shows them.` : ""}
In "why", explain briefly what the summary emphasises and why. In "questions", ask for missing facts that would improve it.`,
    user: [tag("resume_data", resumeAsContext(input.resume)), input.facts.trim() ? tag("candidate_facts", input.facts.trim()) : ""].filter(Boolean).join("\n\n"),
    schema: obj({ text: str, why: str, questions: strArr }),
    validate: SummaryOut,
    maxTokens: 3000,
  });
  return { ...out, text: out.text.trim(), guard: guardText(out.text, [resumeAsContext(input.resume), input.facts, input.targetRole]) };
}

// ---------- AI-assisted import ----------

const ImportOut = z.object({
  contact: z.object({ fullName: z.string(), headline: z.string(), email: z.string(), phone: z.string(), location: z.string(), links: z.array(z.object({ label: z.string(), url: z.string() })) }),
  summary: z.string(),
  experience: z.array(
    z.object({ title: z.string(), company: z.string(), location: z.string(), employmentType: z.string(), startDate: z.string(), endDate: z.string(), current: z.boolean(), bullets: z.array(z.string()) }),
  ),
  education: z.array(z.object({ degree: z.string(), field: z.string(), institution: z.string(), location: z.string(), startDate: z.string(), endDate: z.string(), grade: z.string(), details: z.array(z.string()) })),
  projects: z.array(z.object({ name: z.string(), role: z.string(), url: z.string(), technologies: z.array(z.string()), startDate: z.string(), endDate: z.string(), bullets: z.array(z.string()) })),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string(), date: z.string(), url: z.string() })),
  additional: z.array(z.object({ title: z.string(), items: z.array(z.string()) })),
  skipped_personal: z.array(z.string()),
});

const S = str;
const IMPORT_SCHEMA = obj({
  contact: obj({ fullName: S, headline: S, email: S, phone: S, location: S, links: { type: "array", items: obj({ label: S, url: S }) } }),
  summary: S,
  experience: { type: "array", items: obj({ title: S, company: S, location: S, employmentType: S, startDate: S, endDate: S, current: { type: "boolean" }, bullets: strArr }) },
  education: { type: "array", items: obj({ degree: S, field: S, institution: S, location: S, startDate: S, endDate: S, grade: S, details: strArr }) },
  projects: { type: "array", items: obj({ name: S, role: S, url: S, technologies: strArr, startDate: S, endDate: S, bullets: strArr }) },
  skills: { type: "array", items: obj({ category: S, items: strArr }) },
  certifications: { type: "array", items: obj({ name: S, issuer: S, date: S, url: S }) },
  additional: { type: "array", items: obj({ title: S, items: strArr }) },
  skipped_personal: strArr,
});

const dateOrEmpty = (d: string) => (PartialDate.safeParse(d.trim()).success ? d.trim() : "");

/**
 * Asks Claude to organise extracted text into sections, then verifies every value against
 * the document: anything not found in the source text is dropped and reported.
 */
export async function aiStructure(text: string): Promise<{ data: ResumeData; dropped: string[]; skippedPersonal: string[] }> {
  const out = await callStructured({
    task: "import_structure",
    system: `Organise the resume text into the JSON structure. This is extraction only:
- Copy text exactly as written (fix only broken line wraps and stray bullet symbols). Do not rephrase, summarise, correct or improve anything.
- Use "" or [] for anything that isn't in the text. Never fill gaps with guesses.
- Dates: convert to "YYYY-MM" when month and year are given, "YYYY" when only the year is given, "" if absent. Set current=true for "Present"/"Till date" and leave endDate "".
- Put internships in experience with employmentType "Internship".
- Do NOT copy personal details (date of birth, marital status, gender, religion, father's name, nationality, ID numbers, declarations, full street address). List the labels you skipped in skipped_personal.
- For location, keep only city/state/country.`,
    user: tag("document_text", text.slice(0, 40000)),
    schema: IMPORT_SCHEMA,
    validate: ImportOut,
    maxTokens: 16000,
  });

  const src = squashForGuard(text);
  const dropped: string[] = [];
  const keep = (v: string, label: string) => {
    if (presentInSource(v, src)) return v.trim();
    dropped.push(`${label}: “${v.slice(0, 80)}”`);
    return "";
  };
  const keepList = (vs: string[], label: string) => vs.map((v) => keep(v, label)).filter(Boolean);
  const bullets = (vs: string[], label: string) => keepList(vs, label).map((t) => ({ id: newId("b"), text: t, origin: "imported" as const }));

  const d = emptyResume();
  d.contact = {
    fullName: keep(out.contact.fullName, "Name"),
    headline: keep(out.contact.headline, "Headline"),
    email: keep(out.contact.email, "Email"),
    phone: keep(out.contact.phone, "Phone"),
    location: keep(out.contact.location, "Location"),
    links: out.contact.links.filter((l) => presentInSource(l.url.replace(/^https?:\/\//, ""), src)).slice(0, 6).map((l) => ({ id: newId("l"), label: l.label.slice(0, 60), url: l.url })),
  };
  d.summary = { text: keep(out.summary, "Summary"), origin: "imported" };
  d.experience = out.experience.map((e) => ({
    id: newId("exp"),
    title: keep(e.title, "Job title"),
    company: keep(e.company, "Company"),
    location: keep(e.location, "Location"),
    employmentType: e.employmentType.slice(0, 40),
    startDate: dateOrEmpty(e.startDate),
    endDate: e.current ? "" : dateOrEmpty(e.endDate),
    current: e.current,
    bullets: bullets(e.bullets, "Experience bullet"),
  }));
  d.education = out.education.map((e) => ({
    id: newId("edu"),
    degree: keep(e.degree, "Degree"),
    field: keep(e.field, "Field"),
    institution: keep(e.institution, "Institution"),
    location: keep(e.location, "Location"),
    startDate: dateOrEmpty(e.startDate),
    endDate: dateOrEmpty(e.endDate),
    grade: keep(e.grade, "Grade"),
    bullets: bullets(e.details, "Education detail"),
  }));
  d.projects = out.projects.map((p) => ({
    id: newId("prj"),
    name: keep(p.name, "Project"),
    role: keep(p.role, "Project role"),
    url: keep(p.url, "Project URL"),
    technologies: keepList(p.technologies, "Technology"),
    startDate: dateOrEmpty(p.startDate),
    endDate: dateOrEmpty(p.endDate),
    bullets: bullets(p.bullets, "Project bullet"),
  }));
  d.skills = out.skills.map((g) => ({ id: newId("sk"), category: g.category.slice(0, 80), items: keepList(g.items, "Skill") })).filter((g) => g.items.length);
  d.certifications = out.certifications.map((c) => ({ id: newId("cert"), name: keep(c.name, "Certification"), issuer: keep(c.issuer, "Issuer"), date: dateOrEmpty(c.date), url: keep(c.url, "URL") })).filter((c) => c.name);
  d.additional = out.additional.map((a) => ({ id: newId("add"), title: a.title.slice(0, 60), bullets: bullets(a.items, a.title || "Additional") })).filter((a) => a.bullets.length);
  return { data: ResumeData.parse(d), dropped, skippedPersonal: out.skipped_personal.slice(0, 20) };
}

/** Skills the resume demonstrably has that the job also asks for, used as wording hints. */
export function overlappingJobTerms(resume: ResumeData, jobSkills: { name: string; wording: string }[]): string[] {
  const text = collectText(resume).map((t) => t.text.toLowerCase()).join("\n");
  return jobSkills.filter((s) => text.includes(s.name.toLowerCase()) || text.includes(s.wording.toLowerCase())).map((s) => s.wording).slice(0, 20);
}
