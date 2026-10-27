import { z } from "zod";

export const DocKind = z.enum(["cover_letter", "recruiter_message", "application_email", "linkedin_headline", "linkedin_about"]);
export type DocKind = z.infer<typeof DocKind>;

export const DOC_KINDS: Record<DocKind, { label: string; limit: number; hint: string }> = {
  cover_letter: { label: "Cover letter", limit: 4000, hint: "250–400 words: why this role, two pieces of evidence, a short close." },
  recruiter_message: { label: "Recruiter message", limit: 600, hint: "LinkedIn connection notes allow about 300 characters; InMail and email can be longer." },
  application_email: { label: "Application email", limit: 2000, hint: "A short email to send with your resume attached." },
  linkedin_headline: { label: "LinkedIn headline", limit: 220, hint: "LinkedIn allows 220 characters." },
  linkedin_about: { label: "LinkedIn About", limit: 2600, hint: "LinkedIn allows 2,600 characters. The first 2–3 lines show before “see more”." },
};

export const DocTone = z.enum(["professional", "warm", "concise"]);
export type DocTone = z.infer<typeof DocTone>;

export const DocumentInput = z.object({
  kind: DocKind,
  title: z.string().trim().max(160).default(""),
  body: z.string().max(12000).default(""),
  origin: z.enum(["user", "template", "ai"]).default("user"),
  resumeId: z.string().max(60).nullable().default(null),
  jobId: z.string().max(60).nullable().default(null),
});
export type DocumentInput = z.infer<typeof DocumentInput>;

export interface AppDocument extends DocumentInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}
