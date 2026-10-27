import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { log } from "@/log";

/**
 * PostgreSQL access. With DATABASE_URL set (postgres://…) the backend uses a pg connection pool
 * against a real PostgreSQL server. Without it, it runs an embedded PostgreSQL (PGlite) stored in
 * PGLITE_DIR, so local development and tests need nothing installed. Both run the same SQL.
 */

export interface Result<T> {
  rows: T[];
  rowCount: number;
}

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Result<T>>;
}

export interface Db extends Queryable {
  kind: "postgres" | "pglite";
  /** Runs fn in a transaction; rolls back if it throws. */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  /** Executes a script containing several statements. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

function fromPool(pool: pg.Pool): Db {
  return {
    kind: "postgres",
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
    },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({
          async query<T>(sql: string, params: unknown[] = []) {
            const r = await client.query(sql, params);
            return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 };
          },
        });
        await client.query("COMMIT");
        return out;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw e;
      } finally {
        client.release();
      }
    },
    async exec(sql) {
      await pool.query(sql);
    },
    close: () => pool.end(),
  };
}

function fromPglite(db: PGlite): Db {
  const wrap = (q: Pick<PGlite, "query">): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await q.query<T>(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
  });
  return {
    kind: "pglite",
    ...wrap(db),
    tx: (fn) => db.transaction((t) => fn(wrap(t))),
    async exec(sql) {
      await db.exec(sql);
    },
    close: () => db.close(),
  };
}

const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|::1|\[::1\]|host\.docker\.internal)$/i;
const SUPABASE_HOSTS = /(^|\.)supabase\.(com|co)$/i;
/** Supabase's public root CA ("Supabase Root 2021 CA"), shipped with the app so DATABASE_URL alone is enough. */
const SUPABASE_CA_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../certs/supabase-ca.crt");

/** A CA certificate given as PEM text, base64-encoded PEM, or a path to a .crt/.pem file. */
function readCa(value: string): string {
  const v = value.trim();
  if (v.includes("-----BEGIN")) return v.replace(/\\n/g, "\n");
  if (fs.existsSync(v)) return fs.readFileSync(v, "utf8");
  const decoded = Buffer.from(v, "base64").toString("utf8");
  if (decoded.includes("-----BEGIN")) return decoded;
  throw new Error("DATABASE_SSL_CA must be PEM text, base64-encoded PEM, or a path to the certificate file.");
}

/**
 * TLS settings for the database connection. Hosted databases (Supabase, Neon, RDS…) get TLS by
 * default and the server's certificate is always verified. Supabase signs with its own root CA,
 * which ships in backend/certs and is used automatically for Supabase hosts; DATABASE_SSL_CA
 * overrides it (or supplies another provider's). DATABASE_SSL=no-verify encrypts without checking
 * the certificate (not recommended); DATABASE_SSL=off disables TLS.
 */
export function sslConfig(url: string, env = process.env): { connectionString: string; ssl: pg.PoolConfig["ssl"] } {
  const u = new URL(url);
  // sslmode etc. in the URL would override the explicit settings below, so they're removed.
  for (const k of ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) u.searchParams.delete(k);
  const connectionString = u.toString();
  const mode = (env.DATABASE_SSL ?? "").toLowerCase();
  if (mode === "off" || mode === "disable" || (!mode && LOCAL_HOSTS.test(u.hostname) && !env.DATABASE_SSL_CA)) return { connectionString, ssl: false };
  if (mode === "no-verify") {
    log.warn("db_ssl_unverified", { host: u.hostname });
    return { connectionString, ssl: { rejectUnauthorized: false } };
  }
  const ca = env.DATABASE_SSL_CA
    ? readCa(env.DATABASE_SSL_CA)
    : SUPABASE_HOSTS.test(u.hostname) && fs.existsSync(SUPABASE_CA_FILE)
      ? fs.readFileSync(SUPABASE_CA_FILE, "utf8")
      : undefined;
  return { connectionString, ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: true } };
}

export async function createDb(opts: { url?: string; dir?: string } = {}): Promise<Db> {
  const url = opts.url ?? process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//.test(url)) {
    const { connectionString, ssl } = sslConfig(url);
    const pool = new pg.Pool({
      connectionString,
      ssl,
      // Small by default: hosted poolers (e.g. Supabase's) cap connections per project.
      max: Number(process.env.PG_POOL_MAX) || 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      application_name: "resume-builder-api",
    });
    pool.on("error", (e) => log.error("pg_pool_error", { err: e }));
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      await pool.end().catch(() => undefined);
      const msg = (e as Error).message ?? "";
      const hint = /self[- ]signed|certificate/i.test(msg)
        ? " The server's certificate couldn't be verified: set DATABASE_SSL_CA to your provider's CA certificate (Supabase: Project Settings → Database → SSL Configuration → Download certificate)."
        : /password authentication/i.test(msg)
          ? " Check the user name and password in DATABASE_URL."
          : /ENOTFOUND|EAI_AGAIN|ENETUNREACH|ETIMEDOUT/i.test(msg)
            ? " Check the host name. For Supabase, use the Session pooler connection string (IPv4-compatible)."
            : "";
      throw new Error(`Can't connect to the database: ${msg}.${hint}`);
    }
    return fromPool(pool);
  }
  const dir = opts.dir ?? process.env.PGLITE_DIR ?? "./.data/pglite";
  if (dir === "memory") return fromPglite(new PGlite());
  fs.mkdirSync(path.resolve(dir), { recursive: true });
  return fromPglite(new PGlite(path.resolve(dir)));
}

let current: Db | null = null;

export function getDb(): Db {
  if (!current) throw new Error("Database not initialised; call initDb() at startup.");
  return current;
}

export function setDb(db: Db) {
  current = db;
}
