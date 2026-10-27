import { Router } from "express";
import { z } from "zod";
import { HttpError, handler, limit, parsePatch, requireUser, user } from "@/http";
import { createDocument, deleteDocument, getDocument, getJob, getResume, listDocuments, updateDocument } from "@/db/repo";
import { DocKind, DocTone, DocumentInput } from "@resume/shared/schema/document";
import { composeDocument } from "@resume/shared/letters";
import { analyzeJob } from "@resume/shared/analysis/jd";
import { AiError, aiAvailable } from "@/ai/client";
import { generateDocument } from "@/ai/tasks";
import { renderLetterDocx, renderLetterPdf } from "@/render/letter";

export const documentsRouter = Router();
documentsRouter.use("/documents", requireUser);

const notFound = () => new HttpError(404, "Document not found.", "not_found");

documentsRouter.get(
  "/documents",
  handler(async (req, res) => {
    const resumeId = typeof req.query.resumeId === "string" ? req.query.resumeId : undefined;
    res.json({ documents: await listDocuments(user(req).id, { resumeId }) });
  }),
);

documentsRouter.post(
  "/documents",
  handler(async (req, res) => {
    res.status(201).json({ document: await createDocument(user(req).id, DocumentInput.parse(req.body)) });
  }),
);

const GenerateBody = z.object({
  kind: DocKind,
  resumeId: z.string().min(1).max(60),
  jobId: z.string().max(60).nullable().optional(),
  role: z.string().trim().max(160).default(""),
  company: z.string().trim().max(160).default(""),
  recipient: z.string().trim().max(120).default(""),
  tone: DocTone.default("professional"),
  facts: z.string().max(2000).default(""),
  useAi: z.boolean().default(true),
});

/**
 * Drafts a document from a resume (and optionally a job). Uses Claude when configured and
 * requested; otherwise the template writer, which only rearranges the resume's own text.
 * Nothing is saved until the user saves it.
 */
documentsRouter.post(
  "/documents/generate",
  handler(async (req, res) => {
    const u = user(req);
    const b = GenerateBody.parse(req.body);
    const resume = await getResume(u.id, b.resumeId);
    if (!resume) throw new HttpError(404, "Resume not found.", "not_found");
    const job = b.jobId ? await getJob(u.id, b.jobId) : null;
    const role = b.role || job?.title || resume.data.contact.headline;
    const company = b.company || job?.company || "";
    if (b.useAi && aiAvailable()) {
      limit(`ai:${u.id}`, 30, 10 * 60 * 1000);
      try {
        const out = await generateDocument({ kind: b.kind, resume: resume.data, jobDescription: job?.description ?? "", role, company, recipient: b.recipient, tone: b.tone, facts: b.facts });
        res.json({ method: "ai", title: out.title, body: out.body, questions: out.questions, warnings: out.guard.warnings });
        return;
      } catch (e) {
        if (!(e instanceof AiError)) throw e;
        const t = composeDocument(b.kind, { resume: resume.data, job: job ? analyzeJob(job.description) : null, role, company, recipient: b.recipient, tone: b.tone });
        res.json({ method: "template", ...t, questions: [], warnings: [], notice: `${e.message} A template draft was used instead.` });
        return;
      }
    }
    const t = composeDocument(b.kind, { resume: resume.data, job: job ? analyzeJob(job.description) : null, role, company, recipient: b.recipient, tone: b.tone });
    res.json({ method: "template", ...t, questions: [], warnings: [] });
  }),
);

documentsRouter.get(
  "/documents/:id",
  handler(async (req, res) => {
    const d = await getDocument(user(req).id, String(req.params.id));
    if (!d) throw notFound();
    res.json({ document: d });
  }),
);

documentsRouter.put(
  "/documents/:id",
  handler(async (req, res) => {
    const d = await updateDocument(user(req).id, String(req.params.id), parsePatch(DocumentInput, req.body));
    if (!d) throw notFound();
    res.json({ document: d });
  }),
);

documentsRouter.delete(
  "/documents/:id",
  handler(async (req, res) => {
    if (!(await deleteDocument(user(req).id, String(req.params.id)))) throw notFound();
    res.json({ ok: true });
  }),
);

/** Cover letters export as PDF/DOCX with the linked resume's letterhead; any document as plain text. */
documentsRouter.get(
  "/documents/:id/export",
  handler(async (req, res) => {
    const u = user(req);
    limit(`export:${u.id}`, 60, 60 * 1000);
    const d = await getDocument(u.id, String(req.params.id));
    if (!d) throw notFound();
    const format = String(req.query.format ?? "pdf");
    const base = (d.title || "Document").normalize("NFKD").replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "_").slice(0, 80) || "Document";
    if (format === "txt") {
      res.set({ "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.txt"`, "Cache-Control": "no-store" }).send(Buffer.from(`﻿${d.body}`, "utf8"));
      return;
    }
    if (format !== "pdf" && format !== "docx") throw new HttpError(400, "Unknown format.", "bad_format");
    const resume = d.resumeId ? await getResume(u.id, d.resumeId) : null;
    if (!resume) throw new HttpError(400, "Link this document to a resume to export it with your letterhead.", "no_resume");
    const letter = { resume: resume.data, settings: resume.settings, body: d.body };
    const body = format === "pdf" ? (await renderLetterPdf(letter)).buffer : await renderLetterDocx(letter);
    res
      .set({
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `${req.query.inline === "1" ? "inline" : "attachment"}; filename="${base}.${format}"`,
        "Cache-Control": "no-store",
      })
      .send(body);
  }),
);
