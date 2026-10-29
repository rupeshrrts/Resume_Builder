import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { consumeEmailToken, createEmailToken, findRecovery, markEmailVerified, setPassword, setRecoveryHash } from "@/db/repo-admin";
import { adminEmails, checkSetupCode, hashCode, normalizeCode, randomCode } from "@/auth/admin";
import { appUrl, emailConfigured, linkEmail, sendEmail } from "@/email";
import { countEvent } from "@/analytics";
import { log } from "@/log";
import { HttpError, clientIp, handler, limit, requireUser, user } from "@/http";
import { hashPassword, passwordProblem, verifyPassword } from "@/auth/password";
import { createUser, deleteUser, exportUserData, findUserByEmail, findUserById } from "@/db/repo";
import { endSession, startSession } from "@/auth/session";
import { exportPipelineData } from "@/db/repo-pipeline";

export const authRouter = Router();

const Credentials = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) });

/** Sign-up details: name and mobile number besides email and password. */
const Registration = Credentials.extend({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120),
  // Digits with an optional leading +, spaces or dashes: "+91 98765 43210", "098765-43210".
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((p) => /^\+?[\d\s-]+$/.test(p) && (p.match(/\d/g)?.length ?? 0) >= 7 && (p.match(/\d/g)?.length ?? 0) <= 15, "Enter a valid mobile number, e.g. +91 98765 43210."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200),
});

authRouter.post(
  "/auth/register",
  handler(async (req, res) => {
    limit(`register:${clientIp(req)}`, 5, 60 * 60 * 1000);
    const { email, password, fullName, phone } = Registration.parse(req.body);
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem, "weak_password");
    if (await findUserByEmail(email)) throw new HttpError(409, "An account with this email already exists. Sign in instead.", "exists");
    const u = await createUser(email, await hashPassword(password), { fullName, phone: phone.replace(/\s+/g, " ") });
    // Shown once: lets the user reset a forgotten password without any email service.
    const recoveryCode = randomCode(4);
    await setRecoveryHash(u.id, hashCode(recoveryCode));
    await startSession(res, u.id);
    countEvent("signup");
    // With an email service set up, also send a confirmation link (optional; the account works either way).
    if (emailConfigured()) void sendVerification(u.id, u.email).catch((err) => log.warn("verification_email_failed", { err }));
    res.status(201).json({ ok: true, recoveryCode });
  }),
);

/** Which optional extras the server has, so pages can offer them. Public. */
authRouter.get(
  "/auth/features",
  handler(async (_req, res) => {
    res.json({ email: emailConfigured() });
  }),
);

/** Forgot password, no email needed: email + recovery code + new password. Gives a fresh code. */
authRouter.post(
  "/auth/recover",
  handler(async (req, res) => {
    limit(`recover:${clientIp(req)}`, 10, 15 * 60 * 1000);
    const { email, code, password } = z
      .object({ email: z.string().trim().toLowerCase().max(200), code: z.string().max(60), password: z.string().max(200) })
      .parse(req.body);
    limit(`recover-email:${email}`, 5, 15 * 60 * 1000);
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem, "weak_password");
    const row = await findRecovery(email);
    const given = Buffer.from(hashCode(code));
    const ok = !!row?.recovery_hash && normalizeCode(code).length === 16 && timingSafeEqual(given, Buffer.from(row.recovery_hash));
    if (!row || !ok) throw new HttpError(400, "The email or recovery code isn't right.", "bad_code");
    await setPassword(row.id, await hashPassword(password));
    const recoveryCode = randomCode(4);
    await setRecoveryHash(row.id, hashCode(recoveryCode));
    await startSession(res, row.id);
    res.json({ ok: true, recoveryCode });
  }),
);

/**
 * Site owner locked out: an ADMIN_EMAILS address + the setup code from the server log sets a new
 * password and activates admin in one step. The code proves control of the server, so no email is needed.
 */
authRouter.post(
  "/auth/owner-reset",
  handler(async (req, res) => {
    limit(`owner-reset:${clientIp(req)}`, 5, 15 * 60 * 1000);
    const { email, code, password } = z
      .object({ email: z.string().trim().toLowerCase().max(200), code: z.string().max(60), password: z.string().max(200) })
      .parse(req.body);
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem, "weak_password");
    const row = adminEmails().includes(email) ? await findRecovery(email) : undefined;
    if (!row || !checkSetupCode(code)) throw new HttpError(400, "The email or setup code isn't right. Use the newest code from the server log.", "bad_code");
    await setPassword(row.id, await hashPassword(password));
    await markEmailVerified(row.id);
    const recoveryCode = randomCode(4);
    await setRecoveryHash(row.id, hashCode(recoveryCode));
    await startSession(res, row.id);
    log.info("admin_password_reset", {});
    res.json({ ok: true, recoveryCode });
  }),
);

/** A new recovery code (the old one stops working). Needs the current password. */
authRouter.post(
  "/auth/recovery-code",
  requireUser,
  handler(async (req, res) => {
    const u = user(req);
    limit(`recovery-code:${u.id}`, 5, 60 * 60 * 1000);
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    const row = await findUserById(u.id);
    if (!row || !(await verifyPassword(password, row.password_hash))) throw new HttpError(401, "Password is incorrect.", "bad_credentials");
    const recoveryCode = randomCode(4);
    await setRecoveryHash(u.id, hashCode(recoveryCode));
    res.json({ ok: true, recoveryCode });
  }),
);

// ---------- email links: verification and password reset ----------

const VERIFY_TTL = 24 * 60 * 60 * 1000;
const RESET_TTL = 60 * 60 * 1000;
const newToken = () => randomBytes(32).toString("base64url");
const tokenHash = (t: string) => createHash("sha256").update(t).digest("hex");
const TokenBody = z.object({ token: z.string().min(20).max(100) });

async function sendVerification(userId: string, email: string): Promise<boolean> {
  const token = newToken();
  await createEmailToken(userId, "verify", tokenHash(token), VERIFY_TTL);
  return sendEmail(
    linkEmail({
      to: email,
      subject: "Confirm your email address",
      heading: "Confirm your email",
      body: "Click the button below to confirm this is your email address. It lets you reset your password if you ever forget it.",
      button: "Confirm my email",
      link: `${appUrl()}/verify-email?token=${token}`,
      footnote: "The link works for 24 hours. If you didn't create an account, you can ignore this email.",
    }),
  );
}

/** Sends (or re-sends) the confirmation link to the signed-in user's address. */
authRouter.post(
  "/auth/send-verification",
  requireUser,
  handler(async (req, res) => {
    const u = user(req);
    if (u.emailVerified) return void res.json({ ok: true, alreadyVerified: true });
    limit(`verify-send:${u.id}`, 3, 60 * 60 * 1000);
    const sent = await sendVerification(u.id, u.email);
    if (!sent) throw new HttpError(503, "We couldn't send the email right now. Please try again later.", "email_unavailable");
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/auth/verify-email",
  handler(async (req, res) => {
    limit(`verify:${clientIp(req)}`, 20, 15 * 60 * 1000);
    const { token } = TokenBody.parse(req.body);
    const userId = await consumeEmailToken(tokenHash(token), "verify");
    if (!userId) throw new HttpError(400, "This link has expired or was already used. Sign in and send a new one from your Account page.", "bad_token");
    await markEmailVerified(userId);
    res.json({ ok: true });
  }),
);

/** Always answers the same way, so it can't be used to find out which emails have accounts. */
authRouter.post(
  "/auth/forgot-password",
  handler(async (req, res) => {
    limit(`forgot:${clientIp(req)}`, 5, 60 * 60 * 1000);
    const { email } = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(200) }).parse(req.body);
    limit(`forgot-email:${email}`, 3, 60 * 60 * 1000);
    const u = await findUserByEmail(email);
    if (u) {
      const token = newToken();
      await createEmailToken(u.id, "reset", tokenHash(token), RESET_TTL);
      const sent = await sendEmail(
        linkEmail({
          to: u.email,
          subject: "Reset your password",
          heading: "Reset your password",
          body: "Someone (hopefully you) asked to reset the password for this account. Click the button below to choose a new one.",
          button: "Choose a new password",
          link: `${appUrl()}/reset-password?token=${token}`,
          footnote: "The link works for 1 hour and only once. If you didn't ask for this, ignore this email: your password stays the same.",
        }),
      );
      if (!sent) log.warn("reset_email_not_sent", {});
    }
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/auth/reset-password",
  handler(async (req, res) => {
    limit(`reset:${clientIp(req)}`, 10, 15 * 60 * 1000);
    const { token, password } = TokenBody.extend({ password: z.string().max(200) }).parse(req.body);
    const problem = passwordProblem(password);
    if (problem) throw new HttpError(400, problem, "weak_password");
    const userId = await consumeEmailToken(tokenHash(token), "reset");
    if (!userId) throw new HttpError(400, "This reset link has expired or was already used. Ask for a new one.", "bad_token");
    await setPassword(userId, await hashPassword(password));
    // Following the emailed link also proves the address is theirs.
    await markEmailVerified(userId);
    await startSession(res, userId);
    res.json({ ok: true });
  }),
);

// Used to spend the same time on unknown emails, so response timing doesn't reveal which accounts exist.
let dummyHash: Promise<string> | null = null;

authRouter.post(
  "/auth/login",
  handler(async (req, res) => {
    const { email, password } = Credentials.parse(req.body);
    limit(`login:${clientIp(req)}`, 20, 15 * 60 * 1000);
    limit(`login-email:${email}`, 8, 15 * 60 * 1000);
    const u = await findUserByEmail(email);
    dummyHash ??= hashPassword("not-a-real-password-1");
    const ok = await verifyPassword(password, u?.password_hash ?? (await dummyHash));
    if (!u || !ok) throw new HttpError(401, "Email or password is incorrect.", "bad_credentials");
    await startSession(res, u.id);
    res.json({ ok: true });
  }),
);

authRouter.post(
  "/auth/logout",
  handler(async (req, res) => {
    await endSession(req, res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  "/auth/me",
  requireUser,
  handler(async (req, res) => {
    const u = user(req);
    // An admin address that hasn't been activated yet: the Account page offers the setup-code box.
    res.json({ user: u, canActivateAdmin: !u.isAdmin && adminEmails().includes(u.email.toLowerCase()) });
  }),
);

/** Downloads everything stored for the account as JSON. */
authRouter.get(
  "/account",
  requireUser,
  handler(async (req, res) => {
    res
      .set({ "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="resume-builder-data.json"', "Cache-Control": "no-store" })
      .send(JSON.stringify({ ...(await exportUserData(user(req).id)), ...(await exportPipelineData(user(req).id)) }, null, 2));
  }),
);

/** Permanently deletes the account and all its data. Requires the password. */
authRouter.delete(
  "/account",
  requireUser,
  handler(async (req, res) => {
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    const row = await findUserById(user(req).id);
    if (!row || !(await verifyPassword(password, row.password_hash))) throw new HttpError(401, "Password is incorrect.", "bad_credentials");
    await deleteUser(row.id);
    await endSession(req, res);
    res.json({ ok: true });
  }),
);
