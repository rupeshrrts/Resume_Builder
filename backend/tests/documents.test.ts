import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { sampleResume, SAMPLE_JD } from "./fixtures/sample";
import { useTestDb } from "./helpers";

const app = createApp();
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

async function signedIn(email: string) {
  const a = request.agent(app);
  await a.post("/api/auth/register").send({ email, password: "a good password 1", fullName: "Test User", phone: "+91 98765 43210" });
  return a;
}

beforeEach(async () => {
  await useTestDb();
});

describe("documents API", () => {
  it("drafts a cover letter from the resume and job, saves it, and exports it with the letterhead", async () => {
    const a = await signedIn("doc1@example.com");
    const resume = (await a.post("/api/resumes").send({ name: "R", data: sampleResume() })).body.resume;
    const job = (await a.post("/api/jobs").send({ title: "Senior Backend Developer", company: "Lendwise", description: SAMPLE_JD })).body.job;

    const draft = await a.post("/api/documents/generate").send({ kind: "cover_letter", resumeId: resume.id, jobId: job.id, recipient: "Meera Iyer", useAi: false });
    expect(draft.status).toBe(200);
    expect(draft.body.method).toBe("template");
    expect(draft.body.body).toMatch(/^Dear Meera Iyer,/);
    expect(draft.body.body).toContain("Lendwise");

    const saved = await a.post("/api/documents").send({ kind: "cover_letter", title: draft.body.title, body: draft.body.body, origin: "template", resumeId: resume.id, jobId: job.id });
    expect(saved.status).toBe(201);
    const id = saved.body.document.id;
    expect((await a.get(`/api/documents?resumeId=${resume.id}`)).body.documents).toHaveLength(1);

    const pdf = await a.get(`/api/documents/${id}/export?format=pdf`).buffer(true).parse(binary);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    const { getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(pdf.body as Buffer));
    const text = ((await (await doc.getPage(1)).getTextContent()).items as { str: string }[]).map((i) => i.str).join(" ");
    expect(text).toContain("Priya Sharma");
    expect(text).toContain("Dear Meera Iyer");

    const docx = await a.get(`/api/documents/${id}/export?format=docx`).buffer(true).parse(binary);
    expect((docx.body as Buffer).subarray(0, 2).toString()).toBe("PK");

    const upd = await a.put(`/api/documents/${id}`).send({ body: "Edited by hand.", origin: "user" });
    expect(upd.body.document.body).toBe("Edited by hand.");
    // Fields not sent keep their values (Zod defaults must not overwrite them).
    expect(upd.body.document).toMatchObject({ kind: "cover_letter", title: draft.body.title, resumeId: resume.id, jobId: job.id });
  });

  it("drafts every kind within its length limit", async () => {
    const a = await signedIn("doc2@example.com");
    const resume = (await a.post("/api/resumes").send({ name: "R", data: sampleResume() })).body.resume;
    for (const kind of ["recruiter_message", "application_email", "linkedin_headline", "linkedin_about"]) {
      const r = await a.post("/api/documents/generate").send({ kind, resumeId: resume.id, useAi: false });
      expect(r.status, kind).toBe(200);
      expect(r.body.body.length, kind).toBeGreaterThan(10);
    }
  });

  it("keeps documents private to their owner", async () => {
    const owner = await signedIn("doc3@example.com");
    const resume = (await owner.post("/api/resumes").send({ name: "R", data: sampleResume() })).body.resume;
    const id = (await owner.post("/api/documents").send({ kind: "linkedin_headline", body: "Backend Engineer", resumeId: resume.id })).body.document.id;
    const other = await signedIn("doc4@example.com");
    expect((await other.get(`/api/documents/${id}`)).status).toBe(404);
    expect((await other.get(`/api/documents/${id}/export?format=pdf`)).status).toBe(404);
    expect((await other.delete(`/api/documents/${id}`)).status).toBe(404);
    expect((await other.post("/api/documents/generate").send({ kind: "cover_letter", resumeId: resume.id, useAi: false })).status).toBe(404);
    expect((await other.post("/api/documents").send({ kind: "cover_letter", body: "x", resumeId: resume.id })).status).toBe(404);
  });

  it("rejects bodies over the database limit", async () => {
    const a = await signedIn("doc5@example.com");
    expect((await a.post("/api/documents").send({ kind: "cover_letter", body: "x".repeat(12001) })).status).toBe(400);
  });
});
