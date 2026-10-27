import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Served at /robots.txt. Private and per-user pages stay out of search engines. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/resumes/", "/wizard", "/account", "/applications", "/interview", "/import", "/login", "/r/", "/admin", "/reset-password", "/verify-email"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
