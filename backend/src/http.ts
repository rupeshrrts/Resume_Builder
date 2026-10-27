import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError, type z } from "zod";
import { SESSION_COOKIE, userFromToken } from "@/auth/session";
import { rateLimit } from "@/rate-limit";
import { log } from "@/log";
import { ConflictError, NotFoundError } from "@/db/repo";
import type { SessionUser } from "@resume/shared/types/api";

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Keeps only the keys the client actually sent (raw is the unparsed body). */
export function pickSent<T extends object>(parsed: T, raw: unknown): Partial<T> {
  const sent = raw && typeof raw === "object" ? raw : {};
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => k in sent)) as Partial<T>;
}

/**
 * Parses a partial update. Zod 4's .partial() still fills in each field's default, which
 * would silently overwrite stored values the client didn't send, so those are dropped.
 */
export function parsePatch<T extends z.ZodObject>(schema: T, body: unknown): Partial<z.infer<T>> {
  return pickSent(schema.partial().parse(body ?? {}) as z.infer<T>, body);
}

/** Wraps async handlers so rejected promises reach the error middleware. */
export const handler =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/** Requires a valid session cookie; sets req.user. */
export const requireUser: RequestHandler = (req, _res, next) => {
  userFromToken(req.cookies?.[SESSION_COOKIE])
    .then((u) => {
      if (!u) return next(new HttpError(401, "Please sign in.", "unauthenticated"));
      req.user = u;
      next();
    })
    .catch(next);
};

export function user(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, "Please sign in.", "unauthenticated");
  return req.user;
}

/**
 * Blocks cross-site state-changing requests. SameSite=Lax cookies already stop most CSRF;
 * this adds an explicit Origin check against the API host and the configured frontend origins.
 */
export const sameOrigin: RequestHandler = (req, _res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (!origin) return next(); // non-browser clients still need the session cookie
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return next(new HttpError(403, "Invalid origin", "csrf"));
  }
  const allowed = new Set([req.get("x-forwarded-host") ?? "", req.get("host") ?? "", ...allowedOrigins().map((o) => new URL(o).host)].filter(Boolean));
  if (!allowed.has(host)) return next(new HttpError(403, "Cross-site request blocked", "csrf"));
  next();
};

export function allowedOrigins(): string[] {
  return (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));
}

/**
 * The visitor's IP, for rate limiting. Requests come through the frontend's /api proxy, which
 * passes the visitor's address in x-client-ip together with the shared PROXY_SECRET; without a
 * matching secret the header is ignored, so it can't be forged by calling the API directly.
 */
export function clientIp(req: Request) {
  const secret = process.env.PROXY_SECRET;
  const sent = req.get("x-proxy-secret");
  const ip = req.get("x-client-ip");
  if (secret && sent && ip && sent.length === secret.length && timingSafeEqual(Buffer.from(sent), Buffer.from(secret))) return ip.slice(0, 64);
  return req.ip || "local";
}

export function limit(key: string, max: number, windowMs: number) {
  const r = rateLimit(key, max, windowMs);
  if (!r.ok) throw new HttpError(429, `Too many requests. Try again in ${r.retryAfterSec}s.`, "rate_limited", { "Retry-After": String(r.retryAfterSec) });
}

/** Consistent, content-free error responses. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.set(err.headers).status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof ZodError) {
    const issues = err.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
    res.status(400).json({ error: "Invalid input.", code: "validation", issues });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: "This resume was changed in another tab or window. Reload to get the latest version.", code: "conflict" });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message === "Job not found" ? "That job doesn't exist." : "Not found.", code: "not_found" });
    return;
  }
  const e = err as { type?: string; code?: string; status?: number };
  if (e?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Request body is not valid JSON.", code: "bad_json" });
    return;
  }
  if (e?.type === "entity.too.large" || e?.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Request is too large.", code: "too_large" });
    return;
  }
  if (e?.code?.startsWith?.("LIMIT_")) {
    res.status(400).json({ error: "Upload one PDF or DOCX file.", code: "bad_upload" });
    return;
  }
  log.error("unhandled_route_error", { path: req.path, method: req.method, err });
  res.status(500).json({ error: "Something went wrong. Please try again.", code: "internal" });
}
