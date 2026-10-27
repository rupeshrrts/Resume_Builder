import type { NextRequest } from "next/server";

/**
 * Same-origin proxy for /api/* → the backend API. The browser only ever talks to this site, so
 * the session cookie stays first-party and no CORS is needed. Unlike a next.config rewrite, the
 * backend address is read at runtime (BACKEND_URL), and the visitor's IP is passed on so the
 * API's per-IP rate limits work behind a host; PROXY_SECRET proves the IP came from this proxy.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// AI drafting and PDF rendering can take a while.
export const maxDuration = 120;

// "host:port" (as some platforms give for private networking) is accepted and treated as http.
const raw = (process.env.BACKEND_URL ?? "http://localhost:4000").trim().replace(/\/$/, "");
const BACKEND_URL = /^https?:\/\//.test(raw) ? raw : `http://${raw}`;

// Request headers worth passing on; everything else (host, connection, platform headers) is dropped.
const FORWARD = ["accept", "accept-language", "content-type", "cookie", "origin", "referer", "user-agent", "if-none-match"];
// Hop-by-hop or recomputed response headers.
const DROP_RESPONSE = new Set(["connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length"]);

/** The visitor's IP as reported by the platform in front of this server. */
function visitorIp(req: NextRequest): string {
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  // The platform appends the address it saw, so the last entry is the one a client can't forge.
  const xff = req.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return xff?.at(-1) ?? "";
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${BACKEND_URL}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const h of FORWARD) {
    const v = req.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("x-forwarded-host", req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "");
  headers.set("x-forwarded-proto", req.nextUrl.protocol.replace(":", ""));
  const ip = visitorIp(req);
  if (process.env.PROXY_SECRET && ip) {
    headers.set("x-proxy-secret", process.env.PROXY_SECRET);
    headers.set("x-client-ip", ip);
  }

  const hasBody = !["GET", "HEAD"].includes(req.method);
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ error: "The service is temporarily unavailable. Please try again in a moment.", code: "backend_unreachable" }, { status: 502 });
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!DROP_RESPONSE.has(key) && key !== "set-cookie") out.set(key, value);
  });
  // Each cookie must stay its own header.
  for (const c of upstream.headers.getSetCookie()) out.append("set-cookie", c);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
