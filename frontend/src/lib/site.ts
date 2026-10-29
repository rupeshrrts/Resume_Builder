/**
 * Public address and wording used for search engines and link previews.
 * SITE_URL (set from DOMAIN by deploy/docker-compose.yml) overrides the address.
 */
export const SITE_URL = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://reesume.in").replace(/\/+$/, "");

export const SITE_NAME = "Free ATS Resume Builder";

/** Credit shown in the footer. With an empty `linkedin`, the name is shown without a link. */
export const DEVELOPER = { name: "Rupesh Kumar", linkedin: "https://www.linkedin.com/in/rupesh-kumar-508b1820a/" };

export const SITE_TITLE = "Free ATS Resume Builder – Make an ATS-Friendly Resume Online";

export const SITE_DESCRIPTION =
  "Create a free, ATS-friendly resume in minutes. Step-by-step builder, clean templates, an ATS score that explains every point, and the exact PDF or Word file you preview. Made for freshers and experienced professionals.";

export const SITE_KEYWORDS = [
  "resume builder",
  "free resume builder",
  "resume maker",
  "CV builder free",
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
