import { z } from "zod";

export const JobStatus = z.enum(["saved", "applied", "interviewing", "offer", "rejected", "withdrawn"]);
export type JobStatus = z.infer<typeof JobStatus>;

const isoDate = z.string().max(10).regex(/^$|^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const JobInput = z.object({
  title: z.string().trim().max(160).default(""),
  company: z.string().trim().max(160).default(""),
  location: z.string().trim().max(120).default(""),
  url: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https?:\/\//i.test(v), "URL must start with http:// or https://")
    .default(""),
  description: z.string().max(30000).default(""),
  status: JobStatus.default("saved"),
  appliedAt: isoDate.default(""),
  /** Next follow-up reminder (YYYY-MM-DD) or "". */
  followUpOn: isoDate.default(""),
  /** Order within its Kanban column (lower first). */
  boardPosition: z.number().int().min(0).max(1_000_000).default(0),
  notes: z.string().max(5000).default(""),
});
export type JobInput = z.infer<typeof JobInput>;

export interface Job extends JobInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export const ContactInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  role: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).default(""),
  link: z.string().trim().max(300).default(""),
  notes: z.string().max(4000).default(""),
});
export type ContactInput = z.infer<typeof ContactInput>;
export interface JobContact extends ContactInput {
  id: string;
  jobId: string;
  createdAt: number;
}

export const EventKind = z.enum(["note", "interview", "follow_up", "offer", "rejection"]);
export type EventKind = z.infer<typeof EventKind>;
export const EventInput = z.object({
  kind: EventKind.default("note"),
  title: z.string().trim().max(160).default(""),
  body: z.string().max(8000).default(""),
  happensOn: isoDate.default(""),
});
export type EventInput = z.infer<typeof EventInput>;
export interface JobEvent extends EventInput {
  id: string;
  jobId: string;
  createdAt: number;
}
