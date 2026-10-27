import { describe, expect, it } from "vitest";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { matchResume } from "@resume/shared/analysis/match";
import { checkAts } from "@resume/shared/analysis/ats";
import { scoreResume } from "@resume/shared/analysis/quality";
import { analyzeBullet, suspiciousClaims } from "@resume/shared/analysis/bullets";
import { findSkills } from "@resume/shared/analysis/skills";
import { parseDateRange, parseLooseDate, totalExperienceYears } from "@resume/shared/analysis/dates";
import { SAMPLE_JD, sampleResume, sampleSettings } from "./fixtures/sample";

const NOW = new Date("2026-10-01");

describe("skills taxonomy", () => {
  it("recognises symbols and aliases", () => {
    const names = findSkills("Worked with C#, .NET Core, Node.js, C/C++ and Postgres on k8s; CI/CD via GitHub Actions").map((h) => h.skill.name);
    expect(names).toEqual(expect.arrayContaining(["C#", ".NET", "Node.js", "C++", "C", "PostgreSQL", "Kubernetes", "CI/CD", "GitHub Actions"]));
  });
  it("avoids common-word false positives", () => {
    const names = findSkills("We react quickly, go above and beyond, and excel at spring planning. Grade C in R&D.").map((h) => h.skill.name);
    expect(names).not.toContain("React");
    expect(names).not.toContain("Go");
    expect(names).not.toContain("Excel");
    expect(names).not.toContain("C");
    expect(names).not.toContain("R");
  });
  it("does not treat Java as JavaScript", () => {
    const names = findSkills("JavaScript developer").map((h) => h.skill.name);
    expect(names).toContain("JavaScript");
    expect(names).not.toContain("Java");
  });
});

describe("dates", () => {
  it("parses common resume formats", () => {
    expect(parseLooseDate("Jan 2020")).toBe("2020-01");
    expect(parseLooseDate("September, 2019")).toBe("2019-09");
    expect(parseLooseDate("03/2021")).toBe("2021-03");
    expect(parseLooseDate("2018")).toBe("2018");
    expect(parseLooseDate("Sept '19")).toBe("2019-09");
    expect(parseDateRange("Jan 2020 – Present")).toEqual({ start: "2020-01", end: "", current: true });
    expect(parseDateRange("2018-2021")).toEqual({ start: "2018", end: "2021", current: false });
    expect(parseDateRange("Jul 2019 to till date")?.current).toBe(true);
  });
  it("counts overlapping roles once and skips internships", () => {
    const y = totalExperienceYears(
      [
        { startDate: "2020-01", endDate: "2021-12", current: false },
        { startDate: "2021-06", endDate: "2022-12", current: false },
        { startDate: "2019-01", endDate: "2019-06", current: false, employmentType: "Internship" },
      ],
      NOW,
    );
    expect(y).toBe(3);
  });
});

describe("job description analysis", () => {
  const job = analyzeJob(SAMPLE_JD);
  it("classifies requirement importance from headings and wording", () => {
    const imp = Object.fromEntries(job.skills.map((s) => [s.name, s.importance]));
    expect(imp["Java"]).toBe("essential");
    expect(imp["PostgreSQL"]).toBe("essential");
    expect(imp["Kafka"]).toBe("essential");
    expect(imp["Kubernetes"]).toBe("responsibility");
    expect(imp["Terraform"]).toBe("preferred");
    expect(imp["Go"]).toBe("preferred");
  });
  it("extracts years and education, ignores benefits", () => {
    expect(job.minYears).toBe(5);
    expect(job.education?.label).toBe("Bachelor's");
    expect(job.ignoredSections).toContain("Benefits");
    expect(job.lines.some((l) => /insurance/i.test(l.text))).toBe(false);
  });
});

describe("matching", () => {
  const m = matchResume(sampleResume(), analyzeJob(SAMPLE_JD), NOW);
  const byName = Object.fromEntries(m.skills.map((s) => [s.name, s]));
  it("distinguishes evidence in work from bare listing and missing", () => {
    expect(byName["Java"].status).toBe("strong");
    expect(byName["Kubernetes"].status).toBe("strong");
    expect(byName["PostgreSQL"].status).toBe("strong");
    expect(byName["Kafka"].status).toBe("missing");
    expect(byName["Terraform"].status).toBe("missing");
  });
  it("suggests related skills for missing ones without claiming them", () => {
    expect(byName["Kafka"].related.length).toBe(0);
    const rec = m.recommendations.find((r) => r.text.includes("Kafka"))!;
    expect(rec.priority).toBe("high");
    expect(rec.text).toMatch(/only if/);
  });
  it("computes a documented, reproducible score", () => {
    expect(m.score).toBeGreaterThan(40);
    expect(m.score).toBeLessThan(95);
    expect(m.experience.requiredYears).toBe(5);
    // Jul 2020 – Oct 2026 (current role) ≈ 6.3 years.
    expect(m.experience.resumeYears).toBeCloseTo(6.3, 1);
    expect(m.experience.met).toBe(true);
    expect(m.education.met).toBe(true);
    const again = matchResume(sampleResume(), analyzeJob(SAMPLE_JD), NOW);
    expect(again.score).toBe(m.score);
  });
  it("adding real evidence raises the score", () => {
    const r = sampleResume();
    r.experience[0].bullets.push({ id: "x", text: "Built event consumers on Kafka processing 1M messages a day.", origin: "user" });
    const m2 = matchResume(r, analyzeJob(SAMPLE_JD), NOW);
    expect(m2.score).toBeGreaterThan(m.score);
  });
});

describe("regressions found in end-to-end testing", () => {
  it("does not treat Azure DevOps as the Azure cloud platform", () => {
    const r = sampleResume();
    r.skills = [{ id: "s", category: "Tools", items: ["Azure DevOps"] }];
    const m = matchResume(r, analyzeJob("Requirements:\n- Experience deploying to Azure"), NOW);
    expect(m.skills.find((s) => s.name === "Azure")!.status).toBe("missing");
    expect(m.terminology).toEqual([]);
  });
  it("skips wording suggestions when the posting's term already appears on the resume", () => {
    const r = sampleResume();
    r.summary.text = "Builds web APIs.";
    const m = matchResume(r, analyzeJob("Requirements:\n- Strong experience with REST APIs"), NOW);
    expect(m.terminology.find((t) => t.skill === "REST APIs")).toBeUndefined();
  });
  it("gives an empty resume no formatting credit", () => {
    const q = scoreResume({ ...sampleResume(), experience: [], projects: [], education: [], additional: [] }, sampleSettings(), { now: NOW });
    expect(q.subscores.find((s) => s.key === "formatting")!.score).toBe(0);
  });
});

describe("ATS checks", () => {
  it("passes a complete resume with only minor/info issues", () => {
    const res = checkAts(sampleResume(), sampleSettings(), { now: NOW });
    expect(res.issues.filter((i) => i.severity === "critical" || i.severity === "major")).toEqual([]);
    expect(res.score).toBeGreaterThanOrEqual(85);
  });
  it("flags missing contact info, bad dates, order and ID numbers", () => {
    const r = sampleResume();
    r.contact.email = "";
    r.contact.phone = "12345";
    r.experience.reverse();
    r.experience[0].endDate = "2019-01";
    r.summary.text += " Aadhaar: 1234 5678 9012. Date of Birth: 01/01/1995";
    const res = checkAts(r, sampleSettings({ market: "US" }), { now: NOW });
    const msgs = res.issues.map((i) => i.message).join("\n");
    expect(msgs).toMatch(/Email address is missing/);
    expect(msgs).toMatch(/Phone number doesn't look valid/);
    expect(msgs).toMatch(/reverse-chronological/);
    expect(msgs).toMatch(/ends before it starts/);
    expect(msgs).toMatch(/ID number/);
    expect(res.issues.find((i) => i.message.includes("personal details"))?.severity).toBe("minor");
  });
  it("reports layout problems from uploaded files", () => {
    const res = checkAts(sampleResume(), sampleSettings(), {
      now: NOW,
      layout: { format: "docx", pages: null, tables: 2, textBoxes: 1, images: 1, columns: 2, headerFooterText: true, imageOnly: false, unusualFonts: [] },
    });
    expect(res.issues.filter((i) => i.category === "layout").length).toBe(5);
  });
});

describe("bullets and claims", () => {
  it("scores weak versus strong bullets", () => {
    expect(analyzeBullet("Responsible for testing.").strength).toBeLessThan(0.5);
    expect(analyzeBullet("Reduced API latency by 40% by adding Redis caching to the order service.").strength).toBe(1);
  });
  it("flags suspicious metrics and superlatives", () => {
    expect(suspiciousClaims("Improved performance by 500%").length).toBeGreaterThan(0);
    expect(suspiciousClaims("World-class engineer").length).toBeGreaterThan(0);
    expect(suspiciousClaims("Increased revenue for the team")).toEqual(expect.arrayContaining([expect.stringMatching(/without a figure/)]));
  });
});

describe("quality score", () => {
  it("returns six explained subscores and ranked improvements", () => {
    const q = scoreResume(sampleResume(), sampleSettings(), { jobDescription: SAMPLE_JD, now: NOW });
    expect(q.subscores.map((s) => s.key)).toEqual(["relevance", "skills", "evidence", "readability", "ats", "formatting"]);
    for (const s of q.subscores) expect(s.reasons.length).toBeGreaterThan(0);
    expect(q.improvements.length).toBeGreaterThan(0);
    for (let i = 1; i < q.improvements.length; i++) expect(q.improvements[i - 1].impact).toBeGreaterThanOrEqual(q.improvements[i].impact);
    expect(q.overall).toBeGreaterThan(0);
    expect(q.overall).toBeLessThanOrEqual(100);
  });
  it("excludes relevance without a job and rescales", () => {
    const q = scoreResume(sampleResume(), sampleSettings(), { now: NOW });
    expect(q.subscores[0].score).toBeNull();
    expect(q.match).toBeNull();
  });
  it("recalculates when an edit is accepted", () => {
    const r = sampleResume();
    const before = scoreResume(r, sampleSettings(), { now: NOW });
    r.experience[1].bullets[1].text = "Wrote 85 pytest unit tests for the reporting module, raising coverage from 40% to 78%.";
    const after = scoreResume(r, sampleSettings(), { now: NOW });
    expect(after.subscores.find((s) => s.key === "evidence")!.score!).toBeGreaterThan(before.subscores.find((s) => s.key === "evidence")!.score!);
  });
  it("handles an empty resume without crashing", () => {
    const q = scoreResume({ ...sampleResume(), experience: [], projects: [], education: [], skills: [], summary: { text: "", origin: "user" } }, sampleSettings(), { now: NOW });
    expect(q.overall).toBeGreaterThanOrEqual(0);
    expect(q.ats.issues.some((i) => i.message.includes("No experience"))).toBe(true);
  });
  it("flags a skill written twice, not related skills that share a search alias", () => {
    const r = sampleResume();
    r.skills = [
      { id: "a", category: "Languages", items: ["SQL", "PL/SQL", "Java"] },
      { id: "b", category: "Tools", items: ["Git", "GitHub", "Postman", "Swagger"] },
      { id: "c", category: "AI", items: ["LLM APIs", "RAG", "LangChain"] },
    ];
    expect(checkAts(r, sampleSettings()).issues.some((i) => /Duplicate skills/.test(i.message))).toBe(false);
    r.skills[0].items.push("React", "React.js");
    const dup = checkAts(r, sampleSettings()).issues.find((i) => /Duplicate skills/.test(i.message));
    expect(dup?.message).toBe("Duplicate skills: React.");
  });
  it("treats the summary as optional: hiding it costs no points", () => {
    const r = sampleResume();
    const shown = scoreResume(r, sampleSettings(), { now: NOW });
    const hidden = scoreResume(r, sampleSettings({ hiddenSections: ["summary"] }), { now: NOW });
    const empty = scoreResume({ ...r, summary: { text: "", origin: "user" } }, sampleSettings(), { now: NOW });
    for (const q of [hidden, empty]) {
      expect(q.ats.issues.filter((i) => /summary/i.test(i.message)).every((i) => i.severity === "info")).toBe(true);
      expect(q.improvements.some((i) => /summary/i.test(i.message))).toBe(false);
      expect(q.ats.score).toBeGreaterThanOrEqual(shown.ats.score);
    }
  });
});
