import type { MetadataRoute } from "next";
import { GUIDES } from "@/content/guides";
import { SITE_URL } from "@/lib/site";

/** Public pages only; everything behind sign-in is left out (see robots.ts). Served at /sitemap.xml. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/register`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/guides`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...GUIDES.map((g) => ({ url: `${SITE_URL}/guides/${g.slug}`, lastModified: new Date(g.updated), changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
