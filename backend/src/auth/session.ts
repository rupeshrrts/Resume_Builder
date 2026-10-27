import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { deleteExpiredSessions, deleteSession, findSessionUser, insertSession } from "@/db/repo";
import type { SessionUser } from "@resume/shared/types/api";
import { isAdmin } from "./admin";

export const SESSION_COOKIE = "rb_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const secureCookies = () => process.env.COOKIE_SECURE === "true" || (process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false");

/** Creates a session and sets the cookie. Only the token's hash is stored in the database. */
export async function startSession(res: Response, userId: string) {
  await deleteExpiredSessions();
  const token = randomBytes(32).toString("base64url");
  const expires = Date.now() + SESSION_TTL_MS;
  await insertSession(hashToken(token), userId, expires);
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secureCookies(), path: "/", expires: new Date(expires) });
}

export async function endSession(req: Request, res: Response) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string") await deleteSession(hashToken(token));
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export async function userFromToken(token: unknown): Promise<SessionUser | null> {
  if (typeof token !== "string" || !token || token.length > 100) return null;
  const u = await findSessionUser(hashToken(token));
  return u ? { ...u, emailVerified: !!u.emailVerified, isAdmin: isAdmin(u.email, !!u.emailVerified) } : null;
}
