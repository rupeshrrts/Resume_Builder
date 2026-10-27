import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const nextConfig: NextConfig = {
  // Shared TypeScript (schemas, scoring rules, document model) is compiled by Next.
  transpilePackages: ["@resume/shared"],
  poweredByHeader: false,
  // The repository root, so builds include the shared workspace (monorepo).
  outputFileTracingRoot: root,
  turbopack: { root },
  // A self-contained server for Docker images (NEXT_OUTPUT=standalone); hosts like Vercel use the default.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // /api/* is proxied to the backend by src/app/api/[...path]/route.ts (runtime BACKEND_URL).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
