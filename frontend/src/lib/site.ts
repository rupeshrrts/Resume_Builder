/**
 * Public address and wording used for search engines and link previews.
 * SITE_URL (set on Vercel) overrides the address, e.g. while testing on a .vercel.app link.
 */
export const SITE_URL = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://freeatsresume.in").replace(/\/+$/, "");

export const SITE_NAME = "Free ATS Resume Builder";

export const SITE_TITLE = "Free ATS Resume Builder – Make an ATS-Friendly Resume Online";

export const SITE_DESCRIPTION =
  "Create a free, ATS-friendly resume in minutes. Step-by-step builder, clean templates, an ATS score that explains every point, and the exact PDF or Word file you preview. Made for freshers and experienced professionals.";

export const SITE_KEYWORDS = [
  "free resume builder",
  "ATS resume builder",
  "ATS friendly resume",
  "ATS resume checker",
  "resume score",
  "CV maker",
  "resume for freshers",
  "software engineer resume",
  "resume PDF download",
  "online resume maker India",
];
