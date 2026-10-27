import { createDb, setDb, type Db } from "@/db/index";
import { migrate } from "@/db/migrate";
import { resetRateLimits } from "@/rate-limit";

let shared: Db | null = null;

/**
 * Fresh, fully migrated in-memory PostgreSQL (PGlite) for each test file.
 * Tables are truncated between tests instead of re-creating the database (much faster).
 */
export async function useTestDb(): Promise<Db> {
  if (!shared) {
    shared = await createDb({ dir: "memory" });
    await migrate(shared);
  }
  setDb(shared);
  await shared.exec("TRUNCATE users, sessions, jobs, resumes, resume_versions, documents, page_views, usage_events, payments, reviews CASCADE");
  resetRateLimits();
  return shared;
}
