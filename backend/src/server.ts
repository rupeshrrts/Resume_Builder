import { aiAvailable, aiModel, aiProviders } from "@/ai/client";
import { adminSetupCode } from "@/auth/admin";
import { createApp } from "@/app";
import { createDb, setDb } from "@/db/index";
import { migrate } from "@/db/migrate";
import { log } from "@/log";

const production = process.env.NODE_ENV === "production";

// Fail fast on configuration that would silently lose data or break sign-in in production.
if (production) {
  const problems: string[] = [];
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL is not set (the embedded database is for development only).");
  if (!process.env.FRONTEND_ORIGIN) problems.push("FRONTEND_ORIGIN is not set (the site's public URL, e.g. https://resume.example.com).");
  else if (process.env.FRONTEND_ORIGIN.split(",").some((o) => !/^https:\/\//.test(o.trim()))) problems.push("FRONTEND_ORIGIN must use https:// in production.");
  if (problems.length) {
    for (const p of problems) log.error("config_error", { problem: p });
    process.exit(1);
  }
}

if (!aiAvailable()) log.warn("ai_disabled", { reason: "No AI key is set (OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, NVIDIA_API_KEY or ANTHROPIC_API_KEY); AI features will show as unavailable." });
else log.info("ai_enabled", { providers: aiProviders(), model: aiModel() });

const db = await createDb();
// MIGRATE_ON_START=false lets you run database/schema.sql yourself (npm run db:migrate or the Supabase SQL Editor).
if (process.env.MIGRATE_ON_START !== "false") await migrate(db);
setDb(db);

// The owner's setup code, printed on every start (server log only, which only the owner can read).
// Admin sign-in is just the admin email + password; this code only resets a forgotten admin password.
log.warn("admin_setup_code", {
  code: adminSetupCode(),
  howTo: "Only needed if you forget the admin password: /admin/login -> Forgot password? -> enter this code.",
});

// API_PORT (not PORT) locally, so it can't collide with the frontend's PORT when both run in one shell.
// Hosting platforms set PORT for the single service they run, so it's used in production.
const port = Number(process.env.API_PORT) || (production ? Number(process.env.PORT) : 0) || 4000;
const server = createApp().listen(port, () => log.info("api_listening", { port, database: db.kind }));

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  log.info("api_stopping", { signal });
  // Finish in-flight requests, but don't hang forever on keep-alive connections.
  const force = setTimeout(() => process.exit(0), 10_000);
  force.unref();
  server.close(async () => {
    await db.close().catch(() => undefined);
    process.exit(0);
  });
  server.closeIdleConnections?.();
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => log.error("unhandled_rejection", { err }));
