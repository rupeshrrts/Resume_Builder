import { z } from "zod";

/** A STAR interview story grounded in one of the user's resume bullets. */
export const StoryInput = z.object({
  resumeId: z.string().max(60).nullable().default(null),
  sourceText: z.string().max(600).default(""),
  title: z.string().trim().max(160).default(""),
  situation: z.string().max(2000).default(""),
  task: z.string().max(2000).default(""),
  action: z.string().max(3000).default(""),
  result: z.string().max(2000).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
});
export type StoryInput = z.infer<typeof StoryInput>;
export interface Story extends StoryInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export const ShareInput = z.object({
  password: z.string().max(200).default(""),
  /** Days until the link expires; 0 = never. */
  expiresInDays: z.number().int().min(0).max(365).default(30),
});
export interface ShareLink {
  id: string;
  resumeId: string;
  hasPassword: boolean;
  expiresAt: number | null;
  revoked: boolean;
  views: number;
  lastViewedAt: number | null;
  createdAt: number;
}
