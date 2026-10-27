import type { ResumeData, ResumeKind, ResumeSettings, TemplateId } from "../schema/resume";
import type { Job } from "../schema/job";
import type { AtsResult, LayoutSignals } from "../analysis/ats";

/** Shapes exchanged between the backend API and the frontend. */

export interface SessionUser {
  id: string;
  email: string;
  /** Given at sign-up; empty for accounts created before name and mobile were asked for. */
  fullName: string;
  phone: string;
  /** True once the user has clicked the link sent to their email address. */
  emailVerified: boolean;
  /** Site owner: an ADMIN_EMAILS address that has been verified. */
  isAdmin: boolean;
}

/** A user's own review of the site. */
export interface MyReview {
  rating: number;
  comment: string;
  updatedAt: string;
}

/** A review as the owner sees it. */
export interface AdminReview {
  id: string;
  rating: number;
  comment: string;
  featured: boolean;
  name: string;
  email: string;
  updatedAt: string;
}

/** A review shown on the homepage: first name only. */
export interface PublicReview {
  rating: number;
  comment: string;
  name: string;
}

/** Everything the owner's dashboard shows. Counts only; visitors are never identifiable. */
export interface AdminStats {
  generatedAt: string;
  analyticsOn: boolean;
  emailOn: boolean;
  /** The period the period-based numbers cover: last 7 days, last 30 days, or all time. */
  range: "7" | "30" | "all";
  totals: {
    users: number;
    verifiedUsers: number;
    resumes: number;
    tailored: number;
    jobs: number;
    usersLast7: number;
    usersLast30: number;
    /** Sign-ups in the chosen period. */
    newUsers: number;
    /** Users who created or edited a resume in the chosen period. */
    activeUsers: number;
    /** Of the sign-ups in the chosen period: how many have built a resume, and how many haven't. */
    signedUpWithResume: number;
    signedUpWithoutResume: number;
  };
  reviews: {
    count: number;
    /** 0 when there are no reviews. */
    average: number;
    /** Number of reviews with 1, 2, 3, 4 and 5 stars. */
    distribution: [number, number, number, number, number];
    items: AdminReview[];
  };
  /** In the chosen period; visitors are counted once per day. */
  traffic: { views: number; visitors: number; viewsToday: number; visitorsToday: number };
  /** Oldest first: one point per day (7 or 30 days), or per month (last 12 months) for all time. */
  series: {
    granularity: "day" | "month";
    /** key is YYYY-MM-DD for days, YYYY-MM for months. */
    points: { key: string; views: number; visitors: number; signups: number; downloads: number }[];
  };
  topPages: { path: string; views: number }[];
  topReferrers: { source: string; views: number }[];
  devices: { device: "mobile" | "tablet" | "desktop"; views: number }[];
  /** Totals per action in the chosen period, e.g. signup, resume_created, download_pdf, ai_request. */
  events: Record<string, number>;
  recentUsers: { email: string; fullName: string; phone: string; joined: string; verified: boolean; resumes: number }[];
  earnings: {
    totalPaise: number;
    monthPaise: number;
    /** Received in the chosen period. */
    rangePaise: number;
    /** Number of payments in the chosen period. */
    payments: number;
    recent: { amountPaise: number; currency: string; source: string; reference: string; at: string }[];
  };
}

export interface ResumeSummary {
  id: string;
  name: string;
  kind: ResumeKind;
  parentId: string | null;
  jobId: string | null;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface ResumeRecord extends ResumeSummary {
  data: ResumeData;
  settings: ResumeSettings;
}

export interface VersionSummary {
  id: string;
  revision: number;
  note: string;
  createdAt: number;
}

export interface AiStatus {
  available: boolean;
  model: string | null;
}

export interface ResumeScore {
  overall: number;
  match: number | null;
  ats: number;
  name: string;
  headline: string;
  template: TemplateId;
}

export interface DashboardPayload {
  user: SessionUser;
  resumes: ResumeSummary[];
  jobs: Job[];
  scores: Record<string, ResumeScore>;
  ai: AiStatus;
}

export interface EditorPayload {
  resume: ResumeRecord;
  parentName: string | null;
  jobs: Job[];
  ai: AiStatus;
}

export interface ExportCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ExportValidation {
  format: "pdf" | "docx";
  ok: boolean;
  pages: number | null;
  coverage: number;
  missing: string[];
  checks: ExportCheck[];
  extractedText: string;
}

export interface ImportResponse {
  method: "standard" | "ai";
  fileName: string;
  /** layout is null for LinkedIn data exports, which have no document layout. */
  extraction: { format: "pdf" | "docx" | "linkedin"; layout: LayoutSignals | null; text: string; warnings: string[] };
  structured: { data: ResumeData; warnings: string[]; skipped: { title: string; lines: string[] }[]; unplaced: string[]; dropped: string[] };
  ats: AtsResult;
  notes: string[];
}
