import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { getDb } from "@/db/index";
import {
  ConflictError,
  createJob,
  createResume,
  createUser,
  deleteResume,
  deleteUser,
  duplicateResume,
  getJob,
  getResume,
  listResumes,
  listVersions,
  restoreVersion,
  snapshotResume,
  updateResume,
} from "@/db/repo";
import { hashPassword, passwordProblem, verifyPassword } from "@/auth/password";
import { sampleResume, sampleSettings } from "./fixtures/sample";
import { useTestDb } from "./helpers";

const emptyJob = { title: "Dev", company: "X", url: "", description: "", status: "saved" as const, appliedAt: "", notes: "" };

let alice: string;
let bob: string;

beforeEach(async () => {
  await useTestDb();
  alice = (await createUser("alice@example.com", "x")).id;
  bob = (await createUser("bob@example.com", "x")).id;
});

describe("normalized storage", () => {
  it("round-trips every field of a resume through the SQL tables", async () => {
    const data = sampleResume();
    data.experience[0].bullets[0] = { ...data.experience[0].bullets[0], origin: "ai", sourceText: "Original wording" };
    data.summary = { text: data.summary.text, origin: "ai", sourceText: "Old summary" };
    const settings = sampleSettings({ template: "modern", accentColor: "#1f4e79", fontSize: 11, hiddenSections: ["projects"], market: "US" });
    const r = await createResume(alice, { name: "A", kind: "master", data, settings });
    const back = (await getResume(alice, r.id))!;
    expect(back.data).toEqual(data);
    expect(back.settings).toEqual(settings);
  });

  it("stores content in its own tables, not as JSON", async () => {
    const r = await createResume(alice, { name: "A", kind: "master", data: sampleResume() });
    const db = getDb();
    const count = async (t: string) => Number((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} WHERE resume_id = $1`, [r.id])).rows[0].n);
    expect(await count("experiences")).toBe(2);
    expect(await count("bullets")).toBe(7);
    expect(await count("skill_items")).toBe(12);
    expect(await count("project_technologies")).toBe(3);
    expect(await count("contact_links")).toBe(2);
    const bullet = (await db.query<{ experience_id: string; text: string }>("SELECT experience_id, text FROM bullets WHERE resume_id = $1 ORDER BY experience_id, position LIMIT 1", [r.id])).rows[0];
    expect(bullet.experience_id).toBeTruthy();
  });

  it("enforces constraints in the database itself", async () => {
    const r = await createResume(alice, { name: "A", kind: "master", data: sampleResume() });
    const db = getDb();
    await expect(db.query("INSERT INTO bullets (resume_id, id, position, text) VALUES ($1, 'orphan', 0, 'x')", [r.id])).rejects.toThrow();
    await expect(db.query("UPDATE experiences SET start_date = 'Jan 2020' WHERE resume_id = $1", [r.id])).rejects.toThrow();
    await expect(db.query("UPDATE resume_settings SET template = 'fancy' WHERE resume_id = $1", [r.id])).rejects.toThrow();
  });

  it("cascades deletes to all content tables", async () => {
    const r = await createResume(alice, { name: "A", kind: "master", data: sampleResume() });
    await deleteResume(alice, r.id);
    const n = (await getDb().query<{ n: number }>("SELECT count(*)::int AS n FROM bullets WHERE resume_id = $1", [r.id])).rows[0].n;
    expect(Number(n)).toBe(0);
  });

  it("repairs duplicate client ids instead of failing", async () => {
    const d = sampleResume();
    d.experience[1].id = d.experience[0].id;
    d.experience[1].bullets[0].id = d.experience[0].bullets[0].id;
    const r = await createResume(alice, { name: "A", kind: "master", data: d });
    const back = (await getResume(alice, r.id))!;
    expect(new Set(back.data.experience.map((e) => e.id)).size).toBe(2);
    expect(back.data.experience[1].bullets[0].text).toBe(d.experience[1].bullets[0].text);
  });
});

describe("ownership isolation (repository)", () => {
  it("one user cannot read, change, copy or delete another user's resume", async () => {
    const r = await createResume(alice, { name: "A", kind: "master", data: sampleResume() });
    expect(await getResume(bob, r.id)).toBeNull();
    expect(await listResumes(bob)).toEqual([]);
    await expect(updateResume(bob, r.id, { name: "hacked" }, r.revision)).rejects.toThrow();
    expect(await duplicateResume(bob, r.id)).toBeNull();
    expect(await deleteResume(bob, r.id)).toBe(false);
    expect(await snapshotResume(bob, r.id, "x")).toBe(false);
    expect(await listVersions(bob, r.id)).toEqual([]);
    expect((await getResume(alice, r.id))!.name).toBe("A");
  });
  it("can't link another user's job or parent resume", async () => {
    const job = await createJob(alice, { ...emptyJob, title: "T" });
    expect(await getJob(bob, job.id)).toBeNull();
    await expect(createResume(bob, { name: "B", kind: "master", data: sampleResume(), jobId: job.id })).rejects.toThrow();
  });
  it("deleting a user removes all their data", async () => {
    const r = await createResume(alice, { name: "A", kind: "master", data: sampleResume() });
    await snapshotResume(alice, r.id, "v1");
    await deleteUser(alice);
    expect(await getResume(alice, r.id)).toBeNull();
    const left = (await getDb().query<{ n: number }>("SELECT (SELECT count(*) FROM resumes) + (SELECT count(*) FROM resume_versions) + (SELECT count(*) FROM bullets) AS n")).rows[0].n;
    expect(Number(left)).toBe(0);
  });
});

describe("versioning", () => {
  it("rejects stale writes (optimistic concurrency)", async () => {
    const r = await createResume(alice, { name: "A", kind: "master", data: sampleResume() });
    await updateResume(alice, r.id, { name: "B" }, r.revision);
    await expect(updateResume(alice, r.id, { name: "C" }, r.revision)).rejects.toBeInstanceOf(ConflictError);
  });
  it("tailored copies never modify the master", async () => {
    const master = await createResume(alice, { name: "Master", kind: "master", data: sampleResume() });
    const job = await createJob(alice, emptyJob);
    const copy = (await duplicateResume(alice, master.id, { kind: "tailored", jobId: job.id }))!;
    const d = structuredClone(copy.data);
    d.summary.text = "Changed in the copy";
    d.experience[0].bullets.pop();
    await updateResume(alice, copy.id, { data: d }, copy.revision);
    const m = (await getResume(alice, master.id))!;
    expect(m.data.summary.text).toBe(sampleResume().summary.text);
    expect(m.data.experience[0].bullets).toHaveLength(3);
    const c = (await getResume(alice, copy.id))!;
    expect(c.parentId).toBe(master.id);
    expect(c.kind).toBe("tailored");
    expect(c.jobId).toBe(job.id);
  });
  it("restore snapshots the current state first so it can be undone", async () => {
    const r = await createResume(alice, { name: "A", kind: "master", data: sampleResume() });
    await snapshotResume(alice, r.id, "original");
    const d = structuredClone(r.data);
    d.summary.text = "Edited";
    const r2 = await updateResume(alice, r.id, { data: d }, r.revision);
    const v = (await listVersions(alice, r.id)).find((x) => x.note === "original")!;
    const restored = (await restoreVersion(alice, r.id, v.id))!;
    expect(restored.data.summary.text).toBe(sampleResume().summary.text);
    expect(restored.revision).toBe(r2.revision + 1);
    expect((await listVersions(alice, r.id)).some((x) => x.note.startsWith("Before restoring"))).toBe(true);
  });
});

describe("HTTP API", () => {
  const app = createApp();
  const register = async (email: string) => {
    const agent = request.agent(app);
    const res = await agent.post("/api/auth/register").send({ email, password: "a good password 1", fullName: "Test User", phone: "+91 98765 43210" });
    expect(res.status).toBe(201);
    expect(res.headers["set-cookie"]?.[0]).toMatch(/rb_session=.*HttpOnly/i);
    return agent;
  };

  it("requires a session", async () => {
    expect((await request(app).get("/api/resumes")).status).toBe(401);
    expect((await request(app).get("/api/dashboard")).status).toBe(401);
  });
  it("asks for name and a valid mobile number at sign-up", async () => {
    const missing = await request(app).post("/api/auth/register").send({ email: "nophone@example.com", password: "a good password 1" });
    expect(missing.status).toBe(400);
    const badPhone = await request(app).post("/api/auth/register").send({ email: "badphone@example.com", password: "a good password 1", fullName: "Test User", phone: "call me" });
    expect(badPhone.status).toBe(400);
  });
  it("registers, logs in and out", async () => {
    const a = await register("carol@example.com");
    const me = (await a.get("/api/auth/me")).body.user;
    expect(me).toMatchObject({ email: "carol@example.com", fullName: "Test User", phone: "+91 98765 43210" });
    expect((await a.post("/api/auth/logout")).status).toBe(200);
    expect((await a.get("/api/auth/me")).status).toBe(401);
    const bad = await request(app).post("/api/auth/login").send({ email: "carol@example.com", password: "wrong" });
    expect(bad.status).toBe(401);
    expect((await request.agent(app).post("/api/auth/login").send({ email: "carol@example.com", password: "a good password 1" })).status).toBe(200);
  });
  it("returns 404 for another user's resume and its exports", async () => {
    const owner = await register("dan@example.com");
    const created = await owner.post("/api/resumes").send({ name: "Mine", data: sampleResume() });
    expect(created.status).toBe(201);
    const id = created.body.resume.id;
    const other = await register("eve@example.com");
    expect((await other.get(`/api/resumes/${id}`)).status).toBe(404);
    expect((await other.get(`/api/resumes/${id}/export?format=pdf`)).status).toBe(404);
    expect((await other.delete(`/api/resumes/${id}`)).status).toBe(404);
    expect((await owner.get(`/api/resumes/${id}`)).status).toBe(200);
  });
  it("blocks cross-site state changes", async () => {
    const a = await register("frank@example.com");
    const id = (await a.post("/api/resumes").send({ name: "R" })).body.resume.id;
    const res = await a.delete(`/api/resumes/${id}`).set("Origin", "https://evil.example");
    expect(res.status).toBe(403);
    expect((await a.get(`/api/resumes/${id}`)).status).toBe(200);
  });
  it("rejects a forged session cookie", async () => {
    expect((await request(app).get("/api/resumes").set("Cookie", "rb_session=forged")).status).toBe(401);
  });
  it("validates input and returns 409 on stale revision", async () => {
    const a = await register("grace@example.com");
    const r = (await a.post("/api/resumes").send({ name: "R" })).body.resume;
    const bad = await a.put(`/api/resumes/${r.id}`).send({ baseRevision: r.revision, data: { experience: [{ id: "x", startDate: "January" }] } });
    expect(bad.status).toBe(400);
    expect((await a.put(`/api/resumes/${r.id}`).send({ baseRevision: r.revision, name: "New" })).status).toBe(200);
    expect((await a.put(`/api/resumes/${r.id}`).send({ baseRevision: r.revision, name: "Old" })).status).toBe(409);
  });
  it("exports a real PDF and DOCX for the owner", async () => {
    const a = await register("heidi@example.com");
    const id = (await a.post("/api/resumes").send({ name: "R", data: sampleResume() })).body.resume.id;
    const pdf = await a.get(`/api/resumes/${id}/export?format=pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.headers["content-disposition"]).toContain("Priya_Sharma_Resume.pdf");
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe("%PDF-");
    const v = await a.get(`/api/resumes/${id}/export/validate`);
    expect(v.body.pdf.ok).toBe(true);
    expect(v.body.docx.ok).toBe(true);
  });
  it("serves dashboard and editor payloads", async () => {
    const a = await register("ivan@example.com");
    const id = (await a.post("/api/resumes").send({ name: "R", data: sampleResume() })).body.resume.id;
    const job = (await a.post("/api/jobs").send({ title: "Backend", description: "Requirements:\n- Java and PostgreSQL experience\n- 3+ years of experience" })).body.job;
    const tailored = await a.post(`/api/resumes/${id}/tailor`).send({ jobId: job.id });
    expect(tailored.status).toBe(201);
    const dash = (await a.get("/api/dashboard")).body;
    expect(dash.resumes).toHaveLength(2);
    expect(dash.scores[tailored.body.resume.id].match).toBeGreaterThan(0);
    const ed = (await a.get(`/api/resumes/${tailored.body.resume.id}/editor`)).body;
    expect(ed.parentName).toBe("R");
    expect(ed.jobs[0].id).toBe(job.id);
  });
  it("imports an uploaded PDF without storing it", async () => {
    const a = await register("judy@example.com");
    const id = (await a.post("/api/resumes").send({ name: "R", data: sampleResume() })).body.resume.id;
    const pdf = await a.get(`/api/resumes/${id}/export?format=pdf`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    const imp = await a.post("/api/import").field("mode", "standard").attach("file", pdf.body as Buffer, "resume.pdf");
    expect(imp.status).toBe(200);
    expect(imp.body.structured.data.contact.fullName).toBe("Priya Sharma");
    expect(imp.body.ats.score).toBeGreaterThan(50);
    const junk = await a.post("/api/import").attach("file", Buffer.from("not a resume"), "x.txt");
    expect(junk.status).toBe(422);
  });
  it("account export and deletion", async () => {
    const a = await register("kim@example.com");
    await a.post("/api/resumes").send({ name: "R", data: sampleResume() });
    const exp = await a.get("/api/account");
    expect(JSON.parse(exp.text).resumes).toHaveLength(1);
    expect(exp.text).not.toContain("password");
    expect((await a.delete("/api/account").send({ password: "wrong" })).status).toBe(401);
    expect((await a.delete("/api/account").send({ password: "a good password 1" })).status).toBe(200);
    expect((await a.get("/api/resumes")).status).toBe(401);
  });
});

describe("passwords", () => {
  it("hashes with a salt and verifies", async () => {
    const h1 = await hashPassword("correct horse 1");
    const h2 = await hashPassword("correct horse 1");
    expect(h1).not.toBe(h2);
    expect(await verifyPassword("correct horse 1", h1)).toBe(true);
    expect(await verifyPassword("wrong", h1)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
  it("enforces a minimum strength", () => {
    expect(passwordProblem("short1")).not.toBeNull();
    expect(passwordProblem("onlyletterslong")).not.toBeNull();
    expect(passwordProblem("letters and 1 number")).toBeNull();
  });
});
