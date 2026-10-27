/** Browser-side fetch helper: JSON in/out, readable error messages. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string, public issues?: string[]) {
    super(message);
  }
}

export async function api<T>(url: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: opts.form ? undefined : { "Content-Type": "application/json" },
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: opts.signal,
      credentials: "same-origin",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0, "network");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const d = (data ?? {}) as { error?: string; code?: string; issues?: string[] };
    if (res.status === 401 && typeof window !== "undefined" && !url.startsWith("/api/auth")) {
      window.location.href = "/login";
    }
    throw new ApiError(d.error ?? `Request failed (${res.status}).`, res.status, d.code, d.issues);
  }
  return data as T;
}
