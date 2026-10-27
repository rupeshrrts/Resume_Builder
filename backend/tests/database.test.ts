import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createDb, sslConfig, type Db } from "@/db/index";
import { SCHEMA_FILE, migrate, schemaSteps, splitSql } from "@/db/migrate";

const tables = async (db: Db) => (await db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1")).rows.map((r) => r.tablename);

describe("database/schema.sql", () => {
  it("splits scripts without breaking $$-quoted bodies", () => {
    expect(splitSql("SELECT 1; DO $$ BEGIN PERFORM 1; PERFORM 2; END $$; SELECT ';'")).toEqual(["SELECT 1", "DO $$ BEGIN PERFORM 1; PERFORM 2; END $$", "SELECT ';'"]);
  });

  it("has numbered steps in order, each recording itself", () => {
    const steps = schemaSteps(fs.readFileSync(SCHEMA_FILE, "utf8"));
    const names = steps.map((s) => s.version);
    expect(names.length).toBeGreaterThanOrEqual(11);
    expect(names.every((n) => /^\d{3}_[a-z0-9_]+\.sql$/.test(n))).toBe(true);
    expect([...names].sort()).toEqual(names);
    expect(new Set(names).size).toBe(names.length);
    for (const s of steps) expect(s.sql).toContain(`VALUES ('${s.version}')`);
  });

  it("pasting the whole file builds the same database, and the API then has nothing to apply", async () => {
    const pasted = await createDb({ dir: "memory" });
    await pasted.exec(fs.readFileSync(SCHEMA_FILE, "utf8"));
    expect(await migrate(pasted)).toEqual([]);
    const viaApi = await createDb({ dir: "memory" });
    expect((await migrate(viaApi)).length).toBe(schemaSteps(fs.readFileSync(SCHEMA_FILE, "utf8")).length);
    expect(await tables(pasted)).toEqual(await tables(viaApi));
    expect(await migrate(viaApi)).toEqual([]);
  });

  it("an existing database only gets the new steps added at the end", async () => {
    const db = await createDb({ dir: "memory" });
    await migrate(db);
    const file = `${SCHEMA_FILE}.test-${process.pid}`;
    const extra = "-- ============================================================ 999_test_step.sql\n\nCREATE TABLE test_step (id int);\n\n";
    fs.writeFileSync(file, fs.readFileSync(SCHEMA_FILE, "utf8").replace(/^-- =+ end$/m, (m) => extra + m));
    try {
      expect(await migrate(db, file)).toEqual(["999_test_step.sql"]);
      expect(await tables(db)).toContain("test_step");
    } finally {
      fs.rmSync(file);
    }
  });

  it("on Supabase, the public Data API roles can't touch app tables, while the owner still can", async () => {
    const pg = new PGlite();
    // Recreate Supabase's API roles and their default access to new tables in public.
    await pg.exec(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE app LOGIN; GRANT CREATE, USAGE ON SCHEMA public TO app;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES FOR ROLE app IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
      SET ROLE app;`);
    const db: Db = {
      kind: "pglite",
      query: async (sql, params = []) => {
        const r = await pg.query(sql, params);
        return { rows: r.rows as never[], rowCount: r.affectedRows ?? r.rows.length };
      },
      tx: (fn) => pg.transaction((t) => fn({ query: async (sql, params = []) => ({ rows: (await t.query(sql, params)).rows as never[], rowCount: 0 }) })),
      exec: async (sql) => void (await pg.exec(sql)),
      close: () => pg.close(),
    };
    await migrate(db);

    const noRls = await db.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND relkind = 'r' AND NOT relrowsecurity");
    expect(noRls.rows).toEqual([]);
    const grants = await db.query("SELECT 1 FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')");
    expect(grants.rows).toEqual([]);

    // The owner (the backend's role) reads and writes as normal.
    await db.query("INSERT INTO users (id, email, password_hash) VALUES (gen_random_uuid(), 'owner@example.com', 'x')");
    expect((await db.query("SELECT email FROM users")).rows).toHaveLength(1);

    // The API role is refused outright.
    await pg.exec("RESET ROLE; SET ROLE anon;");
    await expect(pg.query("SELECT * FROM users")).rejects.toThrow(/permission denied/);
    await pg.close();
  });
});

describe("database connection settings", () => {
  it("uses no TLS for a local server", () => {
    expect(sslConfig("postgres://u:p@localhost:5432/db", {}).ssl).toBe(false);
  });

  it("verifies TLS for hosted databases and drops sslmode from the URL", () => {
    const c = sslConfig("postgresql://u:pw@db.example.com:5432/postgres?sslmode=require", {});
    expect(c.ssl).toEqual({ rejectUnauthorized: true });
    expect(c.connectionString).not.toContain("sslmode");
  });

  it("verifies Supabase with the bundled Supabase root CA, so DATABASE_URL alone is enough", () => {
    const c = sslConfig("postgresql://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require", {});
    const ssl = c.ssl as { ca?: string; rejectUnauthorized: boolean };
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.ca).toContain("-----BEGIN CERTIFICATE-----");
    expect(c.connectionString).not.toContain("sslmode");
  });

  it("accepts a CA certificate as PEM or base64, and an explicit no-verify or off", () => {
    const pem = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
    const url = "postgresql://u:p@db.example.supabase.co:5432/postgres";
    expect(sslConfig(url, { DATABASE_SSL_CA: pem }).ssl).toEqual({ ca: pem, rejectUnauthorized: true });
    expect(sslConfig(url, { DATABASE_SSL_CA: Buffer.from(pem).toString("base64") }).ssl).toEqual({ ca: pem, rejectUnauthorized: true });
    expect(sslConfig(url, { DATABASE_SSL: "no-verify" }).ssl).toEqual({ rejectUnauthorized: false });
    expect(sslConfig(url, { DATABASE_SSL: "off" }).ssl).toBe(false);
  });
});
