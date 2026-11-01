import { describe, expect, it } from "vitest";
import { composeBullet, composeSummary, notesToBullet, suggestSkillsFromText, verbForTense } from "@resume/shared/compose";
import { extractNumbers } from "@resume/shared/analysis/bullets";
import { sampleResume } from "./fixtures/sample";

describe("composeBullet", () => {
  it("builds verb + what + how + result", () => {
    expect(composeBullet({ verb: "Built", what: "an order-tracking API", how: "Node.js and PostgreSQL", result: "used by 25,000 customers a month" })).toBe(
      "Built an order-tracking API using Node.js and PostgreSQL, used by 25,000 customers a month.",
    );
  });
  it("uses present tense for current roles", () => {
    expect(composeBullet({ verb: "Led", what: "a team of 4 engineers" }, true)).toBe("Lead a team of 4 engineers.");
    expect(verbForTense("Optimized", true)).toBe("Optimize");
    expect(verbForTense("Reduced", true)).toBe("Reduce");
    expect(verbForTense("Analyzed", true)).toBe("Analyze");
  });
  it("keeps result phrasing that already reads naturally", () => {
    expect(composeBullet({ verb: "Rebuilt", what: "the checkout page", how: "React", result: "cutting load time from 4s to 1.5s" })).toBe(
      "Rebuilt the checkout page using React, cutting load time from 4s to 1.5s.",
    );
  });
  it("doesn't double the verb when the user already wrote one", () => {
    expect(composeBullet({ verb: "Built", what: "Designed the billing schema" })).toBe("Designed the billing schema.");
  });
  it("preserves acronyms and names at the start", () => {
    expect(composeBullet({ verb: "Migrated", what: "AWS Lambda functions to containers" })).toBe("Migrated AWS Lambda functions to containers.");
  });
  it("never adds numbers that weren't given", () => {
    const b = composeBullet({ verb: "Improved", what: "report generation", how: "SQL indexing" });
    expect(extractNumbers(b)).toEqual([]);
  });
});

describe("notesToBullet", () => {
  it("keeps pasted text as one bullet, rejoining wrapped lines and split words", () => {
    const pasted =
      "Implemented a RAG pipeline for log analysis that retrieves relevant\napplication and system logs for a client-\nreported error and passes them to an LLM as context, helping the team find\nthe cause, troubleshoot\nproblems, and resolve operational issues faster.";
    expect(notesToBullet(pasted)).toBe(
      "Implemented a RAG pipeline for log analysis that retrieves relevant application and system logs for a client-reported error and passes them to an LLM as context, helping the team find the cause, troubleshoot problems, and resolve operational issues faster.",
    );
  });

  it("drops list markers and filler openings and fixes the tense", () => {
    expect(notesToBullet("• I was responsible for testing the app.\nmanage the release calendar for 3 teams")).toBe("Testing the app. manage the release calendar for 3 teams.");
    expect(notesToBullet("manage the release calendar for 3 teams")).toBe("Managed the release calendar for 3 teams.");
  });
});

describe("composeSummary", () => {
  it("drafts from the user's own facts only", () => {
    const r = sampleResume();
    const s = composeSummary(r, { targetRole: "Backend Engineer", stage: "experienced" });
    expect(s).toMatch(/^Backend Engineer with 6\+ years of experience in /);
    for (const n of extractNumbers(s)) expect(JSON.stringify(r)).toContain(n);
  });
  it("uses past tense for highlights taken from current-role bullets", () => {
    const r = sampleResume();
    r.experience[0].bullets = [{ id: "x", text: "Improve settlement report generation using SQL Server indexing, cutting run time from 40 to 6 minutes.", origin: "user" }];
    r.experience[1].bullets = [];
    r.projects = [];
    expect(composeSummary(r, { targetRole: "Backend Engineer", stage: "experienced" })).toContain("Improved settlement report generation");
  });
  it("doesn't quote a bullet that has no number", () => {
    const r = sampleResume();
    r.experience = [{ ...r.experience[0], bullets: [{ id: "x", text: "Built this in the first month.", origin: "user" }] }];
    r.projects = [];
    expect(composeSummary(r, { targetRole: "Software Engineer", stage: "student" })).not.toContain("Built this");
  });
  it("doesn't quote a bullet from a role the resume leaves out (no title or company)", () => {
    const r = sampleResume();
    r.experience = [{ ...r.experience[0], title: "", company: "", bullets: [{ id: "x", text: "Cut report time from 40 to 6 minutes.", origin: "user" }] }];
    r.projects = [];
    expect(composeSummary(r, { targetRole: "Software Engineer", stage: "student" })).not.toContain("report time");
  });
  it("handles students without experience", () => {
    const r = sampleResume();
    r.experience = [];
    const s = composeSummary(r, { targetRole: "Software Engineer", stage: "student" });
    expect(s).toMatch(/B\.Tech in Computer Science/);
    expect(s).toMatch(/Seeking a Software Engineer role\.$/);
  });
});

describe("suggestSkillsFromText", () => {
  it("suggests skills used in bullets but missing from the skills list", () => {
    const r = sampleResume();
    r.skills = [{ id: "s", category: "Languages", items: ["Java"] }];
    const names = suggestSkillsFromText(r).map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(["Spring Boot", "Kubernetes", "AWS", "Airflow"]));
    expect(names).not.toContain("Java");
  });
});
