import { describe, expect, it } from "vitest";
import { composeDocument, firstPerson } from "@resume/shared/letters";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { extractNumbers } from "@resume/shared/analysis/bullets";
import { totalExperienceYears } from "@resume/shared/analysis/dates";
import { DOC_KINDS, type DocKind } from "@resume/shared/schema/document";
import { SAMPLE_JD, sampleResume } from "./fixtures/sample";

const input = () => ({ resume: sampleResume(), job: analyzeJob(SAMPLE_JD), role: "Senior Backend Developer", company: "Lendwise", recipient: "Meera Iyer", tone: "professional" as const });

describe("template documents", () => {
  for (const kind of Object.keys(DOC_KINDS) as DocKind[]) {
    it(`${kind}: uses only facts from the resume and fits the length limit`, () => {
      const i = input();
      const { body } = composeDocument(kind, i);
      expect(body.length).toBeGreaterThan(20);
      expect(body.length).toBeLessThanOrEqual(DOC_KINDS[kind].limit);
      // Years of experience are calculated from the user's own dates, so they count as sourced.
      const years = String(Math.floor(totalExperienceYears(i.resume.experience)));
      const sourceNumbers = new Set([...extractNumbers(JSON.stringify(i.resume) + SAMPLE_JD), years]);
      for (const n of extractNumbers(body)) expect(sourceNumbers.has(n), `number ${n} in ${kind} isn't from the resume`).toBe(true);
      expect(body).not.toMatch(/undefined|null|\[object/);
    });
  }

  it("cover letter addresses the recipient, names the role and company, and cites relevant work", () => {
    const { body } = composeDocument("cover_letter", input());
    expect(body).toMatch(/^Dear Meera Iyer,/);
    expect(body).toContain("Senior Backend Developer position at Lendwise");
    expect(body).toMatch(/At Finlytics Technologies Pvt Ltd, I (design|designed) and (build|built) 12 REST APIs/);
    expect(body).toMatch(/Sincerely,\nPriya Sharma$/);
  });

  it("recruiter message stays short", () => {
    const { body } = composeDocument("recruiter_message", input());
    expect(body.startsWith("Hi Meera,")).toBe(true);
    expect(body.length).toBeLessThan(600);
  });

  it("LinkedIn headline is a single line within 220 characters", () => {
    const { body } = composeDocument("linkedin_headline", input());
    expect(body).not.toContain("\n");
    expect(body).toMatch(/^Backend Engineer \| /);
  });

  it("works without a job description or recipient", () => {
    const { body } = composeDocument("cover_letter", { ...input(), job: null, recipient: "", company: "" });
    expect(body).toMatch(/^Dear Hiring Manager,/);
  });
});

describe("firstPerson", () => {
  it("converts a bullet to a first-person clause without changing its facts", () => {
    expect(firstPerson("Built ETL pipelines in Python loading 2 TB of data.", false)).toBe("I built ETL pipelines in Python loading 2 TB of data");
    expect(firstPerson("Lead a team of 4 engineers.", true)).toBe("I lead a team of 4 engineers");
    expect(firstPerson("Improve report generation.", false)).toBe("I improved report generation");
    expect(firstPerson("Responsible for developing REST APIs.", false)).toBe("I was responsible for developing REST APIs");
  });
});
