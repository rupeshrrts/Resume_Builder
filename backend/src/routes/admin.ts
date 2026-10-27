import { createHash, randomBytes } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { HttpError, allowedOrigins, clientIp, handler, limit, requireUser, user } from "@/http";
import {
  adminStats,
  createEmailToken,
  deleteReview,
  findUserIdByEmail,
  getMyReview,
  markEmailVerified,
  publicReviews,
  recordPageView,
  saveReview,
  setReviewFeatured,
} from "@/db/repo-admin";
import { analyticsOn, countEvent, deviceOf, isBot, normalizePath, referrerHost, visitorHash } from "@/analytics";
import { adminEmails, checkSetupCode } from "@/auth/admin";
import { appUrl, emailConfigured } from "@/email";
import { log } from "@/log";

export const adminRouter = Router();

/** Use after requireUser. Non-admins get 404, so the admin area isn't even revealed to exist. */
const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user?.isAdmin) return next(new HttpError(404, "Not found.", "not_found"));
  next();
};

const PageView = z.object({ path: z.string().max(500), referrer: z.string().max(1000).optional().default("") });

/** Page view beacon from the website. Always answers 204, so it never disturbs the page. */
adminRouter.post(
  "/track",
  handler(async (req, res) => {
    res.status(204).end();
    if (!analyticsOn()) return;
    const ua = req.get("user-agent") ?? "";
    if (isBot(ua)) return;
    const parsed = PageView.safeParse(req.body);
    if (!parsed.success) return;
    const path = normalizePath(parsed.data.path);
    if (!path || path.startsWith("/admin") || path.startsWith("/api")) return;
    const ip = clientIp(req);
    try {
      limit(`track:${ip}`, 120, 60 * 1000);
    } catch {
      return;
    }
    const ownHosts = [req.get("x-forwarded-host") ?? "", ...allowedOrigins().map((o) => new URL(o).hostname)].filter(Boolean);
    await recordPageView({ path, visitor: visitorHash(ip, ua), referrer: referrerHost(parsed.data.referrer, ownHosts), device: deviceOf(ua) }).catch((err) =>
      log.warn("page_view_failed", { err }),
    );
  }),
);

/**
 * One-time admin activation without email: the signed-in admin address enters the setup code that
 * the server printed in its own log. That proves control of the server, so the address is trusted.
 */
adminRouter.post(
  "/admin/activate",
  requireUser,
  handler(async (req, res) => {
    const u = user(req);
    if (u.isAdmin) return void res.json({ ok: true });
    if (!adminEmails().includes(u.email.toLowerCase())) throw new HttpError(404, "Not found.", "not_found");
    limit(`admin-activate:${u.id}`, 5, 15 * 60 * 1000);
    limit(`admin-activate-ip:${clientIp(req)}`, 10, 15 * 60 * 1000);
    const { code } = z.object({ code: z.string().max(60) }).parse(req.body);
    if (!checkSetupCode(code)) throw new HttpError(400, "That code isn't right. Copy it again from the server log.", "bad_code");
    await markEmailVerified(u.id);
    log.info("admin_activated", {});
    res.json({ ok: true });
  }),
);

/** A password-reset link for one user, for the owner to send them (WhatsApp, email…). Valid 24 hours. */
adminRouter.post(
  "/admin/reset-link",
  requireUser,
  requireAdmin,
  handler(async (req, res) => {
    limit(`admin-reset:${user(req).id}`, 30, 60 * 60 * 1000);
    const { email } = z.object({ email: z.string().trim().toLowerCase().max(200) }).parse(req.body);
    const userId = await findUserIdByEmail(email);
    if (!userId) throw new HttpError(404, "No account with that email.", "not_found");
    const token = randomBytes(32).toString("base64url");
    await createEmailToken(userId, "reset", createHash("sha256").update(token).digest("hex"), 24 * 60 * 60 * 1000);
    res.json({ link: `${appUrl()}/reset-password?token=${token}`, expiresInHours: 24 });
  }),
);

// ---------- reviews ----------

adminRouter.get(
  "/reviews/mine",
  requireUser,
  handler(async (req, res) => {
    res.json({ review: await getMyReview(user(req).id) });
  }),
);

adminRouter.put(
  "/reviews/mine",
  requireUser,
  handler(async (req, res) => {
    const u = user(req);
    limit(`review:${u.id}`, 10, 60 * 60 * 1000);
    const { rating, comment } = z
      .object({ rating: z.number().int().min(1, "Choose 1 to 5 stars.").max(5), comment: z.string().trim().max(600, "Keep the review under 600 characters.").default("") })
      .parse(req.body);
    const first = !(await getMyReview(u.id));
    await saveReview(u.id, rating, comment.replace(/\s+/g, " "));
    if (first) countEvent("review");
    res.json({ review: await getMyReview(u.id) });
  }),
);

/** Reviews the owner picked for the homepage. Public; first names only. */
adminRouter.get(
  "/reviews/public",
  handler(async (_req, res) => {
    res.set("Cache-Control", "public, max-age=300").json({ reviews: await publicReviews() });
  }),
);

adminRouter.post(
  "/admin/reviews/:id/feature",
  requireUser,
  requireAdmin,
  handler(async (req, res) => {
    const { featured } = z.object({ featured: z.boolean() }).parse(req.body);
    if (!(await setReviewFeatured(String(req.params.id), featured))) throw new HttpError(404, "Review not found.", "not_found");
    res.json({ ok: true });
  }),
);

adminRouter.delete(
  "/admin/reviews/:id",
  requireUser,
  requireAdmin,
  handler(async (req, res) => {
    if (!(await deleteReview(String(req.params.id)))) throw new HttpError(404, "Review not found.", "not_found");
    res.json({ ok: true });
  }),
);

adminRouter.get(
  "/admin/stats",
  requireUser,
  requireAdmin,
  handler(async (req, res) => {
    limit(`admin:${user(req).id}`, 60, 60 * 1000);
    const range = z.enum(["7", "30", "all"]).catch("30").parse(req.query.range);
    res.set("Cache-Control", "no-store").json(await adminStats({ analyticsOn: analyticsOn(), emailOn: emailConfigured() }, range));
  }),
);
