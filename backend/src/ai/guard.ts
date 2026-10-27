import { extractNumbers } from "@resume/shared/analysis/bullets";
import { findSkills } from "@resume/shared/analysis/skills";

/**
 * Deterministic fact guard for AI output. Compares a generated text with the source
 * material it was allowed to use and lists anything new: numbers, recognised skills or
 * tools, and capitalised names. Flagged text is shown to the user as needing confirmation
 * and is never applied automatically.
 */

export interface GuardResult {
  ok: boolean;
  newNumbers: string[];
  newSkills: string[];
  newNames: string[];
  warnings: string[];
}

const COMMON_CAPS = new Set(
  "I A An The And Or For With To In On At By Of From Into Led Built Designed Developed Managed Created Improved Reduced Increased Delivered Implemented Automated Migrated Mentored Wrote Owned Drove Launched Analysed Analyzed Optimised Optimized Streamlined Collaborated Coordinated Partnered Established Introduced Resolved Supported Trained Tested Deployed Engineered Architected Spearheaded Oversaw Directed Planned Prepared Presented Researched Reviewed Scaled Secured Simplified Standardized Standardised Upgraded Validated Achieved Cut Grew Saved Handled Maintained Monitored Conducted Configured Defined Documented Enabled Enhanced Evaluated Executed Expanded Facilitated Generated Identified Integrated Modernized Negotiated Organized Organised Performed Produced Proposed Rebuilt Refactored Replaced Restructured Revamped Shipped Solved Taught Transformed Unified Worked Helped Assisted Responsible Experienced Backend Frontend Full-stack Senior Junior Lead Engineer Developer Manager Analyst".split(
    " ",
  ),
);

function capitalisedNames(text: string): string[] {
  const out: string[] = [];
  // Skip the first word of each sentence/bullet; it is capitalised for grammar.
  for (const sentence of text.split(/(?<=[.!?;:])\s+|\n/)) {
    const tokens = sentence.match(/[A-Z][a-zA-Z0-9&.+#-]*[a-zA-Z0-9+#]|[A-Z]/g) ?? [];
    const first = sentence.trim().match(/^[A-Za-z]+/)?.[0];
    for (const t of tokens) {
      if (t === first) continue;
      if (COMMON_CAPS.has(t)) continue;
      out.push(t);
    }
  }
  return out;
}

const norm = (s: string) => s.toLowerCase();

export function guardText(output: string, sources: string[]): GuardResult {
  const src = sources.join("\n");
  const srcLower = norm(src);
  const srcNums = new Set(extractNumbers(src));
  // Allow simple derived forms: "three" written as 3 or vice versa is not checked; numbers must match.
  const newNumbers = [...new Set(extractNumbers(output).filter((n) => !srcNums.has(n)))];
  const srcSkills = new Set(findSkills(src).map((h) => h.skill.name));
  const newSkills = [...new Set(findSkills(output).map((h) => h.skill.name).filter((n) => !srcSkills.has(n)))];
  const newNames = [...new Set(capitalisedNames(output).filter((n) => !srcLower.includes(norm(n))))].filter((n) => !newSkills.some((s) => norm(s).includes(norm(n))));
  const warnings: string[] = [];
  if (newNumbers.length) warnings.push(`Contains figures not in your material: ${newNumbers.join(", ")}. Confirm they're accurate or remove them.`);
  if (newSkills.length) warnings.push(`Mentions skills or tools not in your material: ${newSkills.join(", ")}. Keep only if you actually used them.`);
  if (newNames.length) warnings.push(`Introduces names not in your material: ${newNames.slice(0, 5).join(", ")}. Check they're correct.`);
  return { ok: warnings.length === 0, newNumbers, newSkills, newNames, warnings };
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** For AI-assisted import: is this extracted value actually present in the document text? */
export function presentInSource(value: string, sourceSquashed: string): boolean {
  const v = squash(value);
  if (!v) return true;
  if (sourceSquashed.includes(v)) return true;
  // Allow light reformatting: 85% of the value's word tokens must appear in the source.
  const tokens = value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  if (tokens.length < 3) return false;
  const hits = tokens.filter((t) => sourceSquashed.includes(t)).length;
  return hits / tokens.length >= 0.85;
}

export { squash as squashForGuard };
