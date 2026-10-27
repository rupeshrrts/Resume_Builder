import { Router } from "express";
import { z } from "zod";
import { HttpError, handler, parsePatch, requireUser, user } from "@/http";
import { arrangeJobs, createJob, deleteJob, getJob, listJobs, updateJob } from "@/db/repo";
import { addContact, addEvent, deleteContact, deleteEvent, listContacts, listEvents, upcoming } from "@/db/repo-pipeline";
import { ContactInput, EventInput, JobInput, JobStatus } from "@resume/shared/schema/job";
import { analyzeJob } from "@resume/shared/analysis/jd";

export const jobsRouter = Router();
jobsRouter.use(["/jobs", "/contacts", "/events", "/pipeline"], requireUser);

const notFound = () => new HttpError(404, "Job not found.", "not_found");

jobsRouter.get(
  "/jobs",
  handler(async (req, res) => {
    res.json({ jobs: await listJobs(user(req).id) });
  }),
);

jobsRouter.post(
  "/jobs",
  handler(async (req, res) => {
    const input = JobInput.parse(req.body);
    if (!input.title && input.description) input.title = analyzeJob(input.description).titleGuess;
    res.status(201).json({ job: await createJob(user(req).id, input) });
  }),
);

/** Kanban drag-and-drop: new status and order for the moved cards. */
jobsRouter.put(
  "/jobs/arrange",
  handler(async (req, res) => {
    const { moves } = z.object({ moves: z.array(z.object({ id: z.string().max(60), status: JobStatus, position: z.number().int().min(0).max(1_000_000) })).max(500) }).parse(req.body);
    await arrangeJobs(user(req).id, moves);
    res.json({ jobs: await listJobs(user(req).id) });
  }),
);

jobsRouter.get(
  "/pipeline/upcoming",
  handler(async (req, res) => {
    res.json({ items: await upcoming(user(req).id, 14) });
  }),
);

jobsRouter.get(
  "/jobs/:id",
  handler(async (req, res) => {
    const j = await getJob(user(req).id, String(req.params.id));
    if (!j) throw notFound();
    res.json({ job: j });
  }),
);

/** Job with its contacts and timeline, for the application detail drawer. */
jobsRouter.get(
  "/jobs/:id/details",
  handler(async (req, res) => {
    const u = user(req);
    const id = String(req.params.id);
    const job = await getJob(u.id, id);
    if (!job) throw notFound();
    res.json({ job, contacts: await listContacts(u.id, id), events: await listEvents(u.id, id) });
  }),
);

jobsRouter.put(
  "/jobs/:id",
  handler(async (req, res) => {
    const j = await updateJob(user(req).id, String(req.params.id), parsePatch(JobInput, req.body));
    if (!j) throw notFound();
    res.json({ job: j });
  }),
);

jobsRouter.delete(
  "/jobs/:id",
  handler(async (req, res) => {
    if (!(await deleteJob(user(req).id, String(req.params.id)))) throw notFound();
    res.json({ ok: true });
  }),
);

jobsRouter.post(
  "/jobs/:id/contacts",
  handler(async (req, res) => {
    res.status(201).json({ contact: await addContact(user(req).id, String(req.params.id), ContactInput.parse(req.body)) });
  }),
);

jobsRouter.delete(
  "/contacts/:id",
  handler(async (req, res) => {
    if (!(await deleteContact(user(req).id, String(req.params.id)))) throw new HttpError(404, "Contact not found.", "not_found");
    res.json({ ok: true });
  }),
);

jobsRouter.post(
  "/jobs/:id/events",
  handler(async (req, res) => {
    res.status(201).json({ event: await addEvent(user(req).id, String(req.params.id), EventInput.parse(req.body)) });
  }),
);

jobsRouter.delete(
  "/events/:id",
  handler(async (req, res) => {
    if (!(await deleteEvent(user(req).id, String(req.params.id)))) throw new HttpError(404, "Entry not found.", "not_found");
    res.json({ ok: true });
  }),
);
