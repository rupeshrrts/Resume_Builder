import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { allowedOrigins, errorHandler, sameOrigin } from "@/http";
import { getDb } from "@/db/index";
import { authRouter } from "@/routes/auth";
import { resumesRouter } from "@/routes/resumes";
import { jobsRouter } from "@/routes/jobs";
import { toolsRouter } from "@/routes/tools";
import { documentsRouter } from "@/routes/documents";
import { interviewRouter } from "@/routes/interview";
import { shareRouter } from "@/routes/share";
import { adminRouter } from "@/routes/admin";

/** The HTTP API. All routes live under /api; the frontend talks to nothing else. */
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.TRUST_PROXY) app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : process.env.TRUST_PROXY);
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  // The frontend normally proxies /api (same origin). CORS covers direct browser calls from configured origins.
  app.use(cors({ origin: allowedOrigins(), credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(sameOrigin);

  app.get("/api/health", async (_req, res) => {
    try {
      await getDb().query("SELECT 1");
      res.json({ ok: true, database: getDb().kind });
    } catch {
      res.status(503).json({ ok: false });
    }
  });
  app.use("/api", authRouter, resumesRouter, jobsRouter, toolsRouter, documentsRouter, interviewRouter, shareRouter, adminRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found.", code: "not_found" });
  });
  app.use(errorHandler);
  return app;
}
