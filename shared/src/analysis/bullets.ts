import { words, wordCount } from "./text";

/** Strong past-tense action verbs, grouped so suggestions can vary. */
export const ACTION_VERBS = new Set(
  `accelerated achieved administered advised analysed analyzed architected assembled assessed audited authored automated balanced benchmarked boosted budgeted built calculated calibrated captured championed coached collaborated commissioned compiled completed composed computed conceived conducted configured consolidated constructed consulted containerized contributed converted coordinated corrected created cultivated curated cut debugged decreased defined delivered deployed designed detected developed devised diagnosed directed discovered documented doubled drafted drove edited eliminated enabled engineered enhanced established evaluated executed expanded expedited facilitated fixed forecasted formulated founded generated grew guided halved handled hired identified implemented improved increased influenced initiated inspected installed instituted instrumented integrated interviewed introduced investigated launched led leveraged maintained managed mapped maximized measured mentored merged migrated minimized modeled modelled modernized monitored motivated negotiated onboarded operated optimized orchestrated organized overhauled oversaw owned partnered performed piloted pioneered planned prepared presented prioritized processed produced profiled programmed promoted proposed prototyped provisioned published raised rebuilt reconciled recruited redesigned reduced refactored remediated reorganized replaced reported researched resolved restructured revamped reviewed revised rolled saved scaled scheduled secured selected served shipped simplified slashed solved spearheaded standardized streamlined strengthened structured supervised supported surveyed sustained synthesized taught tested trained transformed translated tripled troubleshot troubleshooted tuned unified upgraded validated verified won wrote`.split(
    /\s+/,
  ),
);

/** Present-tense forms that should usually be past tense for previous roles. */
export const PRESENT_TO_PAST: Record<string, string> = {
  develop: "developed", manage: "managed", lead: "led", build: "built", design: "designed", create: "created",
  implement: "implemented", maintain: "maintained", handle: "handled", coordinate: "coordinated", analyze: "analyzed",
  analyse: "analysed", deploy: "deployed", write: "wrote", test: "tested", support: "supported", work: "worked",
  prepare: "prepared", conduct: "conducted", ensure: "ensured", monitor: "monitored", train: "trained", improve: "improved",
  optimize: "optimized", automate: "automated", migrate: "migrated", oversee: "oversaw", drive: "drove", own: "owned",
  plan: "planned", review: "reviewed", collaborate: "collaborated", deliver: "delivered", resolve: "resolved", teach: "taught",
};

/** Phrases that describe duties rather than contributions, or say little. */
export const WEAK_PHRASES: { re: RegExp; label: string; tip: string }[] = [
  { re: /\bresponsible for\b/i, label: "“responsible for”", tip: "Say what you did and what changed, e.g. “Managed…”, “Built…”." },
  { re: /\b(worked on|working on)\b/i, label: "“worked on”", tip: "Name your specific contribution (designed, built, fixed, tested…)." },
  { re: /\b(helped|assisted)( (with|in|to))?\b/i, label: "“helped/assisted”", tip: "Describe your own part of the work directly." },
  { re: /\b(involved in|participated in|part of)\b/i, label: "“involved in”", tip: "State your role and output in the effort." },
  { re: /\bduties (included|include)\b/i, label: "“duties included”", tip: "Lead with an action and an outcome instead of a duty list." },
  { re: /\b(various|several|multiple|many) (tasks|things|projects|activities)\b/i, label: "vague quantity", tip: "Name the most important item, or give the real count." },
  { re: /\betc\.?\b/i, label: "“etc.”", tip: "List the items that matter and drop “etc.”." },
  { re: /\b(hard[- ]?working|team player|go[- ]getter|self[- ]starter|results[- ]driven|detail[- ]oriented|passionate|dynamic|synergy|think outside the box|go-to person|fast learner|quick learner)\b/i, label: "generic trait", tip: "Show the trait through a concrete example instead of claiming it." },
];

const METRIC_RE = /(\d[\d,.]*\s*(%|percent|x\b|k\b|m\b|cr\b|crore|lakh|lakhs|million|billion|hours?|hrs?|days?|weeks?|months?|users?|customers?|clients?|people|members|engineers|students|requests|transactions|ms\b|seconds?|minutes?|tb|gb|mb)|[$₹€£]\s*\d|\b\d{2,}\b|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozen|hundreds?|thousands?)\b)/i;

const PASSIVE_RE = /\b(was|were|been|being|is|are)\s+(\w+ed|built|done|made|led|run|written|given|taken|seen)\b/i;
const PRONOUN_RE = /\b(I|me|my|we|our|us)\b/;

export interface BulletAnalysis {
  wordCount: number;
  firstWord: string;
  startsWithActionVerb: boolean;
  presentTenseVerb: string | null;
  hasMetric: boolean;
  passive: boolean;
  pronoun: boolean;
  weak: { label: string; tip: string }[];
  /** 0..1, share of the four evidence criteria met. */
  strength: number;
  issues: string[];
}

export function analyzeBullet(text: string): BulletAnalysis {
  const w = words(text);
  const first = (w[0] ?? "").toLowerCase();
  const wc = wordCount(text);
  const startsWithActionVerb = ACTION_VERBS.has(first);
  const presentTenseVerb = PRESENT_TO_PAST[first] ? first : first.endsWith("s") && PRESENT_TO_PAST[first.slice(0, -1)] ? first : null;
  const hasMetric = METRIC_RE.test(text);
  const passive = PASSIVE_RE.test(text);
  const pronoun = PRONOUN_RE.test(text);
  const weak = WEAK_PHRASES.filter((p) => p.re.test(text)).map(({ label, tip }) => ({ label, tip }));
  const goodLength = wc >= 8 && wc <= 35;
  const issues: string[] = [];
  if (!startsWithActionVerb && !presentTenseVerb) issues.push("Start with a strong action verb (e.g. Built, Reduced, Led).");
  if (!hasMetric) issues.push("No measurable detail. Add a real number (scale, time, count, %) if you have one.");
  if (wc < 8) issues.push("Very short. Add what you did, how, and the result.");
  if (wc > 35) issues.push("Long. Split it or trim to the essential action and result.");
  for (const x of weak) issues.push(`${x.label}: ${x.tip}`);
  if (passive) issues.push("Passive voice hides who did the work. Use an active verb.");
  if (pronoun) issues.push("Drop personal pronouns (I, my, we) in bullets.");
  const strength =
    (Number(startsWithActionVerb || !!presentTenseVerb) + Number(hasMetric) + Number(goodLength) + Number(weak.length === 0 && !passive)) / 4;
  return { wordCount: wc, firstWord: first, startsWithActionVerb, presentTenseVerb, hasMetric, passive, pronoun, weak, strength, issues };
}

/** All numbers in a text, normalised, used by the AI fact guard. */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d[\d,]*(\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

/** Claims that should be double-checked by the user. */
export function suspiciousClaims(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(\d[\d,.]*)\s*%/g)) {
    const v = Number(m[1].replace(/,/g, ""));
    if (v > 100 && !/\b(growth|increase|increased|grew|up)\b/i.test(text)) out.push(`${m[0]} is over 100%. Check the figure and what it measures.`);
    if (v >= 300) out.push(`${m[0]} is an unusually large change. Make sure you can explain how it was measured.`);
  }
  if (/\b(best|world[- ]class|top[- ]notch|unparalleled|revolutionary|single[- ]handedly|guaranteed)\b/i.test(text))
    out.push("Superlatives such as “best” or “world-class” are hard to verify. Replace with evidence.");
  if (/\b(expert|guru|ninja|master)\b/i.test(text)) out.push("Self-assigned titles like “expert” invite scrutiny. Show depth through outcomes instead.");
  if (/\b(increased|improved|reduced|boosted|grew|cut)\b[^.]*\b(revenue|sales|profit|cost|costs|efficiency|performance)\b/i.test(text) && !METRIC_RE.test(text))
    out.push("Impact claim without a figure or context. Add how much, or describe what you measured.");
  return out;
}
