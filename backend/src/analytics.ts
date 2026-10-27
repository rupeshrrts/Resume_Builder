import { createHash, randomBytes } from "node:crypto";
import { recordEvent } from "@/db/repo-admin";
import { log } from "@/log";

/**
 * Privacy-friendly usage statistics for the owner's dashboard. On in production; ANALYTICS=off turns
 * it off, ANALYTICS=on turns it on elsewhere (so local testing doesn't fill the live numbers).
 */
export function analyticsOn(): boolean {
  const flag = process.env.ANALYTICS?.trim().toLowerCase();
  if (flag === "off") return false;
  return flag === "on" || process.env.NODE_ENV === "production";
}

// Without a configured secret, a random one per process: unique-visitor counts then reset on restart.
const fallbackSalt = randomBytes(16).toString("hex");

/** Same person, same day → same value; can't be reversed to an IP or linked across days. */
export function visitorHash(ip: string, userAgent: string, day = new Date().toISOString().slice(0, 10)): string {
  const salt = process.env.ANALYTICS_SALT || process.env.PROXY_SECRET || fallbackSalt;
  return createHash("sha256").update(`${day}|${ip}|${userAgent}|${salt}`).digest("hex").slice(0, 16);
}

export function deviceOf(userAgent: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(userAgent)) return "mobile";
  return "desktop";
}

export function isBot(userAgent: string): boolean {
  return !userAgent || /bot|crawl|spider|slurp|preview|fetch|monitor|lighthouse|headless|curl|wget|python|axios|node-fetch|go-http/i.test(userAgent);
}

/**
 * Stored path: query strings dropped, and ids or share tokens replaced, so nothing private or
 * identifying is kept (e.g. /resumes/3f2a… → /resumes/[id], /r/<token> → /r/[link]).
 */
export function normalizePath(path: string): string | null {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) return null;
  let p = path.split(/[?#]/)[0].slice(0, 200);
  p = p.replace(/^\/r\/[^/]+/, "/r/[link]");
  p = p
    .split("/")
    .map((seg) => (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seg) || /^[A-Za-z0-9_-]{20,}$/.test(seg) ? "[id]" : seg))
    .join("/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

/** The referring site's host name, or "" for direct visits and links within this site. */
export function referrerHost(referrer: string, ownHosts: string[]): string {
  try {
    const host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
    if (!host || ownHosts.some((h) => h.replace(/^www\./, "") === host)) return "";
    return host.slice(0, 120);
  } catch {
    return "";
  }
}

/** Counts an action (signup, resume_created, download_pdf, ai_request…). Never fails the request. */
export function countEvent(name: string): void {
  if (!analyticsOn()) return;
  recordEvent(name).catch((err) => log.warn("event_record_failed", { name, err }));
}
