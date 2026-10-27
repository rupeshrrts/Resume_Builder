import { Router } from "express";
import { z } from "zod";
import { HttpError, handler, limit, requireUser, user } from "@/http";
import { getJob, getResume } from "@/db/repo";
import { deleteStory, listStories, saveStory } from "@/db/repo-pipeline";
import { StoryInput } from "@resume/shared/schema/story";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { interviewQuestions, storyCandidates, storyFromBullet } from "@resume/shared/interview";
import { AiError, aiAvailable } from "@/ai/client";
import { draftStar } from "@/ai/tasks";

export const interviewRouter = Router();
interviewRouter.use(["/interview", "/stories"], requireUser);

const notFound = () => new HttpError(404, "Story not found.", "not_found");

/** Likely questions for a resume (and optionally a job), plus bullets worth turning into stories. */
interviewRouter.get(
  "/interview/prep",
  handler(async (req, res) => {
    const u = user(req);
    const resume = await getResume(u.id, String(req.query.resumeId ?? ""));
    if (!resume) throw new HttpError(404, "Resume not found.", "not_found");
    const jobId = typeof req.query.jobId === "string" && req.query.jobId ? req.query.jobId : (resume.jobId ?? null);
    const job = jobId ? await getJob(u.id, jobId) : null;
    if (jobId && !job && req.query.jobId) throw new HttpError(404, "Job not found.", "not_found");
    const analysis = job?.description ? analyzeJob(job.description) : null;
    res.json({
      job: job ? { id: job.id, title: job.title, company: job.company } : null,
      questions: interviewQuestions(resume.data, analysis, { company: job?.company, role: job?.title }),
      candidates: storyCandidates(resume.data, analysis),
    });
  }),
);

const DraftBody = z.object({
  bullet: z.string().trim().min(3).max(600),
  where: z.string().max(160).default(""),
  notes: z.string().max(2000).default(""),
  useAi: z.boolean().default(false),
});

/** A STAR skeleton from a bullet: template split by default, Claude when asked and configured. */
interviewRouter.post(
  "/interview/star",
  handler(async (req, res) => {
    const u = user(req);
    const b = DraftBody.parse(req.body);
    const base = storyFromBullet(b.bullet, b.where);
    if (b.useAi && aiAvailable()) {
      limit(`ai:${u.id}`, 30, 10 * 60 * 1000);
      try {
        const out = await draftStar({ bullet: b.bullet, context: b.where, notes: b.notes });
        res.json({ method: "ai", story: { ...base, situation: out.situation, task: out.task, action: out.action, result: out.result }, questions: out.questions, warnings: out.guard.warnings });
        return;
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        res.json({ method: "template", story: base, questions: [], warnings: [], notice: `${e.message} A template draft was used instead.` });
        return;
      }
    }
    res.json({ method: "template", story: base, questions: [], warnings: [] });
  }),
);

interviewRouter.get(
  "/stories",
  handler(async (req, res) => {
    res.json({ stories: await listStories(user(req).id) });
  }),
);

interviewRouter.post(
  "/stories",
  handler(async (req, res) => {
    res.status(201).json({ story: await saveStory(user(req).id, StoryInput.parse(req.body)) });
  }),
);

interviewRouter.put(
  "/stories/:id",
  handler(async (req, res) => {
    res.json({ story: await saveStory(user(req).id, StoryInput.parse(req.body), String(req.params.id)) });
  }),
);

interviewRouter.delete(
  "/stories/:id",
  handler(async (req, res) => {
    if (!(await deleteStory(user(req).id, String(req.params.id)))) throw notFound();
    res.json({ ok: true });
  }),
);
