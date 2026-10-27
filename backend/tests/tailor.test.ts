import { describe, expect, it } from "vitest";
import { applyProposals, proposeTailoring } from "@resume/shared/tailor";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { matchResume } from "@resume/shared/analysis/match";
import { SAMPLE_JD, sampleResume, sampleSettings } from "./fixtures/sample";

const NOW = new Date("2026-10-01");

describe("one-click tailoring proposals", () => {
  const data = sampleResume();
  // Put the most relevant material last so reordering has something to do.
  data.skills.reverse();
  data.experience[0].bullets.reverse();
  data.skills.push({ id: "alias", category: "More", items: ["Postgres"] });
  const doc = { data, settings: sampleSettings({ sectionOrder: ["summary", "experience", "projects", "skills", "education", "certifications", "additional"] }) };
  const job = analyzeJob(SAMPLE_JD.replace("PostgreSQL", "Postgres"));
  const proposals = proposeTailoring(doc, job);
  const kinds = proposals.map((p) => p.kind);

  it("proposes reordering skills, bullets and sections", () => {
    expect(kinds).toEqual(expect.arrayContaining(["skills-order", "bullets-order", "section-order"]));
    expect(proposals.every((p) => p.safe)).toBe(true);
  });

  it("puts job-relevant evidence first", () => {
    const applied = applyProposals(doc, proposals);
    const inJob = (s: string) => job.skills.some((j) => j.name.toLowerCase() === s.toLowerCase() || j.wording.toLowerCase() === s.toLowerCase());
    for (const g of applied.data.skills) {
      const firstNonJob = g.items.findIndex((i) => !inJob(i));
      if (firstNonJob >= 0) expect(g.items.slice(firstNonJob).some(inJob), `${g.category}: ${g.items.join(", ")}`).toBe(false);
    }
    expect(applied.data.skills[0].items.some(inJob)).toBe(true);
    expect(applied.data.experience[0].bullets[0].text).toMatch(/Java and Spring Boot/);
    expect(applied.settings.sectionOrder.indexOf("skills")).toBe(1);
  });

  it("aligns a synonym with the posting's wording, keeping the user's term", () => {
    const term = proposals.find((p) => p.kind === "terminology" && p.before === "PostgreSQL");
    expect(term?.after).toBe("Postgres (PostgreSQL)");
  });

  it("doesn't rename a more specific technology to the general one", () => {
    const d2 = sampleResume();
    d2.skills = [{ id: "fw", category: "Frameworks", items: ["ASP.NET Core"] }];
    const props = proposeTailoring({ data: d2, settings: sampleSettings() }, analyzeJob("Requirements:\n- Strong experience with .NET and C#"));
    expect(props.filter((p) => p.kind === "terminology")).toEqual([]);
  });

  it("never adds or removes facts: same bullets and skills, only reordered", () => {
    const applied = applyProposals(doc, proposals.filter((p) => p.kind !== "terminology"));
    const bullets = (d: typeof data) => d.experience.flatMap((e) => e.bullets.map((b) => b.text)).sort();
    const skills = (d: typeof data) => d.skills.flatMap((g) => g.items).sort();
    expect(bullets(applied.data)).toEqual(bullets(data));
    expect(skills(applied.data)).toEqual(skills(data));
    expect(applied.data.summary).toEqual(data.summary);
  });

  it("doesn't change the original document", () => {
    const snapshot = JSON.stringify(doc);
    applyProposals(doc, proposals);
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it("does not lower the job-match score", () => {
    const before = matchResume(doc.data, job, NOW).score;
    const after = matchResume(applyProposals(doc, proposals).data, job, NOW).score;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("proposes nothing when the resume is already in the best order", () => {
    const applied = applyProposals(doc, proposals);
    const again = proposeTailoring(applied, job).filter((p) => p.kind !== "terminology");
    expect(again).toEqual([]);
  });
});
