import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDb } from "./index";
import { NotFoundError } from "./repo";
import { ContactInput, EventInput, type JobContact, type JobEvent } from "@resume/shared/schema/job";
import { StoryInput, type ShareLink, type Story } from "@resume/shared/schema/story";

/**
 * Application pipeline details (contacts, timeline), the interview story bank, and resume
 * share links. As elsewhere, every query is scoped to the signed-in user.
 */

const ms = (col: string, as = col) => `floor(extract(epoch from ${col}) * 1000)::float8 AS ${as}`;
const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

async function ownJob(userId: string, jobId: string) {
  if (!uuid(jobId) || !(await getDb().query("SELECT 1 FROM jobs WHERE id = $1 AND user_id = $2", [jobId, userId])).rows.length) throw new NotFoundError("Job not found");
}

// ---------- contacts ----------

type Row = Record<string, unknown>;
const toContact = (r: Row): JobContact => ({
  id: String(r.id),
  jobId: String(r.job_id),
  name: String(r.name),
  role: String(r.role),
  email: String(r.email),
  link: String(r.link),
  notes: String(r.notes),
  createdAt: Number(r.created_at),
});

export async function listContacts(userId: string, jobId: string): Promise<JobContact[]> {
  await ownJob(userId, jobId);
  const r = await getDb().query<Row>(`SELECT id, job_id, name, role, email, link, notes, ${ms("created_at")} FROM job_contacts WHERE job_id = $1 AND user_id = $2 ORDER BY created_at`, [jobId, userId]);
  return r.rows.map(toContact);
}

export async function addContact(userId: string, jobId: string, input: ContactInput): Promise<JobContact> {
  await ownJob(userId, jobId);
  const c = ContactInput.parse(input);
  const id = randomUUID();
  await getDb().query("INSERT INTO job_contacts (id, user_id, job_id, name, role, email, link, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [id, userId, jobId, c.name, c.role, c.email, c.link, c.notes]);
  return (await listContacts(userId, jobId)).find((x) => x.id === id)!;
}

export async function deleteContact(userId: string, id: string): Promise<boolean> {
  return uuid(id) && (await getDb().query("DELETE FROM job_contacts WHERE id = $1 AND user_id = $2", [id, userId])).rowCount > 0;
}

// ---------- timeline events ----------

const toEvent = (r: Row): JobEvent => ({
  id: String(r.id),
  jobId: String(r.job_id),
  kind: r.kind as JobEvent["kind"],
  title: String(r.title),
  body: String(r.body),
  happensOn: r.happens_on ? String(r.happens_on) : "",
  createdAt: Number(r.created_at),
});

const EVENT_COLS = `id, job_id, kind, title, body, to_char(happens_on, 'YYYY-MM-DD') AS happens_on, ${ms("created_at")}`;

export async function listEvents(userId: string, jobId: string): Promise<JobEvent[]> {
  await ownJob(userId, jobId);
  const r = await getDb().query<Row>(`SELECT ${EVENT_COLS} FROM job_events WHERE job_id = $1 AND user_id = $2 ORDER BY coalesce(happens_on, created_at::date) DESC, created_at DESC`, [jobId, userId]);
  return r.rows.map(toEvent);
}

export async function addEvent(userId: string, jobId: string, input: EventInput): Promise<JobEvent> {
  await ownJob(userId, jobId);
  const e = EventInput.parse(input);
  const id = randomUUID();
  await getDb().query("INSERT INTO job_events (id, user_id, job_id, kind, title, body, happens_on) VALUES ($1,$2,$3,$4,$5,$6,$7)", [id, userId, jobId, e.kind, e.title, e.body, e.happensOn || null]);
  return (await listEvents(userId, jobId)).find((x) => x.id === id)!;
}

export async function deleteEvent(userId: string, id: string): Promise<boolean> {
  return uuid(id) && (await getDb().query("DELETE FROM job_events WHERE id = $1 AND user_id = $2", [id, userId])).rowCount > 0;
}

/** Upcoming follow-ups and interviews across all applications (for reminders on the board). */
export async function upcoming(userId: string, days = 14) {
  const r = await getDb().query<Row>(
    `SELECT 'follow_up' AS kind, id AS job_id, title, company, to_char(follow_up_on, 'YYYY-MM-DD') AS on_date
       FROM jobs WHERE user_id = $1 AND follow_up_on IS NOT NULL AND follow_up_on <= current_date + $2::int
     UNION ALL
     SELECT 'interview', j.id, coalesce(nullif(e.title, ''), j.title), j.company, to_char(e.happens_on, 'YYYY-MM-DD')
       FROM job_events e JOIN jobs j ON j.id = e.job_id
      WHERE e.user_id = $1 AND e.kind = 'interview' AND e.happens_on BETWEEN current_date AND current_date + $2::int
     ORDER BY on_date`,
    [userId, days],
  );
  return r.rows.map((x) => ({ kind: String(x.kind) as "follow_up" | "interview", jobId: String(x.job_id), title: String(x.title), company: String(x.company), on: String(x.on_date) }));
}

// ---------- stories ----------

const toStory = (r: Row): Story => ({
  ...StoryInput.parse({
    resumeId: r.resume_id ?? null,
    sourceText: r.source_text,
    title: r.title,
    situation: r.situation,
    task: r.task,
    action: r.action,
    result: r.result,
    tags: r.tags ?? [],
  }),
  id: String(r.id),
  createdAt: Number(r.created_at),
  updatedAt: Number(r.updated_at),
});
const STORY_COLS = `id, resume_id, source_text, title, situation, task, action, result, tags, ${ms("created_at")}, ${ms("updated_at")}`;

export async function listStories(userId: string): Promise<Story[]> {
  return (await getDb().query<Row>(`SELECT ${STORY_COLS} FROM stories WHERE user_id = $1 ORDER BY updated_at DESC`, [userId])).rows.map(toStory);
}

async function checkResume(userId: string, resumeId: string | null) {
  if (resumeId && (!uuid(resumeId) || !(await getDb().query("SELECT 1 FROM resumes WHERE id = $1 AND user_id = $2", [resumeId, userId])).rows.length)) throw new NotFoundError("Resume not found");
}

export async function saveStory(userId: string, input: StoryInput, id?: string): Promise<Story> {
  const s = StoryInput.parse(input);
  await checkResume(userId, s.resumeId);
  if (id) {
    if (!uuid(id)) throw new NotFoundError("Not found");
    const r = await getDb().query(
      `UPDATE stories SET resume_id = $1, source_text = $2, title = $3, situation = $4, task = $5, action = $6, result = $7, tags = $8, updated_at = now()
       WHERE id = $9 AND user_id = $10`,
      [s.resumeId, s.sourceText, s.title, s.situation, s.task, s.action, s.result, s.tags, id, userId],
    );
    if (!r.rowCount) throw new NotFoundError("Not found");
  } else {
    id = randomUUID();
    await getDb().query(
      "INSERT INTO stories (id, user_id, resume_id, source_text, title, situation, task, action, result, tags) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [id, userId, s.resumeId, s.sourceText, s.title, s.situation, s.task, s.action, s.result, s.tags],
    );
  }
  return toStory((await getDb().query<Row>(`SELECT ${STORY_COLS} FROM stories WHERE id = $1 AND user_id = $2`, [id, userId])).rows[0]);
}

export async function deleteStory(userId: string, id: string): Promise<boolean> {
  return uuid(id) && (await getDb().query("DELETE FROM stories WHERE id = $1 AND user_id = $2", [id, userId])).rowCount > 0;
}

// ---------- share links ----------

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const toShare = (r: Row): ShareLink => ({
  id: String(r.id),
  resumeId: String(r.resume_id),
  hasPassword: !!r.password_hash,
  expiresAt: r.expires_at == null ? null : Number(r.expires_at),
  revoked: !!r.revoked,
  views: Number(r.views),
  lastViewedAt: r.last_viewed_at == null ? null : Number(r.last_viewed_at),
  createdAt: Number(r.created_at),
});
const SHARE_COLS = `id, resume_id, password_hash, ${ms("expires_at")}, revoked, views, ${ms("last_viewed_at")}, ${ms("created_at")}`;

export async function listShares(userId: string, resumeId: string): Promise<ShareLink[]> {
  await checkResume(userId, resumeId);
  return (await getDb().query<Row>(`SELECT ${SHARE_COLS} FROM share_links WHERE resume_id = $1 AND user_id = $2 ORDER BY created_at DESC`, [resumeId, userId])).rows.map(toShare);
}

/** Creates a link and returns its secret token once; only a hash is stored. */
export async function createShare(userId: string, resumeId: string, passwordHash: string | null, expiresInDays: number): Promise<{ link: ShareLink; token: string }> {
  await checkResume(userId, resumeId);
  const token = randomBytes(18).toString("base64url");
  const id = randomUUID();
  await getDb().query(
    `INSERT INTO share_links (id, user_id, resume_id, token_hash, password_hash, expires_at)
     VALUES ($1,$2,$3,$4,$5, CASE WHEN $6::int > 0 THEN now() + ($6::int * interval '1 day') ELSE NULL END)`,
    [id, userId, resumeId, sha(token), passwordHash, expiresInDays],
  );
  const link = (await listShares(userId, resumeId)).find((l) => l.id === id)!;
  return { link, token };
}

export async function revokeShare(userId: string, id: string): Promise<boolean> {
  return uuid(id) && (await getDb().query("UPDATE share_links SET revoked = true WHERE id = $1 AND user_id = $2", [id, userId])).rowCount > 0;
}

/** Looks up a live link by its token (no user context: this is the public side). */
export async function findShare(token: string): Promise<{ id: string; userId: string; resumeId: string; passwordHash: string | null } | null> {
  if (!/^[\w-]{10,64}$/.test(token)) return null;
  const r = (
    await getDb().query<Row>(
      "SELECT id, user_id, resume_id, password_hash FROM share_links WHERE token_hash = $1 AND NOT revoked AND (expires_at IS NULL OR expires_at > now())",
      [sha(token)],
    )
  ).rows[0];
  return r ? { id: String(r.id), userId: String(r.user_id), resumeId: String(r.resume_id), passwordHash: r.password_hash ? String(r.password_hash) : null } : null;
}

export async function recordShareView(id: string) {
  await getDb().query("UPDATE share_links SET views = views + 1, last_viewed_at = now() WHERE id = $1", [id]);
}

/** Pipeline, interview and sharing data for the account's data export. */
export async function exportPipelineData(userId: string) {
  const db = getDb();
  const contacts = (await db.query<Row>(`SELECT id, job_id, name, role, email, link, notes, ${ms("created_at")} FROM job_contacts WHERE user_id = $1 ORDER BY created_at`, [userId])).rows.map(toContact);
  const events = (await db.query<Row>(`SELECT ${EVENT_COLS} FROM job_events WHERE user_id = $1 ORDER BY created_at`, [userId])).rows.map(toEvent);
  const shareLinks = (await db.query<Row>(`SELECT ${SHARE_COLS} FROM share_links WHERE user_id = $1 ORDER BY created_at`, [userId])).rows.map(toShare);
  return { jobContacts: contacts, jobTimeline: events, stories: await listStories(userId), shareLinks };
}