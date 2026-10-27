import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Db } from "./index";
import { log } from "@/log";

/** The whole database lives in one file at the repository root: database/schema.sql. */
export const SCHEMA_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../database/schema.sql");

/** The steps in schema.sql: each "-- ===== <name>" block, in file order, up to the "end" marker. */
export function schemaSteps(sql: string): { version: string; sql: string }[] {
  const text = sql.replace(/\r\n/g, "\n");
  const marks = [...text.matchAll(/^-- =+ (\S+)[ \t]*$/gm)];
  const steps: { version: string; sql: string }[] = [];
  for (let i = 0; i < marks.length && marks[i][1] !== "end"; i++) {
    const start = marks[i].index! + marks[i][0].length;
    steps.push({ version: marks[i][1], sql: text.slice(start, marks[i + 1]?.index ?? text.length) });
  }
  return steps;
}

/** Runs the steps of schema.sql that this database hasn't recorded yet. Safe to call on every start. */
export async function migrate(db: Db, file = SCHEMA_FILE): Promise<string[]> {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await db.query<{ version: string }>("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
  const applied: string[] = [];
  for (const { version: f, sql } of schemaSteps(fs.readFileSync(file, "utf8"))) {
    if (done.has(f)) continue;
    const ran = await db.tx(async (q) => {
      // Several API instances may start together: a transaction-scoped lock (safe with connection
      // poolers) serialises them, and the re-check skips work another instance just finished.
      if (db.kind === "postgres") await q.query("SELECT pg_advisory_xact_lock(724311905)");
      if ((await q.query("SELECT 1 FROM schema_migrations WHERE version = $1", [f])).rows.length) return false;
      // Run each statement separately so both pg and PGlite accept the script inside a transaction.
      for (const stmt of splitSql(sql)) await q.query(stmt);
      // Each step also records itself (for when the file is pasted into an SQL editor), so don't clash.
      await q.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING", [f]);
      return true;
    });
    if (!ran) continue;
    applied.push(f);
    log.info("migration_applied", { version: f });
  }
  return applied;
}

/** Splits a SQL script on semicolons outside quotes, $$-quoted bodies and comments. */
export function splitSql(sql: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!quote && ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      cur += "\n";
      continue;
    }
    // Dollar quotes ($$ or $tag$) wrap function and DO bodies, which contain semicolons.
    if (!quote && ch === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? sql.length : end + tag.length;
        cur += sql.slice(i, stop);
        i = stop - 1;
        continue;
      }
    }
    if (ch === "'" || ch === '"') {
      if (quote === ch) quote = null;
      else if (!quote) quote = ch;
    }
    if (ch === ";" && !quote) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
