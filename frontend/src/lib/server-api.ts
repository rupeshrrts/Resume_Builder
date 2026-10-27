import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionUser } from "@resume/shared/types/api";

/** Server-side calls from Next.js pages to the backend API, forwarding the user's session cookie. */
const raw = (process.env.BACKEND_URL ?? "http://localhost:4000").trim().replace(/\/$/, "");
export const BACKEND_URL = /^https?:\/\//.test(raw) ? raw : `http://${raw}`;

export class BackendError extends Error {
  constructor(public status: number) {
    super(`Backend responded ${status}`);
  }
}

export async function backend<T>(path: string, opts: { timeoutMs?: number } = {}): Promise<T | null> {
  const jar = await cookies();
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      headers: { cookie: jar.toString(), accept: "application/json" },
      cache: "no-store",
      ...(opts.timeoutMs ? { signal: AbortSignal.timeout(opts.timeoutMs) } : {}),
    });
  } catch {
    throw new Error(`Can't reach the API server at ${BACKEND_URL}. Is the backend running?`);
  }
  if (res.status === 401) return null;
  if (res.status === 404) throw new BackendError(404);
  if (!res.ok) throw new BackendError(res.status);
  return (await res.json()) as T;
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  // No session cookie means signed out: answer at once instead of asking the API. Keeps public pages
  // fast for new visitors and search engines even while a free-plan API is waking up.
  if (!(await cookies()).has("rb_session")) return null;
  try {
    return (await backend<{ user: SessionUser }>("/api/auth/me"))?.user ?? null;
  } catch {
    return null;
  }
}

/** For pages that need a signed-in user: redirects to /login otherwise. */
export async function requirePage<T>(path: string): Promise<T> {
  const data = await backend<T>(path);
  if (!data) redirect("/login");
  return data;
}
