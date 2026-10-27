import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { HttpError, clientIp, handler, limit, requireUser, user } from "@/http";
import { getResume } from "@/db/repo";
import { createShare, findShare, listShares, recordShareView, revokeShare } from "@/db/repo-pipeline";
import { hashPassword, verifyPassword } from "@/auth/password";
import { ShareInput } from "@resume/shared/schema/story";
import { buildDocument } from "@resume/shared/render/model";
import type { ResumeData } from "@resume/shared/schema/resume";
import { renderPdf } from "@/render/pdf";

/**
 * Read-only share links for a resume. The link token is shown once and only its hash is
 * stored; links can expire, be revoked, and carry an optional password. The public side
 * serves resume content only, never the owner's account, jobs or AI provenance.
 */
export const shareRouter = Router();
shareRouter.use(["/shares"], requireUser);

// ---------- owner side ----------

shareRouter.get(
  "/resumes/:id/shares",
  requireUser,
  handler(async (req, res) => {
    res.json({ links: await listShares(user(req).id, String(req.params.id)) });
  }),
);

shareRouter.post(
  "/resumes/:id/shares",
  requireUser,
  handler(async (req, res) => {
    const u = user(req);
    limit(`share:${u.id}`, 30, 60 * 60 * 1000);
    const input = ShareInput.parse(req.body ?? {});
    if (input.password && input.password.length < 6) throw new HttpError(400, "Use a share password of at least 6 characters, or none.", "weak_password");
    const { link, token } = await createShare(u.id, String(req.params.id), input.password ? await hashPassword(input.password) : null, input.expiresInDays);
    res.status(201).json({ link, token, path: `/r/${token}` });
  }),
);

shareRouter.delete(
  "/shares/:id",
  handler(async (req, res) => {
    if (!(await revokeShare(user(req).id, String(req.params.id)))) throw new HttpError(404, "Link not found.", "not_found");
    res.json({ ok: true });
  }),
);

// ---------- public side ----------

const unlockValue = (token: string, passwordHash: string) => createHash("sha256").update(`${token}:${passwordHash}`).digest("base64url");
const cookieName = (shareId: string) => `rb_share_${shareId.slice(0, 8)}`;

/** Live link, and whether the viewer has unlocked it (when it has a password). */
async function openShare(req: Request, res: Response) {
  res.set({ "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  const token = String(req.params.token);
  const share = await findShare(token);
  if (!share) throw new HttpError(404, "This link doesn't exist, has expired, or was turned off by its owner.", "not_found");
  let unlocked = !share.passwordHash;
  if (share.passwordHash) {
    const got = Buffer.from(String(req.cookies?.[cookieName(share.id)] ?? ""));
    const want = Buffer.from(unlockValue(token, share.passwordHash));
    unlocked = got.length === want.length && timingSafeEqual(got, want);
  }
  return { share, token, unlocked };
}

/** Removes fields that are about how the text was written, not the resume itself. */
function publicData(d: ResumeData): ResumeData {
  const strip = <T extends { sourceText?: string; origin?: string }>(b: T) => ({ ...b, sourceText: undefined, origin: "user" as const });
  return {
    ...d,
    summary: { text: d.summary.text, origin: "user" },
    experience: d.experience.map((e) => ({ ...e, bullets: e.bullets.map(strip) })),
    education: d.education.map((e) => ({ ...e, bullets: e.bullets.map(strip) })),
    projects: d.projects.map((p) => ({ ...p, bullets: p.bullets.map(strip) })),
    additional: d.additional.map((a) => ({ ...a, bullets: a.bullets.map(strip) })),
  };
}

shareRouter.get(
  "/public/r/:token",
  handler(async (req, res) => {
    limit(`public:${clientIp(req)}`, 120, 60 * 1000);
    const { share, unlocked } = await openShare(req, res);
    if (!unlocked) {
      res.status(401).json({ error: "This resume is password-protected.", code: "password_required" });
      return;
    }
    const r = await getResume(share.userId, share.resumeId);
    if (!r) throw new HttpError(404, "This resume is no longer available.", "not_found");
    await recordShareView(share.id);
    res.json({ name: r.data.contact.fullName || r.name, data: publicData(r.data), settings: r.settings });
  }),
);

shareRouter.post(
  "/public/r/:token/unlock",
  handler(async (req, res) => {
    limit(`unlock:${clientIp(req)}:${String(req.params.token).slice(0, 12)}`, 10, 15 * 60 * 1000);
    const { share, token } = await openShare(req, res);
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    if (!share.passwordHash) {
      res.json({ ok: true });
      return;
    }
    if (!(await verifyPassword(password, share.passwordHash))) throw new HttpError(401, "That password isn't right.", "bad_password");
    res.cookie(cookieName(share.id), unlockValue(token, share.passwordHash), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
      path: "/",
    });
    res.json({ ok: true });
  }),
);

shareRouter.get(
  "/public/r/:token/pdf",
  handler(async (req, res) => {
    limit(`public-pdf:${clientIp(req)}`, 20, 60 * 1000);
    const { share, unlocked } = await openShare(req, res);
    if (!unlocked) throw new HttpError(401, "This resume is password-protected.", "password_required");
    const r = await getResume(share.userId, share.resumeId);
    if (!r) throw new HttpError(404, "This resume is no longer available.", "not_found");
    const { buffer } = await renderPdf(buildDocument(r.data, r.settings));
    const base = (r.data.contact.fullName ? `${r.data.contact.fullName} Resume` : "Resume").normalize("NFKD").replace(/[^\w\s.-]/g, "").trim().replace(/\s+/g, "_");
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `${req.query.inline === "1" ? "inline" : "attachment"}; filename="${base}.pdf"` }).send(buffer);
  }),
);
