import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { useTestDb } from "./helpers";

const app = createApp();

async function signedIn(email: string) {
  const a = request.agent(app);
  await a.post("/api/auth/register").send({ email, password: "a good password 1", fullName: "Test User", phone: "+91 98765 43210" });
  return a;
}

const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

beforeEach(async () => {
  await useTestDb();
});

describe("application pipeline", () => {
  it("moves cards between stages, keeps their order, and stamps the applied date", async () => {
    const a = await signedIn("pipe1@example.com");
    const j1 = (await a.post("/api/jobs").send({ title: "Backend Engineer", company: "Acme", location: "Pune" })).body.job;
    const j2 = (await a.post("/api/jobs").send({ title: "Platform Engineer", company: "Globex" })).body.job;
    expect(j1.status).toBe("saved");
    expect(j1.location).toBe("Pune");
    expect(j1.appliedAt).toBe("");

    const r = await a.put("/api/jobs/arrange").send({
      moves: [
        { id: j2.id, status: "applied", position: 0 },
        { id: j1.id, status: "applied", position: 1 },
      ],
    });
    expect(r.status).toBe(200);
    const applied = r.body.jobs.filter((j: { status: string }) => j.status === "applied");
    expect(applied.map((j: { id: string }) => j.id)).toEqual([j2.id, j1.id]);
    expect(applied[0].appliedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // An existing applied date is never overwritten by a later move.
    await a.put(`/api/jobs/${j1.id}`).send({ appliedAt: "2026-01-05" });
    await a.put("/api/jobs/arrange").send({ moves: [{ id: j1.id, status: "interviewing", position: 0 }] });
    await a.put("/api/jobs/arrange").send({ moves: [{ id: j1.id, status: "applied", position: 0 }] });
    expect((await a.get(`/api/jobs/${j1.id}`)).body.job.appliedAt).toBe("2026-01-05");
  });

  it("a partial update changes only the fields sent", async () => {
    const a = await signedIn("pipe6@example.com");
    const j = (await a.post("/api/jobs").send({ title: "Backend Engineer", company: "Acme", description: "Build APIs in Java.", status: "interviewing", notes: "Referred" })).body.job;
    const upd = (await a.put(`/api/jobs/${j.id}`).send({ location: "Pune", followUpOn: "2026-11-02" })).body.job;
    expect(upd).toMatchObject({ location: "Pune", followUpOn: "2026-11-02", status: "interviewing", description: "Build APIs in Java.", notes: "Referred", company: "Acme" });
  });

  it("rejects unknown stages", async () => {
    const a = await signedIn("pipe2@example.com");
    const j = (await a.post("/api/jobs").send({ title: "X" })).body.job;
    expect((await a.put("/api/jobs/arrange").send({ moves: [{ id: j.id, status: "hired", position: 0 }] })).status).toBe(400);
  });

  it("stores contacts and a timeline per job, and lists upcoming follow-ups and interviews", async () => {
    const a = await signedIn("pipe3@example.com");
    const job = (await a.post("/api/jobs").send({ title: "Data Engineer", company: "Initech", followUpOn: isoIn(3) })).body.job;
    const later = (await a.post("/api/jobs").send({ title: "Far away", company: "Hooli", followUpOn: isoIn(60) })).body.job;
    expect(job.followUpOn).toBe(isoIn(3));

    const c = await a.post(`/api/jobs/${job.id}/contacts`).send({ name: "Meera Iyer", role: "Recruiter", email: "meera@example.com" });
    expect(c.status).toBe(201);
    expect(c.body.contact.name).toBe("Meera Iyer");

    const e = await a.post(`/api/jobs/${job.id}/events`).send({ kind: "interview", title: "Technical round", happensOn: isoIn(5) });
    expect(e.status).toBe(201);
    await a.post(`/api/jobs/${job.id}/events`).send({ kind: "note", body: "Referred by Arjun." });

    const d = (await a.get(`/api/jobs/${job.id}/details`)).body;
    expect(d.contacts).toHaveLength(1);
    expect(d.events).toHaveLength(2);
    expect(d.events.map((x: { kind: string }) => x.kind)).toContain("interview");

    const up = (await a.get("/api/pipeline/upcoming")).body.items;
    expect(up).toEqual([
      { kind: "follow_up", jobId: job.id, title: "Data Engineer", company: "Initech", on: isoIn(3) },
      { kind: "interview", jobId: job.id, title: "Technical round", company: "Initech", on: isoIn(5) },
    ]);
    expect(up.find((u: { jobId: string }) => u.jobId === later.id)).toBeUndefined();

    expect((await a.delete(`/api/contacts/${c.body.contact.id}`)).status).toBe(200);
    expect((await a.delete(`/api/events/${e.body.event.id}`)).status).toBe(200);
    const after = (await a.get(`/api/jobs/${job.id}/details`)).body;
    expect(after.contacts).toHaveLength(0);
    expect(after.events).toHaveLength(1);

    // Deleting the job removes its contacts and timeline with it.
    await a.delete(`/api/jobs/${job.id}`);
    expect((await a.get(`/api/jobs/${job.id}/details`)).status).toBe(404);
  });

  it("keeps another user's pipeline out of reach", async () => {
    const owner = await signedIn("pipe4@example.com");
    const job = (await owner.post("/api/jobs").send({ title: "Mine", followUpOn: isoIn(1) })).body.job;
    const contact = (await owner.post(`/api/jobs/${job.id}/contacts`).send({ name: "Private Person" })).body.contact;
    const event = (await owner.post(`/api/jobs/${job.id}/events`).send({ kind: "note", body: "secret" })).body.event;

    const other = await signedIn("pipe5@example.com");
    expect((await other.get(`/api/jobs/${job.id}/details`)).status).toBe(404);
    expect((await other.post(`/api/jobs/${job.id}/contacts`).send({ name: "Intruder" })).status).toBe(404);
    expect((await other.post(`/api/jobs/${job.id}/events`).send({ kind: "note", body: "x" })).status).toBe(404);
    expect((await other.delete(`/api/contacts/${contact.id}`)).status).toBe(404);
    expect((await other.delete(`/api/events/${event.id}`)).status).toBe(404);
    expect((await other.get("/api/pipeline/upcoming")).body.items).toEqual([]);

    // Arranging someone else's card is a silent no-op, never a move.
    await other.put("/api/jobs/arrange").send({ moves: [{ id: job.id, status: "offer", position: 0 }] });
    expect((await owner.get(`/api/jobs/${job.id}`)).body.job.status).toBe("saved");
  });

  it("requires sign-in", async () => {
    expect((await request(app).get("/api/pipeline/upcoming")).status).toBe(401);
    expect((await request(app).put("/api/jobs/arrange").send({ moves: [] })).status).toBe(401);
  });
});
