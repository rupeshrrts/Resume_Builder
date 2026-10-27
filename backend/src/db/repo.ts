import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { getDb, type Queryable } from "./index";
import {
  ResumeData,
  ResumeSettings,
  SECTION_KEYS,
  defaultSettings,
  newId,
  normalizeSectionOrder,
  type Bullet,
  type ResumeKind,
  type SectionKey,
} from "@resume/shared/schema/resume";
import { JobInput, type Job } from "@resume/shared/schema/job";
import { DocumentInput, type AppDocument } from "@resume/shared/schema/document";
import type { ResumeRecord, ResumeSummary, SessionUser, VersionSummary } from "@resume/shared/types/api";

/**
 * Data access over the normalized PostgreSQL schema (database/schema.sql).
 * Every function that touches user content takes `userId` and filters by it, so one user's
 * resumes and jobs can never be read or changed by another.
 */

export class ConflictError extends Error {
  constructor(public currentRevision: number) {
    super("Resume was changed elsewhere");
  }
}
export class NotFoundError extends Error {}

const ms = "floor(extract(epoch from %s) * 1000)::float8";
const ts = (col: string, as = col) => `${ms.replace("%s", col)} AS ${as}`;

/** Multi-row INSERT helper: insertMany(q, "t", ["a","b"], [[1,2],[3,4]]). */
async function insertMany(q: Queryable, table: string, cols: string[], rows: unknown[][]) {
  if (!rows.length) return;
  const chunk = Math.max(1, Math.floor(60000 / cols.length));
  for (let s = 0; s < rows.length; s += chunk) {
    const part = rows.slice(s, s + chunk);
    const values = part.map((_, r) => `(${cols.map((__, c) => `$${r * cols.length + c + 1}`).join(", ")})`).join(", ");
    await q.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${values}`, part.flat());
  }
}

// ---------- users & sessions ----------

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

export async function createUser(email: string, passwordHash: string, profile: { fullName: string; phone: string } = { fullName: "", phone: "" }): Promise<UserRow> {
  const id = randomUUID();
  await getDb().query("INSERT INTO users (id, email, password_hash, full_name, phone) VALUES ($1, $2, $3, $4, $5)", [
    id,
    email.toLowerCase(),
    passwordHash,
    profile.fullName,
    profile.phone,
  ]);
  return { id, email: email.toLowerCase(), password_hash: passwordHash };
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return (await getDb().query<UserRow>("SELECT id, email, password_hash FROM users WHERE email = $1", [email.toLowerCase()])).rows[0];
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  return (await getDb().query<UserRow>("SELECT id, email, password_hash FROM users WHERE id = $1", [id])).rows[0];
}

/** Deletes the user; ON DELETE CASCADE removes sessions, jobs, resumes, all resume content and versions. */
export async function deleteUser(userId: string) {
  await getDb().query("DELETE FROM users WHERE id = $1", [userId]);
}

export async function insertSession(tokenHash: string, userId: string, expiresAt: number) {
  await getDb().query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))", [tokenHash, userId, expiresAt]);
}

export async function findSessionUser(tokenHash: string): Promise<Omit<SessionUser, "isAdmin"> | undefined> {
  return (
    await getDb().query<SessionUser>(
      `SELECT u.id, u.email, u.full_name AS "fullName", u.phone, (u.email_verified_at IS NOT NULL) AS "emailVerified"
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash],
    )
  ).rows[0];
}

export async function deleteSession(tokenHash: string) {
  await getDb().query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
}

export async function deleteExpiredSessions() {
  await getDb().query("DELETE FROM sessions WHERE expires_at < now()");
}

// ---------- resume content: save (normalize) ----------

/** Makes ids unique within a list (client-generated ids could collide after copy/paste). */
function uniqueIds<T extends { id: string }>(items: T[], prefix: string, seen: Set<string>): T[] {
  return items.map((it) => {
    if (!seen.has(it.id)) {
      seen.add(it.id);
      return it;
    }
    const id = newId(prefix);
    seen.add(id);
    return { ...it, id };
  });
}

async function writeContent(q: Queryable, resumeId: string, input: ResumeData, settingsInput: ResumeSettings) {
  const d = ResumeData.parse(input);
  const s = ResumeSettings.parse(settingsInput);
  // Replace all child rows. Content is small; this keeps the saved state exactly equal to the input.
  for (const t of ["bullets", "project_technologies", "skill_items", "contact_links", "experiences", "educations", "projects", "skill_groups", "certifications", "additional_sections", "resume_sections"])
    await q.query(`DELETE FROM ${t} WHERE resume_id = $1`, [resumeId]);

  await q.query(
    `INSERT INTO resume_contacts (resume_id, full_name, headline, email, phone, location) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (resume_id) DO UPDATE SET full_name = EXCLUDED.full_name, headline = EXCLUDED.headline, email = EXCLUDED.email, phone = EXCLUDED.phone, location = EXCLUDED.location`,
    [resumeId, d.contact.fullName, d.contact.headline, d.contact.email, d.contact.phone, d.contact.location],
  );
  await q.query(
    `INSERT INTO resume_summaries (resume_id, text, origin, source_text) VALUES ($1,$2,$3,$4)
     ON CONFLICT (resume_id) DO UPDATE SET text = EXCLUDED.text, origin = EXCLUDED.origin, source_text = EXCLUDED.source_text`,
    [resumeId, d.summary.text, d.summary.origin, d.summary.sourceText ?? null],
  );
  await q.query(
    `INSERT INTO resume_settings (resume_id, template, font_family, font_size, margin, line_height, section_spacing, accent_color, heading_case, page_size, market, date_format, writing_style, heading_font, summary_title, page_fit, skills_title)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (resume_id) DO UPDATE SET template = EXCLUDED.template, font_family = EXCLUDED.font_family, heading_font = EXCLUDED.heading_font, font_size = EXCLUDED.font_size, margin = EXCLUDED.margin,
       line_height = EXCLUDED.line_height, section_spacing = EXCLUDED.section_spacing, accent_color = EXCLUDED.accent_color, heading_case = EXCLUDED.heading_case,
       page_size = EXCLUDED.page_size, market = EXCLUDED.market, date_format = EXCLUDED.date_format, writing_style = EXCLUDED.writing_style, summary_title = EXCLUDED.summary_title, page_fit = EXCLUDED.page_fit, skills_title = EXCLUDED.skills_title`,
    [resumeId, s.template, s.fontFamily, s.fontSize, s.margin, s.lineHeight, s.sectionSpacing, s.accentColor, s.headingCase, s.pageSize, s.market, s.dateFormat, s.writingStyle, s.headingFont, s.summaryTitle, s.pageFit, s.skillsTitle],
  );
  const hidden = new Set(s.hiddenSections);
  const breaks = new Set(s.pageBreaks);
  await insertMany(q, "resume_sections", ["resume_id", "section_key", "position", "hidden", "page_break"], normalizeSectionOrder(s.sectionOrder).map((k, i) => [resumeId, k, i, hidden.has(k), breaks.has(k)]));

  const seenEntry = new Set<string>();
  const seenBullet = new Set<string>();
  const bulletRows: unknown[][] = [];
  const addBullets = (bs: Bullet[], parent: "experience_id" | "education_id" | "project_id" | "additional_id", parentId: string) =>
    uniqueIds(bs, "b", seenBullet).forEach((b, i) =>
      bulletRows.push([
        resumeId,
        b.id,
        parent === "experience_id" ? parentId : null,
        parent === "education_id" ? parentId : null,
        parent === "project_id" ? parentId : null,
        parent === "additional_id" ? parentId : null,
        i,
        b.text,
        b.origin,
        b.sourceText ?? null,
      ]),
    );

  await insertMany(q, "contact_links", ["resume_id", "id", "position", "label", "url"], uniqueIds(d.contact.links, "l", new Set()).map((l, i) => [resumeId, l.id, i, l.label, l.url]));

  const exps = uniqueIds(d.experience, "exp", seenEntry);
  await insertMany(
    q,
    "experiences",
    ["resume_id", "id", "position", "title", "company", "location", "employment_type", "start_date", "end_date", "is_current", "page_break_before"],
    exps.map((e, i) => [resumeId, e.id, i, e.title, e.company, e.location, e.employmentType, e.startDate, e.current ? "" : e.endDate, e.current, !!e.pageBreakBefore]),
  );
  exps.forEach((e) => addBullets(e.bullets, "experience_id", e.id));

  const eds = uniqueIds(d.education, "edu", seenEntry);
  await insertMany(
    q,
    "educations",
    ["resume_id", "id", "position", "degree", "field", "institution", "location", "start_date", "end_date", "grade", "page_break_before"],
    eds.map((e, i) => [resumeId, e.id, i, e.degree, e.field, e.institution, e.location, e.startDate, e.endDate, e.grade, !!e.pageBreakBefore]),
  );
  eds.forEach((e) => addBullets(e.bullets, "education_id", e.id));

  const prjs = uniqueIds(d.projects, "prj", seenEntry);
  await insertMany(
    q,
    "projects",
    ["resume_id", "id", "position", "name", "role", "url", "start_date", "end_date", "page_break_before"],
    prjs.map((p, i) => [resumeId, p.id, i, p.name, p.role, p.url, p.startDate, p.endDate, !!p.pageBreakBefore]),
  );
  await insertMany(q, "project_technologies", ["resume_id", "project_id", "position", "name"], prjs.flatMap((p) => p.technologies.map((t, i) => [resumeId, p.id, i, t])));
  prjs.forEach((p) => addBullets(p.bullets, "project_id", p.id));

  const groups = uniqueIds(d.skills, "sk", seenEntry);
  await insertMany(q, "skill_groups", ["resume_id", "id", "position", "category"], groups.map((g, i) => [resumeId, g.id, i, g.category]));
  await insertMany(q, "skill_items", ["resume_id", "group_id", "position", "name"], groups.flatMap((g) => g.items.map((it, i) => [resumeId, g.id, i, it])));

  await insertMany(
    q,
    "certifications",
    ["resume_id", "id", "position", "name", "issuer", "issued_on", "url"],
    uniqueIds(d.certifications, "cert", seenEntry).map((c, i) => [resumeId, c.id, i, c.name, c.issuer, c.date, c.url]),
  );

  const adds = uniqueIds(d.additional, "add", seenEntry);
  await insertMany(q, "additional_sections", ["resume_id", "id", "position", "title"], adds.map((a, i) => [resumeId, a.id, i, a.title]));
  adds.forEach((a) => addBullets(a.bullets, "additional_id", a.id));

  await insertMany(q, "bullets", ["resume_id", "id", "experience_id", "education_id", "project_id", "additional_id", "position", "text", "origin", "source_text"], bulletRows);
}

// ---------- resume content: load (assemble) ----------

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v));

async function readContent(q: Queryable, resumeId: string): Promise<{ data: ResumeData; settings: ResumeSettings }> {
  const p = [resumeId];
  const sel = (sql: string) => q.query<Row>(sql, p).then((r) => r.rows);
  const contact = (await sel("SELECT * FROM resume_contacts WHERE resume_id = $1"))[0];
  const summary = (await sel("SELECT * FROM resume_summaries WHERE resume_id = $1"))[0];
  const st = (await sel("SELECT * FROM resume_settings WHERE resume_id = $1"))[0];
  const sections = await sel("SELECT section_key, hidden, page_break FROM resume_sections WHERE resume_id = $1 ORDER BY position");
  const links = await sel("SELECT * FROM contact_links WHERE resume_id = $1 ORDER BY position");
  const exps = await sel("SELECT * FROM experiences WHERE resume_id = $1 ORDER BY position");
  const eds = await sel("SELECT * FROM educations WHERE resume_id = $1 ORDER BY position");
  const prjs = await sel("SELECT * FROM projects WHERE resume_id = $1 ORDER BY position");
  const techs = await sel("SELECT * FROM project_technologies WHERE resume_id = $1 ORDER BY project_id, position");
  const groups = await sel("SELECT * FROM skill_groups WHERE resume_id = $1 ORDER BY position");
  const items = await sel("SELECT * FROM skill_items WHERE resume_id = $1 ORDER BY group_id, position");
  const certs = await sel("SELECT * FROM certifications WHERE resume_id = $1 ORDER BY position");
  const adds = await sel("SELECT * FROM additional_sections WHERE resume_id = $1 ORDER BY position");
  const bullets = await sel("SELECT * FROM bullets WHERE resume_id = $1 ORDER BY position");

  const bulletsOf = (col: string, id: unknown): Bullet[] =>
    bullets
      .filter((b) => b[col] === id)
      .map((b) => ({ id: str(b.id), text: str(b.text), origin: str(b.origin) as Bullet["origin"], ...(b.source_text != null ? { sourceText: str(b.source_text) } : {}) }));

  const data = ResumeData.parse({
    contact: {
      fullName: str(contact?.full_name),
      headline: str(contact?.headline),
      email: str(contact?.email),
      phone: str(contact?.phone),
      location: str(contact?.location),
      links: links.map((l) => ({ id: str(l.id), label: str(l.label), url: str(l.url) })),
    },
    summary: { text: str(summary?.text), origin: summary ? str(summary.origin) : "user", ...(summary?.source_text != null ? { sourceText: str(summary.source_text) } : {}) },
    experience: exps.map((e) => ({
      id: str(e.id),
      title: str(e.title),
      company: str(e.company),
      location: str(e.location),
      employmentType: str(e.employment_type),
      startDate: str(e.start_date),
      endDate: str(e.end_date),
      current: !!e.is_current,
      bullets: bulletsOf("experience_id", e.id),
      ...(e.page_break_before ? { pageBreakBefore: true } : {}),
    })),
    education: eds.map((e) => ({
      id: str(e.id),
      degree: str(e.degree),
      field: str(e.field),
      institution: str(e.institution),
      location: str(e.location),
      startDate: str(e.start_date),
      endDate: str(e.end_date),
      grade: str(e.grade),
      bullets: bulletsOf("education_id", e.id),
      ...(e.page_break_before ? { pageBreakBefore: true } : {}),
    })),
    projects: prjs.map((pr) => ({
      id: str(pr.id),
      name: str(pr.name),
      role: str(pr.role),
      url: str(pr.url),
      technologies: techs.filter((t) => t.project_id === pr.id).map((t) => str(t.name)),
      startDate: str(pr.start_date),
      endDate: str(pr.end_date),
      bullets: bulletsOf("project_id", pr.id),
      ...(pr.page_break_before ? { pageBreakBefore: true } : {}),
    })),
    skills: groups.map((g) => ({ id: str(g.id), category: str(g.category), items: items.filter((i) => i.group_id === g.id).map((i) => str(i.name)) })),
    certifications: certs.map((c) => ({ id: str(c.id), name: str(c.name), issuer: str(c.issuer), date: str(c.issued_on), url: str(c.url) })),
    additional: adds.map((a) => ({ id: str(a.id), title: str(a.title), bullets: bulletsOf("additional_id", a.id) })),
  });
  const order = sections.map((x) => str(x.section_key)) as SectionKey[];
  const settings = ResumeSettings.parse(
    st
      ? {
          template: st.template,
          fontFamily: st.font_family,
          headingFont: st.heading_font ?? null,
          fontSize: Number(st.font_size),
          margin: Number(st.margin),
          lineHeight: Number(st.line_height),
          sectionSpacing: Number(st.section_spacing),
          accentColor: st.accent_color == null ? null : str(st.accent_color),
          headingCase: st.heading_case,
          summaryTitle: st.summary_title ?? "Summary",
          skillsTitle: st.skills_title ?? "Skills",
          pageSize: st.page_size,
          pageFit: st.page_fit ?? "continue",
          market: st.market,
          dateFormat: st.date_format,
          writingStyle: st.writing_style,
          sectionOrder: order.length ? order : [...SECTION_KEYS],
          hiddenSections: sections.filter((x) => x.hidden).map((x) => str(x.section_key)),
          pageBreaks: sections.filter((x) => x.page_break).map((x) => str(x.section_key)),
        }
      : {},
  );
  return { data, settings };
}

// ---------- resumes ----------

interface ResumeRow {
  id: string;
  name: string;
  kind: ResumeKind;
  parent_id: string | null;
  job_id: string | null;
  revision: number;
  created_at: number;
  updated_at: number;
}

const RESUME_COLS = `id, name, kind, parent_id, job_id, revision, ${ts("created_at")}, ${ts("updated_at")}`;

function toSummary(r: ResumeRow): ResumeSummary {
  return { id: r.id, name: r.name, kind: r.kind, parentId: r.parent_id, jobId: r.job_id, revision: Number(r.revision), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) };
}

export async function listResumes(userId: string): Promise<ResumeSummary[]> {
  const r = await getDb().query<ResumeRow>(`SELECT ${RESUME_COLS} FROM resumes WHERE user_id = $1 ORDER BY kind = 'master' DESC, updated_at DESC`, [userId]);
  return r.rows.map(toSummary);
}

async function getResumeWith(q: Queryable, userId: string, id: string, lock = false): Promise<ResumeRecord | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = (await q.query<ResumeRow>(`SELECT ${RESUME_COLS} FROM resumes WHERE id = $1 AND user_id = $2${lock ? " FOR UPDATE" : ""}`, [id, userId])).rows[0];
  if (!r) return null;
  return { ...toSummary(r), ...(await readContent(q, id)) };
}

export function getResume(userId: string, id: string): Promise<ResumeRecord | null> {
  return getResumeWith(getDb(), userId, id);
}

export async function createResume(
  userId: string,
  input: { name: string; kind: ResumeKind; data: ResumeData; settings?: ResumeSettings; parentId?: string | null; jobId?: string | null },
): Promise<ResumeRecord> {
  const id = randomUUID();
  await getDb().tx(async (q) => {
    if (input.parentId && !(await q.query("SELECT 1 FROM resumes WHERE id = $1 AND user_id = $2", [input.parentId, userId])).rows.length) throw new NotFoundError("Parent resume not found");
    if (input.jobId && !(await q.query("SELECT 1 FROM jobs WHERE id = $1 AND user_id = $2", [input.jobId, userId])).rows.length) throw new NotFoundError("Job not found");
    await q.query("INSERT INTO resumes (id, user_id, name, kind, parent_id, job_id) VALUES ($1,$2,$3,$4,$5,$6)", [
      id,
      userId,
      input.name.slice(0, 120) || "Untitled resume",
      input.kind,
      input.parentId ?? null,
      input.jobId ?? null,
    ]);
    await writeContent(q, id, input.data, input.settings ?? defaultSettings());
  });
  return (await getResume(userId, id))!;
}

const AUTO_VERSION_INTERVAL_MS = 10 * 60 * 1000;

async function insertVersion(q: Queryable, userId: string, r: ResumeRecord, note: string) {
  await q.query("INSERT INTO resume_versions (id, resume_id, user_id, revision, data, settings, note) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7)", [
    randomUUID(),
    r.id,
    userId,
    r.revision,
    JSON.stringify(r.data),
    JSON.stringify(r.settings),
    note.slice(0, 200),
  ]);
  // Keep the 50 most recent versions per resume.
  await q.query(
    `DELETE FROM resume_versions WHERE resume_id = $1 AND user_id = $2 AND id NOT IN
       (SELECT id FROM resume_versions WHERE resume_id = $1 AND user_id = $2 ORDER BY created_at DESC LIMIT 50)`,
    [r.id, userId],
  );
}

/**
 * Saves with optimistic concurrency: `baseRevision` must match the stored revision, otherwise
 * ConflictError (e.g. edited in another tab). A version snapshot of the previous state is taken
 * at most every 10 minutes, or immediately when `snapshotNote` is given.
 */
export async function updateResume(
  userId: string,
  id: string,
  patch: { name?: string; data?: ResumeData; settings?: ResumeSettings; jobId?: string | null },
  baseRevision: number,
  snapshotNote?: string,
): Promise<ResumeRecord> {
  await getDb().tx(async (q) => {
    const current = await getResumeWith(q, userId, id, true);
    if (!current) throw new NotFoundError("Not found");
    if (current.revision !== baseRevision) throw new ConflictError(current.revision);
    const last = (await q.query<{ t: number | null }>(`SELECT ${ms.replace("%s", "max(created_at)")} AS t FROM resume_versions WHERE resume_id = $1 AND user_id = $2`, [id, userId])).rows[0];
    const contentChanged = patch.data !== undefined || patch.settings !== undefined;
    if (snapshotNote !== undefined || (contentChanged && Date.now() - Number(last?.t ?? 0) > AUTO_VERSION_INTERVAL_MS)) {
      await insertVersion(q, userId, current, snapshotNote ?? "Autosave checkpoint");
    }
    const jobId = patch.jobId !== undefined ? patch.jobId : current.jobId;
    if (jobId && !(await q.query("SELECT 1 FROM jobs WHERE id = $1 AND user_id = $2", [jobId, userId])).rows.length) throw new NotFoundError("Job not found");
    if (contentChanged) await writeContent(q, id, patch.data ?? current.data, patch.settings ?? current.settings);
    const name = patch.name !== undefined ? patch.name.slice(0, 120) || current.name : current.name;
    await q.query("UPDATE resumes SET name = $1, job_id = $2, revision = revision + 1, updated_at = now() WHERE id = $3 AND user_id = $4", [name, jobId, id, userId]);
  });
  return (await getResume(userId, id))!;
}

export async function deleteResume(userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return (await getDb().query("DELETE FROM resumes WHERE id = $1 AND user_id = $2", [id, userId])).rowCount > 0;
}

/** Copies a resume. Tailored copies keep a pointer to their source; the source is never modified. */
export async function duplicateResume(userId: string, id: string, opts: { name?: string; kind?: ResumeKind; jobId?: string | null } = {}): Promise<ResumeRecord | null> {
  const src = await getResume(userId, id);
  if (!src) return null;
  const kind = opts.kind ?? src.kind;
  return createResume(userId, {
    name: opts.name ?? `${src.name} (copy)`,
    kind,
    data: structuredClone(src.data),
    settings: structuredClone(src.settings),
    parentId: kind === "tailored" ? src.id : src.parentId,
    jobId: opts.jobId !== undefined ? opts.jobId : src.jobId,
  });
}

// ---------- versions ----------

export async function snapshotResume(userId: string, id: string, note: string): Promise<boolean> {
  const r = await getResume(userId, id);
  if (!r) return false;
  await insertVersion(getDb(), userId, r, note);
  return true;
}

export async function listVersions(userId: string, resumeId: string): Promise<VersionSummary[]> {
  if (!/^[0-9a-f-]{36}$/i.test(resumeId)) return [];
  const r = await getDb().query<{ id: string; revision: number; note: string; created_at: number }>(
    `SELECT id, revision, note, ${ts("created_at")} FROM resume_versions WHERE resume_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
    [resumeId, userId],
  );
  return r.rows.map((v) => ({ id: v.id, revision: Number(v.revision), note: v.note, createdAt: Number(v.created_at) }));
}

const parseJson = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

export async function getVersion(userId: string, resumeId: string, versionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(versionId) || !/^[0-9a-f-]{36}$/i.test(resumeId)) return null;
  const row = (
    await getDb().query<{ data: unknown; settings: unknown; revision: number; note: string; created_at: number }>(
      `SELECT data, settings, revision, note, ${ts("created_at")} FROM resume_versions WHERE id = $1 AND resume_id = $2 AND user_id = $3`,
      [versionId, resumeId, userId],
    )
  ).rows[0];
  if (!row) return null;
  return {
    revision: Number(row.revision),
    note: row.note,
    createdAt: Number(row.created_at),
    data: ResumeData.parse(parseJson(row.data)),
    settings: ResumeSettings.parse(parseJson(row.settings)),
  };
}

/** Restores a version. The current state is snapshotted first, so a restore can itself be undone. */
export async function restoreVersion(userId: string, resumeId: string, versionId: string): Promise<ResumeRecord | null> {
  const v = await getVersion(userId, resumeId, versionId);
  const current = await getResume(userId, resumeId);
  if (!v || !current) return null;
  return updateResume(userId, resumeId, { data: v.data, settings: v.settings }, current.revision, `Before restoring version from ${new Date(v.createdAt).toISOString()}`);
}

// ---------- jobs ----------

interface JobRow {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  description: string;
  status: string;
  applied_at: string | null;
  follow_up_on: string | null;
  board_position: number;
  notes: string;
  created_at: number;
  updated_at: number;
}

const JOB_COLS = `id, title, company, location, url, description, status, to_char(applied_at, 'YYYY-MM-DD') AS applied_at,
  to_char(follow_up_on, 'YYYY-MM-DD') AS follow_up_on, board_position, notes, ${ts("created_at")}, ${ts("updated_at")}`;

function toJob(r: JobRow): Job {
  const base = JobInput.parse({
    title: r.title,
    company: r.company,
    location: r.location,
    url: r.url,
    description: r.description,
    status: r.status,
    appliedAt: r.applied_at ?? "",
    followUpOn: r.follow_up_on ?? "",
    boardPosition: Number(r.board_position),
    notes: r.notes,
  });
  return { ...base, id: r.id, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) };
}

export async function listJobs(userId: string): Promise<Job[]> {
  return (await getDb().query<JobRow>(`SELECT ${JOB_COLS} FROM jobs WHERE user_id = $1 ORDER BY board_position, updated_at DESC`, [userId])).rows.map(toJob);
}

/** Moves jobs on the Kanban board: sets status and order for each id (only the user's own jobs). */
export async function arrangeJobs(userId: string, moves: { id: string; status: Job["status"]; position: number }[]) {
  await getDb().tx(async (q) => {
    for (const m of moves) {
      if (!/^[0-9a-f-]{36}$/i.test(m.id)) continue;
      await q.query(
        `UPDATE jobs SET status = $1::text, board_position = $2, updated_at = now(),
           applied_at = CASE WHEN $1::text = 'applied' AND applied_at IS NULL THEN current_date ELSE applied_at END
         WHERE id = $3 AND user_id = $4`,
        [m.status, m.position, m.id, userId],
      );
    }
  });
}

export async function getJob(userId: string, id: string): Promise<Job | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = (await getDb().query<JobRow>(`SELECT ${JOB_COLS} FROM jobs WHERE id = $1 AND user_id = $2`, [id, userId])).rows[0];
  return r ? toJob(r) : null;
}

export async function createJob(userId: string, input: z.input<typeof JobInput>): Promise<Job> {
  const j = JobInput.parse(input);
  const id = randomUUID();
  await getDb().query(
    `INSERT INTO jobs (id, user_id, title, company, location, url, description, status, applied_at, follow_up_on, board_position, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, userId, j.title, j.company, j.location, j.url, j.description, j.status, j.appliedAt || null, j.followUpOn || null, j.boardPosition, j.notes],
  );
  return (await getJob(userId, id))!;
}

export async function updateJob(userId: string, id: string, input: Partial<JobInput>): Promise<Job | null> {
  const cur = await getJob(userId, id);
  if (!cur) return null;
  const j = JobInput.parse({ ...cur, ...input });
  await getDb().query(
    `UPDATE jobs SET title = $1, company = $2, location = $3, url = $4, description = $5, status = $6, applied_at = $7, follow_up_on = $8,
       board_position = $9, notes = $10, updated_at = now() WHERE id = $11 AND user_id = $12`,
    [j.title, j.company, j.location, j.url, j.description, j.status, j.appliedAt || null, j.followUpOn || null, j.boardPosition, j.notes, id, userId],
  );
  return getJob(userId, id);
}

export async function deleteJob(userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return (await getDb().query("DELETE FROM jobs WHERE id = $1 AND user_id = $2", [id, userId])).rowCount > 0;
}

/** Everything stored for a user, for the data-export control. Password hashes are excluded. */
export async function exportUserData(userId: string) {
  const user = (
    await getDb().query<{ email: string; full_name: string; phone: string; created_at: number }>(`SELECT email, full_name, phone, ${ts("created_at")} FROM users WHERE id = $1`, [userId])
  ).rows[0];
  const summaries = await listResumes(userId);
  const resumes = [];
  for (const s of summaries) resumes.push(await getResume(userId, s.id));
  return {
    account: user ? { email: user.email, fullName: user.full_name, phone: user.phone, createdAt: new Date(Number(user.created_at)).toISOString() } : null, resumes, jobs: await listJobs(userId), documents: await listDocuments(userId) };
}

// ---------- documents (cover letters, messages, LinkedIn text) ----------

interface DocRow {
  id: string;
  resume_id: string | null;
  job_id: string | null;
  kind: string;
  title: string;
  body: string;
  origin: string;
  created_at: number;
  updated_at: number;
}

const DOC_COLS = `id, resume_id, job_id, kind, title, body, origin, ${ts("created_at")}, ${ts("updated_at")}`;

function toDoc(r: DocRow): AppDocument {
  const base = DocumentInput.parse({ kind: r.kind, title: r.title, body: r.body, origin: r.origin, resumeId: r.resume_id, jobId: r.job_id });
  return { ...base, id: r.id, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) };
}

export async function listDocuments(userId: string, filter: { resumeId?: string } = {}): Promise<AppDocument[]> {
  const byResume = filter.resumeId && /^[0-9a-f-]{36}$/i.test(filter.resumeId);
  const r = await getDb().query<DocRow>(
    `SELECT ${DOC_COLS} FROM documents WHERE user_id = $1${byResume ? " AND resume_id = $2" : ""} ORDER BY updated_at DESC`,
    byResume ? [userId, filter.resumeId] : [userId],
  );
  return r.rows.map(toDoc);
}

export async function getDocument(userId: string, id: string): Promise<AppDocument | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = (await getDb().query<DocRow>(`SELECT ${DOC_COLS} FROM documents WHERE id = $1 AND user_id = $2`, [id, userId])).rows[0];
  return r ? toDoc(r) : null;
}

/** Links to a resume/job only if they belong to the same user. */
async function checkLinks(userId: string, d: DocumentInput) {
  if (d.resumeId && !(await getDb().query("SELECT 1 FROM resumes WHERE id = $1 AND user_id = $2", [d.resumeId, userId])).rows.length) throw new NotFoundError("Resume not found");
  if (d.jobId && !(await getDb().query("SELECT 1 FROM jobs WHERE id = $1 AND user_id = $2", [d.jobId, userId])).rows.length) throw new NotFoundError("Job not found");
}

export async function createDocument(userId: string, input: DocumentInput): Promise<AppDocument> {
  const d = DocumentInput.parse(input);
  await checkLinks(userId, d);
  const id = randomUUID();
  await getDb().query("INSERT INTO documents (id, user_id, resume_id, job_id, kind, title, body, origin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    id,
    userId,
    d.resumeId,
    d.jobId,
    d.kind,
    d.title,
    d.body,
    d.origin,
  ]);
  return (await getDocument(userId, id))!;
}

export async function updateDocument(userId: string, id: string, patch: Partial<DocumentInput>): Promise<AppDocument | null> {
  const cur = await getDocument(userId, id);
  if (!cur) return null;
  const d = DocumentInput.parse({ ...cur, ...patch });
  await checkLinks(userId, d);
  await getDb().query("UPDATE documents SET kind = $1, title = $2, body = $3, origin = $4, resume_id = $5, job_id = $6, updated_at = now() WHERE id = $7 AND user_id = $8", [
    d.kind,
    d.title,
    d.body,
    d.origin,
    d.resumeId,
    d.jobId,
    id,
    userId,
  ]);
  return getDocument(userId, id);
}

export async function deleteDocument(userId: string, id: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  return (await getDb().query("DELETE FROM documents WHERE id = $1 AND user_id = $2", [id, userId])).rowCount > 0;
}