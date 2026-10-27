import type { ResumeSettings } from "../schema/resume";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_LABEL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const PRESENT_RE = /^(present|current|now|till date|to date|ongoing|today)$/i;

/**
 * Parses a free-text date as written on resumes into "YYYY-MM" / "YYYY".
 * Handles "Jan 2020", "January, 2020", "01/2020", "1/2020", "2020-01", "2020", "Sept '19".
 * Returns "" when the value cannot be interpreted.
 */
export function parseLooseDate(input: string): string {
  const s = input.trim().replace(/[,.]/g, " ").replace(/\s+/g, " ");
  if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\s*[/\-]\s*(\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^([A-Za-z]{3,9})\s*'?\s*(\d{4}|\d{2})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi >= 0) {
      const y = m[2].length === 2 ? (Number(m[2]) > 50 ? `19${m[2]}` : `20${m[2]}`) : m[2];
      return `${y}-${String(mi + 1).padStart(2, "0")}`;
    }
  }
  m = s.match(/^(\d{4})$/);
  if (m && +m[1] > 1950 && +m[1] < 2100) return m[1];
  return "";
}

/** Splits a range such as "Jan 2020 – Present" or "2018 - 2021". */
const RANGE_SEP = /\s*(?:–|—|\s-\s|\bto\b|\buntil\b|\btill\b)\s*|(?<=\d{4})\s*-\s*(?=\d{4}\b|\d{1,2}\/|[A-Za-z])/i;

export function parseDateRange(input: string): { start: string; end: string; current: boolean } | null {
  const parts = input
    .replace(/\b(till|to|up to) date\b/i, "Present")
    .split(RANGE_SEP)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const start = parseLooseDate(parts[0]);
  if (!start) return null;
  if (parts.length === 1) return { start, end: "", current: false };
  const rest = parts.slice(1).join(" ").trim();
  if (PRESENT_RE.test(rest) || /^(present|current|now|till date|to date)/i.test(rest)) return { start, end: "", current: true };
  const end = parseLooseDate(rest);
  return { start, end, current: false };
}

export function formatDate(d: string, fmt: ResumeSettings["dateFormat"]): string {
  if (!d) return "";
  const [y, mo] = d.split("-");
  if (!mo) return y;
  const mi = Number(mo) - 1;
  if (fmt === "MM/YYYY") return `${mo}/${y}`;
  if (fmt === "YYYY-MM") return `${y}-${mo}`;
  return `${MONTH_LABEL[mi]} ${y}`;
}

export function formatRange(start: string, end: string, current: boolean, fmt: ResumeSettings["dateFormat"]): string {
  const a = formatDate(start, fmt);
  const b = current ? "Present" : formatDate(end, fmt);
  if (a && b) return `${a} – ${b}`;
  return a || b;
}

/** Months since year 0; a bare year counts as January for starts and December for ends. */
export function toMonthIndex(d: string, asEnd = false): number | null {
  if (!d) return null;
  const [y, mo] = d.split("-").map(Number);
  return y * 12 + ((mo ?? (asEnd ? 12 : 1)) - 1);
}

export function nowMonthIndex(now = new Date()) {
  return now.getFullYear() * 12 + now.getMonth();
}

/** Total months covered by possibly-overlapping intervals (overlaps counted once). */
export function mergedMonths(intervals: [number, number][]): number {
  const sorted = intervals.filter(([a, b]) => b >= a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of sorted) {
    if (!cur || iv[0] > cur[1] + 1) {
      if (cur) total += cur[1] - cur[0] + 1;
      cur = [iv[0], iv[1]];
    } else cur[1] = Math.max(cur[1], iv[1]);
  }
  if (cur) total += cur[1] - cur[0] + 1;
  return total;
}

export function totalExperienceYears(
  roles: { startDate: string; endDate: string; current: boolean; employmentType?: string }[],
  now = new Date(),
): number {
  const ivs: [number, number][] = [];
  for (const r of roles) {
    if (/intern|volunt/i.test(r.employmentType ?? "")) continue;
    const a = toMonthIndex(r.startDate);
    const b = r.current ? nowMonthIndex(now) : toMonthIndex(r.endDate, true);
    if (a !== null && b !== null) ivs.push([a, b]);
  }
  return Math.round((mergedMonths(ivs) / 12) * 10) / 10;
}
