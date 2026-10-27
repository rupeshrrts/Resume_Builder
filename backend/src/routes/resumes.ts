import { Router } from "express";
import { z } from "zod";
import { HttpError, handler, limit, pickSent, requireUser, user } from "@/http";
import { countEvent } from "@/analytics";
import {
  createResume,
  deleteResume,
  duplicateResume,
  getJob,
  getResume,
  getVersion,
  listJobs,
  listResumes,
  listVersions,
  restoreVersion,
  snapshotResume,
  updateResume,
} from "@/db/repo";
import { ResumeData, ResumeSettings, defaultSettings, emptyResume, newId } from "@resume/shared/schema/resume";
import { PRESETS, presetSettings, templateDefaults } from "@resume/shared/render/templates";
import { buildDocument } from "@resume/shared/render/model";
import { renderText } from "@resume/shared/render/text";
import { renderMarkdown } from "@resume/shared/render/markdown";
import { toJsonResume } from "@resume/shared/render/jsonresume";
import { scoreResume } from "@resume/shared/analysis/quality";
import type { DashboardPayload, EditorPayload, ResumeScore } from "@resume/shared/types/api";
import { renderPdf } from "@/render/pdf";
import { renderDocx } from "@/render/docx";
import { validateDocx, validatePdf } from "@/render/validate";
import { aiStatus } from "@/ai/client";

export const resumesRouter = Router();
resumesRouter.use(["/resumes", "/dashboard"], requireUser);

const notFound = () => new HttpError(404, "Resume not found.", "not_found");

/** Everything the dashboard needs in one request, scored with the same rules as the editor. */
resumesRouter.get(
  "/dashboard",
  handler(async (req, res) => {
    const u = user(req);
    const [resumes, jobs] = await Promise.all([listResumes(u.id), listJobs(u.id)]);
    const scores: Record<string, ResumeScore> = {};
    for (const s of resumes) {
      const r = await getResume(u.id, s.id);
      if (!r) continue;
      const job = r.jobId ? jobs.find((j) => j.id === r.jobId) : null;
      const q = scoreResume(r.data, r.settings, { jobDescription: job?.description ?? null });
      scores[s.id] = { overall: q.overall, match: q.match?.score ?? null, ats: q.ats.score, name: r.data.contact.fullName, headline: r.data.contact.headline, template: r.settings.template };
    }
    const body: DashboardPayload = { user: u, resumes, jobs, scores, ai: aiStatus() };
    res.json(body);
  }),
);

resumesRouter.get(
  "/resumes",
  handler(async (req, res) => {
    res.json({ resumes: await listResumes(user(req).id) });
  }),
);

const CreateBody = z.object({
  name: z.string().trim().max(120).default("My resume"),
  presetId: z.string().max(40).optional(),
  data: ResumeData.optional(),
  settings: ResumeSettings.partial().optional(),
  jobId: z.string().max(60).nullable().optional(),
});

resumesRouter.post(
  "/resumes",
  handler(async (req, res) => {
    const body = CreateBody.parse(req.body);
    // Only settings the client chose; schema defaults must not override the template's own.
    if (body.settings) body.settings = pickSent(body.settings, req.body?.settings);
    const preset = PRESETS.find((p) => p.id === body.presetId);
    const data = body.data ?? emptyResume();
    if (!body.data && preset) data.skills = preset.skillCategories.map((c) => ({ id: newId("sk"), category: c, items: [] }));
    const template = body.settings?.template ?? preset?.template ?? "professional";
    const settings = defaultSettings({ ...templateDefaults(template), ...(preset ? presetSettings(preset) : {}), ...body.settings });
    res.status(201).json({ resume: await createResume(user(req).id, { name: body.name || "My resume", kind: "master", data, settings, jobId: body.jobId ?? null }) });
    countEvent("resume_created");
  }),
);

resumesRouter.get(
  "/resumes/:id",
  handler(async (req, res) => {
    const r = await getResume(user(req).id, String(req.params.id));
    if (!r) throw notFound();
    res.json({ resume: r });
  }),
);

/** Resume + jobs + AI status for the editor page. */
resumesRouter.get(
  "/resumes/:id/editor",
  handler(async (req, res) => {
    const u = user(req);
    const r = await getResume(u.id, String(req.params.id));
    if (!r) throw notFound();
    const parent = r.parentId ? await getResume(u.id, r.parentId) : null;
    const body: EditorPayload = { resume: r, parentName: parent?.name ?? null, jobs: await listJobs(u.id), ai: aiStatus() };
    res.json(body);
  }),
);

const UpdateBody = z.object({
  baseRevision: z.number().int().positive(),
  name: z.string().trim().max(120).optional(),
  data: ResumeData.optional(),
  settings: ResumeSettings.optional(),
  jobId: z.string().max(60).nullable().optional(),
  snapshotNote: z.string().max(200).optional(),
});

resumesRouter.put(
  "/resumes/:id",
  handler(async (req, res) => {
    const u = user(req);
    const id = String(req.params.id);
    const body = UpdateBody.parse(req.body);
    if (!(await getResume(u.id, id))) throw notFound();
    const r = await updateResume(u.id, id, { name: body.name, data: body.data, settings: body.settings, jobId: body.jobId }, body.baseRevision, body.snapshotNote);
    res.json({ resume: r });
  }),
);

resumesRouter.delete(
  "/resumes/:id",
  handler(async (req, res) => {
    if (!(await deleteResume(user(req).id, String(req.params.id)))) throw notFound();
    res.json({ ok: true });
  }),
);

resumesRouter.post(
  "/resumes/:id/duplicate",
  handler(async (req, res) => {
    const { name } = z.object({ name: z.string().trim().max(120).optional() }).parse(req.body ?? {});
    const r = await duplicateResume(user(req).id, String(req.params.id), { name });
    if (!r) throw notFound();
    res.status(201).json({ resume: r });
  }),
);

/** Tailored copy linked to a job. The source (usually the master) is never modified. */
resumesRouter.post(
  "/resumes/:id/tailor",
  handler(async (req, res) => {
    const u = user(req);
    const body = z.object({ jobId: z.string().min(1).max(60), name: z.string().trim().max(120).optional() }).parse(req.body);
    const src = await getResume(u.id, String(req.params.id));
    if (!src) throw notFound();
    const job = await getJob(u.id, body.jobId);
    if (!job) throw new HttpError(404, "Job not found.", "not_found");
    const label = [job.title, job.company].filter(Boolean).join(" – ") || "Tailored";
    const r = await duplicateResume(u.id, src.id, { name: body.name || `${src.name} · ${label}`.slice(0, 120), kind: "tailored", jobId: job.id });
    res.status(201).json({ resume: r });
  }),
);

// ---------- versions ----------

resumesRouter.get(
  "/resumes/:id/versions",
  handler(async (req, res) => {
    const u = user(req);
    const id = String(req.params.id);
    if (!(await getResume(u.id, id))) throw notFound();
    res.json({ versions: await listVersions(u.id, id) });
  }),
);

resumesRouter.post(
  "/resumes/:id/versions",
  handler(async (req, res) => {
    const u = user(req);
    const id = String(req.params.id);
    const { note } = z.object({ note: z.string().trim().max(200).default("Saved version") }).parse(req.body ?? {});
    if (!(await snapshotResume(u.id, id, note || "Saved version"))) throw notFound();
    res.status(201).json({ versions: await listVersions(u.id, id) });
  }),
);

resumesRouter.get(
  "/resumes/:id/versions/:vid",
  handler(async (req, res) => {
    const v = await getVersion(user(req).id, String(req.params.id), String(req.params.vid));
    if (!v) throw new HttpError(404, "Version not found.", "not_found");
    res.json({ version: v });
  }),
);

resumesRouter.post(
  "/resumes/:id/versions/:vid",
  handler(async (req, res) => {
    const r = await restoreVersion(user(req).id, String(req.params.id), String(req.params.vid));
    if (!r) throw new HttpError(404, "Version not found.", "not_found");
    res.json({ resume: r });
  }),
);

// ---------- export ----------

const TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
} as const;

function fileName(name: string, person: string, ext: string) {
  const base = (person ? `${person} Resume` : name).normalize("NFKD").replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "_") || "Resume";
  return `${base.slice(0, 80)}.${ext}`;
}

resumesRouter.get(
  "/resumes/:id/export",
  handler(async (req, res) => {
    const u = user(req);
    limit(`export:${u.id}`, 60, 60 * 1000);
    const r = await getResume(u.id, String(req.params.id));
    if (!r) throw notFound();
    const format = String(req.query.format ?? "pdf");
    if (!(format in TYPES)) throw new HttpError(400, "Unknown format.", "bad_format");
    const doc = buildDocument(r.data, r.settings);
    let body: Buffer;
    if (format === "pdf") body = (await renderPdf(doc)).buffer;
    else if (format === "docx") body = await renderDocx(doc);
    else if (format === "md") body = Buffer.from(renderMarkdown(doc), "utf8");
    else if (format === "json") body = Buffer.from(JSON.stringify(toJsonResume(r.data), null, 2), "utf8");
    // UTF-8 with a BOM so older Windows tools don't misread dashes and accented names.
    else body = Buffer.from(`﻿${renderText(doc)}`, "utf8");
    res
      .set({
        "Content-Type": TYPES[format as keyof typeof TYPES],
        "Content-Disposition": `${req.query.inline === "1" ? "inline" : "attachment"}; filename="${fileName(r.name, r.data.contact.fullName, format)}"`,
        "Cache-Control": "no-store",
      })
      .send(body);
    // The live preview loads the same PDF inline; only real downloads are counted.
    if (req.query.inline !== "1") countEvent(`download_${format}`);
  }),
);

/** Generates PDF and DOCX, re-opens both and reports what a parser can read back. */
resumesRouter.get(
  "/resumes/:id/export/validate",
  handler(async (req, res) => {
    const u = user(req);
    limit(`validate:${u.id}`, 30, 60 * 1000);
    const r = await getResume(u.id, String(req.params.id));
    if (!r) throw notFound();
    const doc = buildDocument(r.data, r.settings);
    const [{ buffer, replaced }, docx] = await Promise.all([renderPdf(doc), renderDocx(doc)]);
    const [pdf, word] = await Promise.all([validatePdf(buffer, doc, replaced), validateDocx(docx, doc)]);
    res.json({ revision: r.revision, pdf, docx: word, text: renderText(doc) });
  }),
);
