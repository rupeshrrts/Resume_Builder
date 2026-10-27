import type NSpell from "nspell";
import type { ResumeData, ResumeSettings } from "@resume/shared/schema/resume";
import { SKILLS } from "@resume/shared/analysis/skills";
import { collectText } from "@resume/shared/analysis/text";
import type { Issue } from "@resume/shared/analysis/ats";

/**
 * Spell check with a Hunspell English dictionary. Capitalised words, acronyms, and words
 * containing digits or symbols are skipped (they are usually names, products or technologies),
 * as are taxonomy skills and a list of common resume/industry terms.
 */

const EXTRA_WORDS = `frontend backend fullstack microservice microservices dashboards dashboard onboarded onboarding upskilled upskilling
  scalable scalability toolchain devops api apis workflow workflows webhooks webhook middleware repo repos codebase codebases refactored
  refactoring containerized containerised dockerized serverless analytics stakeholder stakeholders deliverables deliverable kpi kpis
  datasets dataset backlog backlogs signup signups login logins runbook runbooks failover uptime downtime hotfix hotfixes roadmap roadmaps
  proactively upsell upselling cross-functional crossfunctional ecommerce e-commerce omnichannel fintech edtech healthtech saas b2b b2c
  internship internships hackathon hackathons cgpa sgpa gpa btech mtech bsc msc bca mca mba pgdm cbse icse ssc hsc onsite offshore
  nearshore pune bengaluru bangalore hyderabad chennai gurugram gurgaon noida mumbai kolkata ahmedabad lakh lakhs crore crores
  multithreaded multithreading async asynchronous auth authn authz pipelines pipeline etl elt geospatial chatbot chatbots
  benchmarked benchmarking debugged debugging optimised optimise organised organise analysed analyse modelled modelling
  prototyped prototyping productionized productionised automations misconfigurations misconfiguration remediated remediation
  sharding sharded replicas caching cached idempotent idempotency latency throughput realtime real-time timeseries`.split(/\s+/);

let spellPromise: Promise<NSpell> | null = null;

async function getSpell(): Promise<NSpell> {
  spellPromise ??= (async () => {
    const [{ default: nspell }, { default: dict }] = await Promise.all([import("nspell"), import("dictionary-en")]);
    const spell = nspell(dict as unknown as { aff: Buffer; dic: Buffer });
    for (const w of EXTRA_WORDS) if (w) spell.add(w);
    for (const s of SKILLS) for (const t of [s.name, ...s.aliases]) for (const w of t.toLowerCase().split(/[\s/]+/)) if (/^[a-z-]+$/.test(w)) spell.add(w);
    return spell;
  })();
  return spellPromise;
}

/** British/Indian spellings are correct for non-US markets; try mapping them to US forms. */
function usVariants(w: string): string[] {
  return [
    w.replace(/is(e|ed|es|ing|ation|ations)$/, "iz$1"),
    w.replace(/ys(e|ed|es|ing)$/, "yz$1"),
    w.replace(/our(s|ed|ing|able)?$/, "or$1"),
    w.replace(/tre(s)?$/, "ter$1"),
    w.replace(/lled$/, "led").replace(/lling$/, "ling"),
    w.replace(/ogue(s)?$/, "og$1"),
    w.replace(/ence$/, "ense"),
  ].filter((v) => v !== w);
}

export async function checkSpelling(r: ResumeData, market: ResumeSettings["market"]): Promise<Issue[]> {
  const spell = await getSpell();
  const found = new Map<string, { count: number; loc: Issue["loc"] }>();
  for (const frag of collectText(r)) {
    if (frag.loc.section === "skills") continue;
    for (const m of frag.text.matchAll(/(?<![\w@./-])[a-z][a-z'’-]{2,}(?![\w@/])/g)) {
      const w = m[0].replace(/[’']s$/, "").replace(/-+$/, "");
      if (w.includes("-") ? w.split("-").every((p) => !p || spell.correct(p)) : spell.correct(w)) continue;
      if (market !== "US" && usVariants(w).some((v) => spell.correct(v))) continue;
      const cur = found.get(w);
      found.set(w, { count: (cur?.count ?? 0) + 1, loc: cur?.loc ?? frag.loc });
    }
  }
  const issues: Issue[] = [];
  for (const [w, { count, loc }] of [...found.entries()].slice(0, 15)) {
    const sugg = spell.suggest(w).slice(0, 3);
    issues.push({
      id: `spelling-${w}`,
      severity: "minor",
      category: "spelling",
      message: `Possible misspelling: “${w}”${count > 1 ? ` (×${count})` : ""}.`,
      fix: sugg.length ? `Did you mean ${sugg.map((s) => `“${s}”`).join(", ")}? Ignore if it's a correct term.` : "Check the spelling. Ignore if it's a correct term.",
      loc,
    });
  }
  return issues;
}
