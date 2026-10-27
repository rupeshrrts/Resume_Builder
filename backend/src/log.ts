/**
 * Minimal structured logger. Callers pass identifiers and error codes, never resume text,
 * job descriptions, emails or phone numbers. As a safety net, string values that look like
 * personal data are masked and long strings are truncated.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /\+?\d[\d\s().-]{7,}\d/g;

function scrub(v: unknown): unknown {
  if (typeof v === "string") {
    const s = v.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
    return s.length > 200 ? `${s.slice(0, 200)}…[truncated]` : s;
  }
  if (v instanceof Error) return { name: v.name, message: scrub(v.message) };
  if (Array.isArray(v)) return v.slice(0, 20).map(scrub);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 30).map(([k, x]) => [k, scrub(x)]));
  }
  return v;
}

function emit(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...(scrub(fields) as object) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) => emit("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit("error", event, fields),
};
