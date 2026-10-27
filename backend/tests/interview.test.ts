import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { useTestDb } from "./helpers";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { extractNumbers } from "@resume/shared/analysis/bullets";
import { inferTags, interviewQuestions, storyCandidates, storyFromBullet } from "@resume/shared/interview";
import { ResumeData } from "@resume/shared/schema/resume";
import { sampleResume, SAMPLE_JD } from "./fixtures/sample";

const NOW = new Date("2026-06-15T00:00:00Z");

describe("storyFromBullet", () => {
  it("splits action and result in the user's words and leaves context for the user", () => {
    const s = storyFromBullet("Migrated the payments service from VMs to Kubernetes on AWS, cutting deployment time from 2 hours to 15 minutes.", "Finlytics");
    expect(s.action).toBe("I migrated the payments service from VMs to Kubernetes on AWS.");
    expect(s.result).toBe("This cut deployment time from 2 hours to 15 minutes.");
    expect(s.situation).toBe("");
    expect(s.title).toContain("(Finlytics)");
    expect(s.tags).toContain("impact");
  });

  it("tells the story in the past tense even for a current role", () => {
    expect(storyFromBullet("Improve report generation using SQL Server indexing", "Zenith").action).toBe("I improved report generation using SQL Server indexing.");
  });

  it("finds a purpose clause as the task", () => {
    const s = storyFromBullet("Built an internal CLI to automate release notes for 6 teams", "Acme");
    expect(s.task).toBe("I needed to automate release notes for 6 teams.");
    expect(s.action).toBe("I built an internal CLI.");
  });

  it("never adds numbers that aren't in the bullet", () => {
    for (const b of sampleResume().experience.flatMap((e) => e.bullets)) {
      const s = storyFromBullet(b.text, "X");
      const nums = new Set(extractNumbers(b.text));
      for (const part of [s.task, s.action, s.result]) for (const n of extractNumbers(part)) expect(nums.has(n), `${n} in "${part}"`).toBe(true);
    }
  });

  it("infers competency tags from wording", () => {
    expect(inferTags("Mentored three junior developers through code reviews")).toContain("leadership");
    expect(inferTags("Fixed a production outage and wrote the postmortem")).toContain("failure");
  });
});

describe("interviewQuestions", () => {
  const job = analyzeJob(SAMPLE_JD);
  const qs = interviewQuestions(sampleResume(), job, { company: "Lendwise", now: NOW });

  it("asks about evidenced skills in depth and flags missing ones as honest gaps", () => {
    expect(qs.some((q) => q.kind === "technical" && q.question.includes("Java"))).toBe(true);
    const kafka = qs.find((q) => q.kind === "gap" && q.question.includes("Kafka"));
    expect(kafka).toBeDefined();
    expect(kafka!.hint).toMatch(/Don't claim experience you don't have/);
  });

  it("explains why each question is likely", () => {
    for (const q of qs) expect(q.why.length, q.question).toBeGreaterThan(10);
  });

  it("probes the resume's numbers and the years requirement", () => {
    expect(qs.some((q) => q.kind === "resume" && /How did you measure/.test(q.question))).toBe(true);
    // About 6 years of dated experience meets "5+", so that's not raised; "8+" is.
    expect(qs.some((q) => /\d\+ years/.test(q.question))).toBe(false);
    const senior = interviewQuestions(sampleResume(), analyzeJob(SAMPLE_JD.replace("5+ years", "8+ years")), { now: NOW });
    expect(senior.some((q) => q.kind === "gap" && /8\+ years/.test(q.question))).toBe(true);
    expect(qs.find((q) => q.kind === "motivation" && q.question.includes("Lendwise"))).toBeDefined();
  });

  it("asks about gaps of more than six months between roles", () => {
    const r = sampleResume();
    r.experience[1].endDate = "2021-01";
    const gap = interviewQuestions(ResumeData.parse(r), null, { now: NOW }).find((q) => q.kind === "gap" && /between/.test(q.question));
    expect(gap?.question).toBe("What were you doing between Datawave Solutions and Finlytics Technologies Pvt Ltd?");
    expect(interviewQuestions(sampleResume(), null, { now: NOW }).some((q) => /between/.test(q.question))).toBe(false);
  });

  it("works without a job and offers story candidates", () => {
    const plain = interviewQuestions(sampleResume(), null, { now: NOW });
    expect(plain.some((q) => q.kind === "behavioural")).toBe(true);
    expect(plain.some((q) => q.kind === "technical")).toBe(false);
    const c = storyCandidates(sampleResume(), job);
    expect(c.length).toBeGreaterThan(2);
    expect(c[0].text).toMatch(/Java|Kubernetes|PostgreSQL/);
  });
});

describe("interview API", () => {
  const app = createApp();
  beforeEach(async () => {
    await useTestDb();
  });
  const signedIn = async (email: string) => {
    const a = request.agent(app);
    await a.post("/api/auth/register").send({ email, password: "a good password 1", fullName: "Test User", phone: "+91 98765 43210" });
    return a;
  };

  it("builds prep for a resume and job, drafts a STAR story, and keeps it in the bank", async () => {
    const a = await signedIn("iv1@example.com");
    const resume = (await a.post("/api/resumes").send({ name: "R", data: sampleResume() })).body.resume;
    const job = (await a.post("/api/jobs").send({ title: "Senior Backend Developer", company: "Lendwise", description: SAMPLE_JD })).body.job;

    const prep = await a.get(`/api/interview/prep?resumeId=${resume.id}&jobId=${job.id}`);
    expect(prep.status).toBe(200);
    expect(prep.body.job.company).toBe("Lendwise");
    expect(prep.body.questions.length).toBeGreaterThan(10);
    expect(prep.body.candidates.length).toBeGreaterThan(0);

    const c = prep.body.candidates[0];
    const draft = await a.post("/api/interview/star").send({ bullet: c.text, where: c.where, current: c.current });
    expect(draft.body.method).toBe("template");

    const saved = await a.post("/api/stories").send({ ...draft.body.story, resumeId: resume.id, situation: "Our payments service had slow, manual releases." });
    expect(saved.status).toBe(201);
    const id = saved.body.story.id;
    const upd = await a.put(`/api/stories/${id}`).send({ ...saved.body.story, result: "Deploys went from 2 hours to 15 minutes." });
    expect(upd.body.story.result).toBe("Deploys went from 2 hours to 15 minutes.");
    expect((await a.get("/api/stories")).body.stories).toHaveLength(1);

    const other = await signedIn("iv2@example.com");
    expect((await other.get(`/api/interview/prep?resumeId=${resume.id}`)).status).toBe(404);
    expect((await other.put(`/api/stories/${id}`).send({ title: "x" })).status).toBe(404);
    expect((await other.delete(`/api/stories/${id}`)).status).toBe(404);
    expect((await other.post("/api/stories").send({ title: "x", resumeId: resume.id })).status).toBe(404);
    expect((await other.get("/api/stories")).body.stories).toHaveLength(0);

    expect((await a.delete(`/api/stories/${id}`)).status).toBe(200);
  });
});
