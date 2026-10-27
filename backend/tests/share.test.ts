import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { getDb } from "@/db/index";
import { renderMarkdown } from "@resume/shared/render/markdown";
import { toJsonResume } from "@resume/shared/render/jsonresume";
import { buildDocument } from "@resume/shared/render/model";
import { sampleResume, sampleSettings } from "./fixtures/sample";
import { useTestDb } from "./helpers";

const app = createApp();

async function withResume(email: string) {
  const a = request.agent(app);
  await a.post("/api/auth/register").send({ email, password: "a good password 1", fullName: "Test User", phone: "+91 98765 43210" });
  const data = sampleResume();
  data.experience[0].bullets[0] = { ...data.experience[0].bullets[0], origin: "ai", sourceText: "my private original wording" };
  const resume = (await a.post("/api/resumes").send({ name: "Master", data })).body.resume;
  return { a, resume };
}

beforeEach(async () => {
  await useTestDb();
});

describe("Markdown and JSON Resume export", () => {
  it("renders Markdown with headings, links and escaped text", () => {
    const md = renderMarkdown(buildDocument(sampleResume(), sampleSettings()));
    expect(md).toMatch(/^# Priya Sharma\n/);
    expect(md).toContain("[github.com/priyasharma](https://github.com/priyasharma)");
    expect(md).toMatch(/^## /m);
    expect(md).toContain("- Designed and built 12 REST APIs in Java and Spring Boot serving 40,000 daily users.");
  });

  it("maps to JSON Resume v1 fields", () => {
    const j = toJsonResume(sampleResume());
    expect(j.basics).toMatchObject({ name: "Priya Sharma", label: "Backend Engineer", email: "priya.sharma@example.com", location: { city: "Pune", region: "Maharashtra" } });
    expect(j.basics.profiles?.map((p) => p.network)).toEqual(["LinkedIn", "GitHub"]);
    expect(j.work[0]).toMatchObject({ name: "Finlytics Technologies Pvt Ltd", position: "Software Engineer II", startDate: "2022-04" });
    expect(j.work[0]).not.toHaveProperty("endDate");
    expect(j.work[1].endDate).toBe("2022-03");
    expect(j.education[0]).toMatchObject({ studyType: "B.Tech", area: "Computer Science", score: "CGPA: 8.4/10" });
    expect(j.languages.map((l) => l.language)).toEqual(["English", "Hindi", "Marathi"]);
    expect(j.skills[0]).toEqual({ name: "Languages", keywords: ["Java", "Python", "SQL"] });
    expect(JSON.stringify(j)).not.toMatch(/"id"|origin/);
  });

  it("serves both formats from the export endpoint", async () => {
    const { a, resume } = await withResume("exp1@example.com");
    const md = await a.get(`/api/resumes/${resume.id}/export?format=md`);
    expect(md.headers["content-type"]).toMatch(/text\/markdown/);
    expect(md.headers["content-disposition"]).toContain("Priya_Sharma_Resume.md");
    const json = await a.get(`/api/resumes/${resume.id}/export?format=json`);
    expect(JSON.parse(json.text).basics.name).toBe("Priya Sharma");
  });
});

describe("share links", () => {
  it("shares a read-only copy without private fields, counts views, and can be revoked", async () => {
    const { a, resume } = await withResume("sh1@example.com");
    const created = await a.post(`/api/resumes/${resume.id}/shares`).send({ expiresInDays: 7 });
    expect(created.status).toBe(201);
    const { token, link } = created.body;
    expect(created.body.path).toBe(`/r/${token}`);
    expect(link.hasPassword).toBe(false);
    expect(link.expiresAt).toBeGreaterThan(Date.now());

    // Only a hash of the token is stored.
    const stored = (await getDb().query<{ token_hash: string }>("SELECT token_hash FROM share_links")).rows[0].token_hash;
    expect(stored).not.toContain(token);

    const pub = await request(app).get(`/api/public/r/${token}`);
    expect(pub.status).toBe(200);
    expect(pub.headers["x-robots-tag"]).toContain("noindex");
    expect(pub.body.data.contact.fullName).toBe("Priya Sharma");
    const body = JSON.stringify(pub.body);
    expect(body).not.toContain("my private original wording");
    expect(body).not.toContain('"ai"');
    expect(body).not.toContain("sh1@example.com");

    const pdf = await request(app).get(`/api/public/r/${token}/pdf`);
    expect(pdf.headers["content-type"]).toBe("application/pdf");

    expect((await a.get(`/api/resumes/${resume.id}/shares`)).body.links[0].views).toBe(1);

    expect((await a.delete(`/api/shares/${link.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/public/r/${token}`)).status).toBe(404);
  });

  it("requires the password before showing a protected link", async () => {
    const { a, resume } = await withResume("sh2@example.com");
    const { token } = (await a.post(`/api/resumes/${resume.id}/shares`).send({ password: "open sesame", expiresInDays: 0 })).body;
    const viewer = request.agent(app);
    const locked = await viewer.get(`/api/public/r/${token}`);
    expect(locked.status).toBe(401);
    expect(locked.body.code).toBe("password_required");
    expect((await viewer.get(`/api/public/r/${token}/pdf`)).status).toBe(401);
    expect((await viewer.post(`/api/public/r/${token}/unlock`).send({ password: "wrong guess" })).status).toBe(401);
    expect((await viewer.post(`/api/public/r/${token}/unlock`).send({ password: "open sesame" })).status).toBe(200);
    expect((await viewer.get(`/api/public/r/${token}`)).status).toBe(200);
    // A different viewer still needs the password.
    expect((await request(app).get(`/api/public/r/${token}`)).status).toBe(401);
  });

  it("stops working after it expires, and other users can't manage it", async () => {
    const { a, resume } = await withResume("sh3@example.com");
    const { token, link } = (await a.post(`/api/resumes/${resume.id}/shares`).send({ expiresInDays: 1 })).body;
    await getDb().query("UPDATE share_links SET expires_at = now() - interval '1 minute'");
    expect((await request(app).get(`/api/public/r/${token}`)).status).toBe(404);

    const other = request.agent(app);
    await other.post("/api/auth/register").send({ email: "sh4@example.com", password: "a good password 1", fullName: "Test User", phone: "+91 98765 43210" });
    expect((await other.get(`/api/resumes/${resume.id}/shares`)).status).toBe(404);
    expect((await other.post(`/api/resumes/${resume.id}/shares`).send({})).status).toBe(404);
    expect((await other.delete(`/api/shares/${link.id}`)).status).toBe(404);
    expect((await request(app).get("/api/public/r/not-a-real-token-123")).status).toBe(404);
  });
});
