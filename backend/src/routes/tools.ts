import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { HttpError, handler, limit, requireUser, user } from "@/http";
import JSZip from "jszip";
import { MAX_UPLOAD_BYTES, UploadError, extractFile, sniffFormat } from "@/parse/extract";
import { isLinkedInExport, parseLinkedInExport } from "@/parse/linkedin";
import { structureResume } from "@/parse/structure";
import { checkSpelling } from "@/analysis/spelling";
import { AiError, aiAvailable, aiStatus } from "@/ai/client";
import { aiStructure, bulletsFromNotes, generateSummary, overlappingJobTerms, rewriteBullet } from "@/ai/tasks";
import { getJob } from "@/db/repo";
import { log } from "@/log";
import { checkAts } from "@resume/shared/analysis/ats";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { Market, ResumeData, ResumeSettings, defaultSettings } from "@resume/shared/schema/resume";
import type { ImportResponse } from "@resume/shared/types/api";

export const toolsRouter = Router();
toolsRouter.use(["/import", "/analyze", "/ai"], requireUser);

// Uploads stay in memory and are never written to disk.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 } });

/** Parses an uploaded resume and returns structured sections plus an ATS report. Nothing is saved. */
toolsRouter.post(
  "/import",
  (req, res, next) => {
    try {
      limit(`import:${user(req).id}`, 20, 60 * 60 * 1000);
    } catch (e) {
      return next(e);
    }
    upload.single("file")(req, res, (err) => {
      if (err && (err as { code?: string }).code === "LIMIT_FILE_SIZE") return next(new HttpError(413, `The file is larger than ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`, "too_large"));
      next(err);
    });
  },
  handler(async (req, res) => {
    const u = user(req);
    if (!req.file) throw new HttpError(400, "Upload a PDF, DOCX or LinkedIn export ZIP.", "no_file");
    const mode = req.body?.mode === "ai" ? "ai" : "standard";
    const buf = new Uint8Array(req.file.buffer);
    const fileName = Buffer.from(req.file.originalname, "latin1").toString("utf8").slice(0, 120);

    // A ZIP that isn't a Word document may be LinkedIn's data export.
    if (sniffFormat(buf) === "docx") {
      const zip = await JSZip.loadAsync(buf).catch(() => null);
      if (zip && !zip.file("word/document.xml") && isLinkedInExport(zip)) {
        let li;
        try {
          li = await parseLinkedInExport(zip);
        } catch (e) {
          if (e instanceof UploadError) throw new HttpError(422, e.message, e.code);
          throw e;
        }
        const body: ImportResponse = {
          method: "standard",
          fileName,
          extraction: { format: "linkedin", layout: null, text: li.text, warnings: [] },
          structured: { data: li.data, warnings: li.warnings, skipped: li.skipped, unplaced: [], dropped: [] },
          ats: checkAts(li.data, defaultSettings()),
          notes: [`Read from your LinkedIn data export: ${li.found.join(", ")}.`],
        };
        res.json(body);
        return;
      }
    }

    let ex;
    try {
      ex = await extractFile(buf);
    } catch (e) {
      if (e instanceof UploadError) throw new HttpError(422, e.message, e.code);
      log.warn("import_extract_failed", { userId: u.id, err: e });
      throw new HttpError(422, "This file couldn't be read. It may be damaged. Try saving it again as PDF or DOCX.", "unreadable");
    }
    let structured = structureResume(ex.lines, ex.links);
    let dropped: string[] = [];
    let method: "standard" | "ai" = "standard";
    const notes: string[] = [];
    if (mode === "ai" && !ex.layout.imageOnly) {
      if (!aiAvailable()) notes.push("AI-assisted reading isn't available right now, so standard reading was used.");
      else {
        try {
          const ai = await aiStructure(ex.text);
          structured = {
            data: ai.data,
            warnings: ai.skippedPersonal.length ? [`Not imported (personal details): ${ai.skippedPersonal.join(", ")}.`] : [],
            skipped: ai.skippedPersonal.length ? [{ title: "Personal details", lines: ai.skippedPersonal }] : [],
            unplaced: [],
          };
          dropped = ai.dropped;
          method = "ai";
        } catch (e) {
          notes.push(e instanceof AiError ? `${e.message} Standard parsing was used instead.` : "AI-assisted import failed, so standard parsing was used.");
        }
      }
    }
    const body: ImportResponse = {
      method,
      fileName,
      extraction: { format: ex.format, layout: ex.layout, text: ex.text, warnings: ex.warnings },
      structured: { ...structured, dropped },
      ats: checkAts(structured.data, defaultSettings(), { layout: ex.layout }),
      notes,
    };
    res.json(body);
  }),
);

toolsRouter.post(
  "/analyze/spelling",
  handler(async (req, res) => {
    limit(`spell:${user(req).id}`, 120, 60 * 1000);
    const { data, market } = z.object({ data: ResumeData, market: Market.default("IN") }).parse(req.body);
    res.json({ issues: await checkSpelling(data, market) });
  }),
);

toolsRouter.get(
  "/ai/status",
  handler(async (_req, res) => {
    res.json(aiStatus());
  }),
);

const aiError = (e: unknown) => (e instanceof AiError ? new HttpError(e.status, e.message, e.code) : e);

toolsRouter.post(
  "/ai/bullet",
  handler(async (req, res) => {
    const u = user(req);
    limit(`ai:${u.id}`, 30, 10 * 60 * 1000);
    const body = z
      .object({
        data: ResumeData,
        bulletId: z.string().min(1).max(40),
        jobId: z.string().max(60).nullable().optional(),
        style: ResumeSettings.shape.writingStyle,
        facts: z.string().max(2000).default(""),
      })
      .parse(req.body);
    const d = body.data;
    let found: { text: string; context: string; siblings: string[] } | null = null;
    for (const e of d.experience) {
      const b = e.bullets.find((x) => x.id === body.bulletId);
      if (b) found = { text: b.text, context: `${e.title} at ${e.company}${e.current ? " (current role)" : ""}`, siblings: e.bullets.filter((x) => x !== b).map((x) => x.text) };
    }
    for (const p of d.projects) {
      const b = p.bullets.find((x) => x.id === body.bulletId);
      if (b) found = { text: b.text, context: `Project: ${p.name}${p.technologies.length ? ` (technologies: ${p.technologies.join(", ")})` : ""}`, siblings: p.bullets.filter((x) => x !== b).map((x) => x.text) };
    }
    for (const s of [...d.education.map((e) => ({ t: `Education: ${e.degree} at ${e.institution}`, bullets: e.bullets })), ...d.additional.map((a) => ({ t: a.title, bullets: a.bullets }))]) {
      const b = s.bullets.find((x) => x.id === body.bulletId);
      if (b) found = { text: b.text, context: s.t, siblings: s.bullets.filter((x) => x !== b).map((x) => x.text) };
    }
    if (!found || !found.text.trim()) throw new HttpError(400, "Write something in the bullet first, then ask for improvements.", "empty_bullet");
    const job = body.jobId ? await getJob(u.id, body.jobId) : null;
    const jobTerms = job ? overlappingJobTerms(d, analyzeJob(job.description).skills) : [];
    try {
      res.json(await rewriteBullet({ bullet: found.text, context: found.context, siblings: found.siblings, resume: d, jobTerms, preferredStyle: body.style, facts: body.facts }));
    } catch (e) {
      throw aiError(e);
    }
  }),
);

toolsRouter.post(
  "/ai/bullets-from-notes",
  handler(async (req, res) => {
    const u = user(req);
    limit(`ai:${u.id}`, 30, 10 * 60 * 1000);
    const body = z
      .object({
        notes: z.string().trim().min(10, "Write a few words about what you did.").max(3000),
        context: z.string().max(300).default(""),
        current: z.boolean().default(false),
        style: ResumeSettings.shape.writingStyle,
      })
      .parse(req.body);
    try {
      res.json(await bulletsFromNotes(body));
    } catch (e) {
      throw aiError(e);
    }
  }),
);

toolsRouter.post(
  "/ai/summary",
  handler(async (req, res) => {
    const u = user(req);
    limit(`ai:${u.id}`, 30, 10 * 60 * 1000);
    const body = z
      .object({
        data: ResumeData,
        jobId: z.string().max(60).nullable().optional(),
        targetRole: z.string().max(120).default(""),
        style: ResumeSettings.shape.writingStyle,
        facts: z.string().max(2000).default(""),
      })
      .parse(req.body);
    const job = body.jobId ? await getJob(u.id, body.jobId) : null;
    const analysis = job ? analyzeJob(job.description) : null;
    const jobFocus = analysis ? overlappingJobTerms(body.data, analysis.skills.filter((s) => s.importance !== "preferred")) : [];
    try {
      res.json(await generateSummary({ resume: body.data, targetRole: body.targetRole || job?.title || body.data.contact.headline, jobFocus, style: body.style, facts: body.facts }));
    } catch (e) {
      throw aiError(e);
    }
  }),
);
