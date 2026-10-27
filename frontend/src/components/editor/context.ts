"use client";

import { createContext, useContext } from "react";
import type { ResumeData, ResumeSettings } from "@resume/shared/schema/resume";

export interface EditorCtx {
  ai: { available: boolean; model: string | null };
  jobId: string | null;
  style: ResumeSettings["writingStyle"];
  mode: "beginner" | "advanced";
  /** Latest resume data (for AI requests that need full context). */
  getData: () => ResumeData;
  /** Bullet whose AI assistant should be open (set from the score panel). */
  assistTarget: string | null;
  setAssistTarget: (id: string | null) => void;
}

export const EditorContext = createContext<EditorCtx | null>(null);

export function useEditor(): EditorCtx {
  const c = useContext(EditorContext);
  if (!c) throw new Error("EditorContext missing");
  return c;
}
