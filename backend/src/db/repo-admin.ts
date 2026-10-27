import { randomUUID } from "node:crypto";
import { getDb } from "./index";
import type { AdminStats, MyReview, PublicReview } from "@resume/shared/types/api";

/**
 * Email tokens (verification and password reset), password changes, and the owner's usage
 * statistics. Statistics are counts only: no IP addresses, cookies or resume content.
 */

// ---------- email tokens ----------

export type TokenPurpose = "verify" | "reset";

export async function createEmailToken(userId: string, purpose: TokenPurpose, tokenHash: string, ttlMs: number) {
  const db = getDb();
  // One live link per purpose: a new email makes the previous link stop working.
  await db.query("DELETE FROM email_tokens WHERE user_id = $1 AND purpose = $2", [userId, purpose]);
  await db.query("INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, now() + ($4 || ' milliseconds')::interval)", [
    tokenHash,
    userId,
    purpose,
    String(Math.round(ttlMs)),
  ]);
}

/** Marks the token used and returns its user, or null if it's unknown, expired, used or for another purpose. */
export async function consumeEmailToken(tokenHash: string, purpose: TokenPurpose): Promise<string | null> {
  const r = await getDb().query<{ user_id: string }>(
    "UPDATE email_tokens SET used_at = now() WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now() RETURNING user_id",
    [tokenHash, purpose],
  );
  return r.rows[0]?.user_id ?? null;
}

export async function markEmailVerified(userId: string) {
  await getDb().query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1", [userId]);
}

/** New password; every existing session is signed out, and any other reset link stops working. */
export async function setPassword(userId: string, passwordHash: string) {
  const db = getDb();
  await db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [userId, passwordHash]);
  await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  await db.query("DELETE FROM email_tokens WHERE user_id = $1 AND purpose = 'reset'", [userId]);
}

// ---------- recovery codes and admin activation ----------

export async function setRecoveryHash(userId: string, hash: string) {
  await getDb().query("UPDATE users SET recovery_hash = $2 WHERE id = $1", [userId, hash]);
}

export async function findRecovery(email: string): Promise<{ id: string; recovery_hash: string | null } | undefined> {
  return (await getDb().query<{ id: string; recovery_hash: string | null }>("SELECT id, recovery_hash FROM users WHERE email = $1", [email.toLowerCase()])).rows[0];
}

/** Whether any of these addresses already belongs to a verified account (then no setup code is needed). */
export async function hasVerifiedAdmin(emails: string[]): Promise<boolean> {
  if (!emails.length) return false;
  const r = await getDb().query("SELECT 1 FROM users WHERE email = ANY($1::text[]) AND email_verified_at IS NOT NULL LIMIT 1", [emails]);
  return r.rows.length > 0;
}

export async function findUserIdByEmail(email: string): Promise<string | undefined> {
  return (await getDb().query<{ id: string }>("SELECT id FROM users WHERE email = $1", [email.toLowerCase()])).rows[0]?.id;
}

// ---------- reviews ----------

const iso = (col: string) => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

export async function getMyReview(userId: string): Promise<MyReview | null> {
  const r = await getDb().query<{ rating: number; comment: string; updated: string }>(`SELECT rating, comment, ${iso("updated_at")} AS updated FROM reviews WHERE user_id = $1`, [userId]);
  const row = r.rows[0];
  return row ? { rating: Number(row.rating), comment: row.comment, updatedAt: row.updated } : null;
}

/** Saves the user's one review. A changed comment leaves the homepage until the owner picks it again. */
export async function saveReview(userId: string, rating: number, comment: string) {
  await getDb().query(
    `INSERT INTO reviews (id, user_id, rating, comment) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now(),
       featured = reviews.featured AND reviews.comment = EXCLUDED.comment`,
    [randomUUID(), userId, rating, comment],
  );
}

export async function setReviewFeatured(id: string, featured: boolean): Promise<boolean> {
  return ((await getDb().query("UPDATE reviews SET featured = $2 WHERE id = $1", [id, featured])).rowCount ?? 0) > 0;
}

export async function deleteReview(id: string): Promise<boolean> {
  return ((await getDb().query("DELETE FROM reviews WHERE id = $1", [id])).rowCount ?? 0) > 0;
}

/** Reviews the owner chose for the homepage; first names only. */
export async function publicReviews(limit = 6): Promise<PublicReview[]> {
  const r = await getDb().query<{ rating: number; comment: string; full_name: string }>(
    `SELECT r.rating, r.comment, u.full_name FROM reviews r JOIN users u ON u.id = r.user_id
      WHERE r.featured AND r.comment <> '' ORDER BY r.rating DESC, r.updated_at DESC LIMIT $1`,
    [limit],
  );
  return r.rows.map((x) => ({ rating: Number(x.rating), comment: x.comment, name: (x.full_name || "A user").trim().split(/\s+/)[0] }));
}

// ---------- usage statistics ----------

export async function recordPageView(v: { path: string; visitor: string; referrer: string; device: "mobile" | "tablet" | "desktop" }) {
  const db = getDb();
  await db.query("INSERT INTO page_views (path, visitor, referrer, device) VALUES ($1, $2, $3, $4)", [v.path, v.visitor, v.referrer, v.device]);
  // Keep about 13 months; pruned now and then rather than on a schedule.
  if (Math.random() < 0.01) await db.query("DELETE FROM page_views WHERE day < current_date - 400");
}

export async function recordEvent(name: string) {
  await getDb().query(
    "INSERT INTO usage_events (day, name, count) VALUES (current_date, $1, 1) ON CONFLICT (day, name) DO UPDATE SET count = usage_events.count + 1",
    [name.slice(0, 40)],
  );
}

const num = (v: unknown) => Number(v ?? 0) || 0;

export type StatsRange = AdminStats["range"];

export async function adminStats(flags: { analyticsOn: boolean; emailOn: boolean }, range: StatsRange = "30"): Promise<AdminStats> {
  const db = getDb();
  const one = async <T extends Record<string, unknown>>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows[0] ?? ({} as T);
  const all = async <T,>(sql: string, p: unknown[] = []) => (await db.query<T>(sql, p)).rows;

  const totals = await one<Record<string, unknown>>(`SELECT
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM users WHERE email_verified_at IS NOT NULL) AS verified,
      (SELECT count(*) FROM resumes WHERE kind = 'master') AS resumes,
      (SELECT count(*) FROM resumes WHERE kind = 'tailored') AS tailored,
      (SELECT count(*) FROM jobs) AS jobs,
      (SELECT count(*) FROM users WHERE created_at >= now() - interval '7 days') AS u7,
      (SELECT count(*) FROM users WHERE created_at >= now() - interval '30 days') AS u30`);
  // Of the users who signed up in the chosen period, how many have built a resume (conversion).
  const conversion = await one<Record<string, unknown>>(`SELECT count(*) AS signed_up,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM resumes r WHERE r.user_id = u.id)) AS with_resume
      FROM users u WHERE ${range === "all" ? "true" : `u.created_at >= current_date - ${Number(range) - 1}`}`);

  const reviewSummary = await one<Record<string, unknown>>(`SELECT count(*) AS n, COALESCE(avg(rating), 0) AS avg,
      count(*) FILTER (WHERE rating = 1) AS r1, count(*) FILTER (WHERE rating = 2) AS r2, count(*) FILTER (WHERE rating = 3) AS r3,
      count(*) FILTER (WHERE rating = 4) AS r4, count(*) FILTER (WHERE rating = 5) AS r5 FROM reviews`);
  const reviewItems = await all<Record<string, unknown>>(`
    SELECT r.id, r.rating, r.comment, r.featured, u.full_name, u.email, ${iso("r.updated_at")} AS updated
      FROM reviews r JOIN users u ON u.id = r.user_id ORDER BY r.updated_at DESC LIMIT 50`);

  // The chosen period as SQL conditions. Built only from the fixed range values, never from user text.
  const days = range === "all" ? null : Number(range);
  const inDays = days ? `day > current_date - ${days}` : "true";
  const inTime = (col: string) => (days ? `${col} >= current_date - ${days - 1}` : "true");

  const traffic = await one<Record<string, unknown>>(`SELECT
      (SELECT count(*) FROM page_views WHERE ${inDays}) AS views,
      (SELECT count(*) FROM (SELECT DISTINCT day, visitor FROM page_views WHERE ${inDays}) v) AS visitors,
      (SELECT count(*) FROM page_views WHERE day = current_date) AS views_today,
      (SELECT count(DISTINCT visitor) FROM page_views WHERE day = current_date) AS visitors_today,
      (SELECT count(*) FROM users WHERE ${inTime("created_at")}) AS new_users,
      (SELECT count(DISTINCT user_id) FROM resumes WHERE ${inTime("updated_at")}) AS active_users`);

  // Days for 7/30, months (last 12) for all time, so the chart stays readable.
  const series = days
    ? await all<Record<string, unknown>>(`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS key,
           COALESCE(v.views, 0) AS views, COALESCE(v.visitors, 0) AS visitors,
           COALESCE(s.n, 0) AS signups, COALESCE(dl.n, 0) AS downloads
      FROM (SELECT (current_date - g)::date AS day FROM generate_series(0, ${days - 1}) AS g) d
      LEFT JOIN (SELECT day, count(*) AS views, count(DISTINCT visitor) AS visitors FROM page_views WHERE ${inDays} GROUP BY day) v ON v.day = d.day
      LEFT JOIN (SELECT created_at::date AS day, count(*) AS n FROM users WHERE ${inTime("created_at")} GROUP BY 1) s ON s.day = d.day
      LEFT JOIN (SELECT day, sum(count) AS n FROM usage_events WHERE name LIKE 'download_%' AND ${inDays} GROUP BY day) dl ON dl.day = d.day
     ORDER BY d.day`)
    : await all<Record<string, unknown>>(`
    SELECT to_char(m.month, 'YYYY-MM') AS key,
           COALESCE(v.views, 0) AS views, COALESCE(v.visitors, 0) AS visitors,
           COALESCE(s.n, 0) AS signups, COALESCE(dl.n, 0) AS downloads
      FROM (SELECT (date_trunc('month', current_date) - (g || ' months')::interval)::date AS month FROM generate_series(0, 11) AS g) m
      LEFT JOIN (SELECT date_trunc('month', day)::date AS month, count(*) AS views, count(DISTINCT (day, visitor)) AS visitors FROM page_views GROUP BY 1) v ON v.month = m.month
      LEFT JOIN (SELECT date_trunc('month', created_at)::date AS month, count(*) AS n FROM users GROUP BY 1) s ON s.month = m.month
      LEFT JOIN (SELECT date_trunc('month', day)::date AS month, sum(count) AS n FROM usage_events WHERE name LIKE 'download_%' GROUP BY 1) dl ON dl.month = m.month
     ORDER BY m.month`);

  const topPages = await all<Record<string, unknown>>(
    `SELECT path, count(*) AS views FROM page_views WHERE ${inDays} GROUP BY path ORDER BY views DESC, path LIMIT 10`,
  );
  const topReferrers = await all<Record<string, unknown>>(
    `SELECT CASE WHEN referrer = '' THEN 'Direct / unknown' ELSE referrer END AS source, count(*) AS views FROM page_views WHERE ${inDays} GROUP BY 1 ORDER BY views DESC, source LIMIT 10`,
  );
  const devices = await all<Record<string, unknown>>(`SELECT device, count(*) AS views FROM page_views WHERE ${inDays} GROUP BY device ORDER BY views DESC`);
  const events = await all<Record<string, unknown>>(`SELECT name, sum(count) AS n FROM usage_events WHERE ${inDays} GROUP BY name`);

  const recentUsers = await all<Record<string, unknown>>(`
    SELECT u.email, u.full_name, u.phone, to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS joined,
           (u.email_verified_at IS NOT NULL) AS verified,
           (SELECT count(*) FROM resumes r WHERE r.user_id = u.id) AS resumes
      FROM users u ORDER BY u.created_at DESC LIMIT 25`);

  const money = await one<Record<string, unknown>>(`SELECT
      COALESCE(sum(amount_paise), 0) AS total,
      COALESCE(sum(amount_paise) FILTER (WHERE created_at >= date_trunc('month', now())), 0) AS month,
      COALESCE(sum(amount_paise) FILTER (WHERE ${inTime("created_at")}), 0) AS in_range,
      count(*) FILTER (WHERE ${inTime("created_at")}) AS n FROM payments`);
  const recentPayments = await all<Record<string, unknown>>(`
    SELECT amount_paise, currency, source, reference, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS at
      FROM payments ORDER BY created_at DESC LIMIT 10`);

  return {
    generatedAt: new Date().toISOString(),
    ...flags,
    range,
    totals: {
      users: num(totals.users),
      verifiedUsers: num(totals.verified),
      resumes: num(totals.resumes),
      tailored: num(totals.tailored),
      jobs: num(totals.jobs),
      usersLast7: num(totals.u7),
      usersLast30: num(totals.u30),
      newUsers: num(traffic.new_users),
      activeUsers: num(traffic.active_users),
      signedUpWithResume: num(conversion.with_resume),
      signedUpWithoutResume: num(conversion.signed_up) - num(conversion.with_resume),
    },
    reviews: {
      count: num(reviewSummary.n),
      average: Math.round(Number(reviewSummary.avg ?? 0) * 10) / 10,
      distribution: [num(reviewSummary.r1), num(reviewSummary.r2), num(reviewSummary.r3), num(reviewSummary.r4), num(reviewSummary.r5)],
      items: reviewItems.map((r) => ({
        id: String(r.id),
        rating: num(r.rating),
        comment: String(r.comment ?? ""),
        featured: !!r.featured,
        name: String(r.full_name ?? ""),
        email: String(r.email),
        updatedAt: String(r.updated),
      })),
    },
    traffic: { views: num(traffic.views), visitors: num(traffic.visitors), viewsToday: num(traffic.views_today), visitorsToday: num(traffic.visitors_today) },
    series: {
      granularity: days ? "day" : "month",
      points: series.map((d) => ({ key: String(d.key), views: num(d.views), visitors: num(d.visitors), signups: num(d.signups), downloads: num(d.downloads) })),
    },
    topPages: topPages.map((p) => ({ path: String(p.path), views: num(p.views) })),
    topReferrers: topReferrers.map((r) => ({ source: String(r.source), views: num(r.views) })),
    devices: devices.map((d) => ({ device: d.device as "mobile" | "tablet" | "desktop", views: num(d.views) })),
    events: Object.fromEntries(events.map((e) => [String(e.name), num(e.n)])),
    recentUsers: recentUsers.map((u) => ({
      email: String(u.email),
      fullName: String(u.full_name ?? ""),
      phone: String(u.phone ?? ""),
      joined: String(u.joined),
      verified: !!u.verified,
      resumes: num(u.resumes),
    })),
    earnings: {
      totalPaise: num(money.total),
      monthPaise: num(money.month),
      rangePaise: num(money.in_range),
      payments: num(money.n),
      recent: recentPayments.map((p) => ({ amountPaise: num(p.amount_paise), currency: String(p.currency), source: String(p.source), reference: String(p.reference), at: String(p.at) })),
    },
  };
}
