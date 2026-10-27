import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "@/app";
import { normalizePath, referrerHost } from "@/analytics";
import { adminSetupCode } from "@/auth/admin";
import { useTestDb } from "./helpers";

const app = createApp();
const PASSWORD = "a good password 1";
const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36";
const UA_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36";

/** Emails "sent" during a test, captured from the Resend API call. */
let outbox: { to: string; subject: string; text: string }[] = [];

beforeEach(async () => {
  await useTestDb();
  outbox = [];
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("FRONTEND_ORIGIN", "http://localhost:3000");
  vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
  vi.stubEnv("ANALYTICS", "on");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      outbox.push({ to: b.to[0], subject: b.subject, text: b.text });
      return new Response("{}", { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function signUp(email: string) {
  const a = request.agent(app);
  await a.post("/api/auth/register").send({ email, password: PASSWORD, fullName: "Test User", phone: "+91 98765 43210" }).expect(201);
  await new Promise((r) => setTimeout(r, 20)); // the verification email is sent in the background
  return a;
}
const tokenFrom = (text: string, page: string) => new RegExp(`/${page}\\?token=([A-Za-z0-9_-]+)`).exec(text)?.[1] ?? "";

describe("email verification", () => {
  it("sends a link at sign-up; the link verifies the address once", async () => {
    const a = await signUp("new@example.com");
    expect((await a.get("/api/auth/me")).body.user.emailVerified).toBe(false);
    const mail = outbox.find((m) => m.to === "new@example.com")!;
    expect(mail.subject).toMatch(/confirm/i);
    const token = tokenFrom(mail.text, "verify-email");
    expect(mail.text).toContain("http://localhost:3000/verify-email?token=");
    await request(app).post("/api/auth/verify-email").send({ token }).expect(200);
    expect((await a.get("/api/auth/me")).body.user.emailVerified).toBe(true);
    await request(app).post("/api/auth/verify-email").send({ token }).expect(400);
  });

  it("can be re-sent from the account, and a new link replaces the old one", async () => {
    const a = await signUp("again@example.com");
    const first = tokenFrom(outbox[0].text, "verify-email");
    await a.post("/api/auth/send-verification").send({}).expect(200);
    const second = tokenFrom(outbox[1].text, "verify-email");
    await request(app).post("/api/auth/verify-email").send({ token: first }).expect(400);
    await request(app).post("/api/auth/verify-email").send({ token: second }).expect(200);
    expect((await a.post("/api/auth/send-verification").send({})).body.alreadyVerified).toBe(true);
  });
});

describe("admin access", () => {
  it("the admin email signs in with its password and gets the dashboard; others don't even see it exists", async () => {
    await request(app).get("/api/admin/stats").expect(401);
    const boss = await signUp("boss@example.com");
    expect((await boss.get("/api/auth/me")).body).toMatchObject({ user: { isAdmin: true }, canActivateAdmin: false });
    const stats = (await boss.get("/api/admin/stats").expect(200)).body;
    expect(stats.totals.users).toBe(1);
    expect(stats.series.points).toHaveLength(30);

    // Emails are unique, so once the owner exists nobody can register the admin address again.
    await request(app).post("/api/auth/register").send({ email: "BOSS@example.com", password: PASSWORD, fullName: "Impostor", phone: "+91 98765 43210" }).expect(409);

    const other = await signUp("someone@example.com");
    await request(app).post("/api/auth/verify-email").send({ token: tokenFrom(outbox.at(-1)!.text, "verify-email") }).expect(200);
    expect((await other.get("/api/auth/me")).body.user.isAdmin).toBe(false);
    await other.get("/api/admin/stats").expect(404);
  });
});

describe("without any email service", () => {
  beforeEach(() => vi.stubEnv("RESEND_API_KEY", ""));

  it("gives a recovery code at sign-up that resets a forgotten password, once", async () => {
    const a = request.agent(app);
    const { recoveryCode } = (await a.post("/api/auth/register").send({ email: "rec@example.com", password: PASSWORD, fullName: "Rec User", phone: "+91 98765 43210" }).expect(201)).body;
    expect(recoveryCode).toMatch(/^[A-Z]{4}(-[A-Z]{4}){3}$/);
    expect(outbox).toHaveLength(0); // no email service: nothing sent, nothing needed
    expect((await request(app).get("/api/auth/features")).body).toEqual({ email: false });

    await request(app).post("/api/auth/recover").send({ email: "rec@example.com", code: "ABCD-EFGH-JKLM-NPQR", password: "a brand new password 2" }).expect(400);
    const b = request.agent(app);
    const r = (await b.post("/api/auth/recover").send({ email: "REC@example.com", code: recoveryCode.toLowerCase().replace(/-/g, " "), password: "a brand new password 2" }).expect(200)).body;
    expect(r.recoveryCode).not.toBe(recoveryCode);
    await b.get("/api/auth/me").expect(200);
    await a.get("/api/auth/me").expect(401); // old session signed out
    await request(app).post("/api/auth/login").send({ email: "rec@example.com", password: "a brand new password 2" }).expect(200);
    await request(app).post("/api/auth/recover").send({ email: "rec@example.com", code: recoveryCode, password: "another new password 3" }).expect(400);
  });

  it("makes a new recovery code from the account, with the password", async () => {
    const a = request.agent(app);
    const first = (await a.post("/api/auth/register").send({ email: "code@example.com", password: PASSWORD, fullName: "Code User", phone: "+91 98765 43210" })).body.recoveryCode;
    await a.post("/api/auth/recovery-code").send({ password: "wrong password 99" }).expect(401);
    const second = (await a.post("/api/auth/recovery-code").send({ password: PASSWORD }).expect(200)).body.recoveryCode;
    await request(app).post("/api/auth/recover").send({ email: "code@example.com", code: first, password: "a brand new password 2" }).expect(400);
    await request(app).post("/api/auth/recover").send({ email: "code@example.com", code: second, password: "a brand new password 2" }).expect(200);
  });

  it("signs the admin in with email and password only; the setup code can't make anyone else admin", async () => {
    const boss = request.agent(app);
    await boss.post("/api/auth/register").send({ email: "boss@example.com", password: PASSWORD, fullName: "Boss", phone: "+91 98765 43210" }).expect(201);
    await boss.post("/api/auth/logout").send({});
    const again = request.agent(app);
    await again.post("/api/auth/login").send({ email: "boss@example.com", password: PASSWORD }).expect(200);
    await again.get("/api/admin/stats").expect(200);

    const other = request.agent(app);
    await other.post("/api/auth/register").send({ email: "other@example.com", password: PASSWORD, fullName: "Other", phone: "+91 98765 43210" });
    expect((await other.get("/api/auth/me")).body.canActivateAdmin).toBe(false);
    await other.post("/api/admin/activate").send({ code: adminSetupCode() }).expect(404);
    await other.get("/api/admin/stats").expect(404);
  });

  it("lets the locked-out owner set a new password with the setup code, which also activates admin", async () => {
    await request(app).post("/api/auth/register").send({ email: "boss@example.com", password: PASSWORD, fullName: "Boss", phone: "+91 98765 43210" });
    await request(app).post("/api/auth/register").send({ email: "user@example.com", password: PASSWORD, fullName: "User", phone: "+91 98765 43210" });
    const body = { email: "boss@example.com", code: adminSetupCode(), password: "owner new password 7" };
    await request(app).post("/api/auth/owner-reset").send({ ...body, code: "WRONG-CODE-HERE" }).expect(400);
    await request(app).post("/api/auth/owner-reset").send({ ...body, email: "user@example.com" }).expect(400); // not an admin address
    const owner = request.agent(app);
    const r = (await owner.post("/api/auth/owner-reset").send(body).expect(200)).body;
    expect(r.recoveryCode).toMatch(/^[A-Z]{4}(-[A-Z]{4}){3}$/);
    expect((await owner.get("/api/auth/me")).body.user.isAdmin).toBe(true);
    await owner.get("/api/admin/stats").expect(200);
    await request(app).post("/api/auth/login").send({ email: "boss@example.com", password: "owner new password 7" }).expect(200);
  });

  it("lets the admin make a reset link for a user who lost everything", async () => {
    const boss = request.agent(app);
    await boss.post("/api/auth/register").send({ email: "boss@example.com", password: PASSWORD, fullName: "Boss", phone: "+91 98765 43210" });
    await boss.post("/api/admin/activate").send({ code: adminSetupCode() }).expect(200);
    const lost = request.agent(app);
    await lost.post("/api/auth/register").send({ email: "lost@example.com", password: PASSWORD, fullName: "Lost", phone: "+91 98765 43210" });

    await lost.post("/api/admin/reset-link").send({ email: "boss@example.com" }).expect(404); // not for non-admins
    const { link } = (await boss.post("/api/admin/reset-link").send({ email: "lost@example.com" }).expect(200)).body;
    expect(link).toContain("http://localhost:3000/reset-password?token=");
    await request(app).post("/api/auth/reset-password").send({ token: tokenFrom(link, "reset-password"), password: "a brand new password 2" }).expect(200);
    await request(app).post("/api/auth/login").send({ email: "lost@example.com", password: "a brand new password 2" }).expect(200);
  });
});

describe("reviews", () => {
  it("one review per user, editable; the owner sees all and picks what goes on the homepage", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const boss = request.agent(app);
    await boss.post("/api/auth/register").send({ email: "boss@example.com", password: PASSWORD, fullName: "Boss", phone: "+91 98765 43210" });
    await boss.post("/api/admin/activate").send({ code: adminSetupCode() }).expect(200);
    const fan = request.agent(app);
    await fan.post("/api/auth/register").send({ email: "fan@example.com", password: PASSWORD, fullName: "Priya Sharma", phone: "+91 98765 43210" });

    expect((await fan.get("/api/reviews/mine")).body.review).toBeNull();
    await request(app).put("/api/reviews/mine").send({ rating: 5 }).expect(401);
    await fan.put("/api/reviews/mine").send({ rating: 6, comment: "x" }).expect(400);
    await fan.put("/api/reviews/mine").send({ rating: 4, comment: "  Clean   PDFs, easy to use. " }).expect(200);
    await fan.put("/api/reviews/mine").send({ rating: 5, comment: "Clean PDFs, easy to use." }).expect(200); // edit, not a second review
    expect((await fan.get("/api/reviews/mine")).body.review).toMatchObject({ rating: 5, comment: "Clean PDFs, easy to use." });

    const s = (await boss.get("/api/admin/stats").expect(200)).body;
    expect(s.reviews).toMatchObject({ count: 1, average: 5, distribution: [0, 0, 0, 0, 1] });
    const id = s.reviews.items[0].id;
    expect((await request(app).get("/api/reviews/public")).body.reviews).toEqual([]); // not featured yet

    await fan.post(`/api/admin/reviews/${id}/feature`).send({ featured: true }).expect(404); // users can't feature
    await boss.post(`/api/admin/reviews/${id}/feature`).send({ featured: true }).expect(200);
    expect((await request(app).get("/api/reviews/public")).body.reviews).toEqual([{ rating: 5, comment: "Clean PDFs, easy to use.", name: "Priya" }]);

    // Changing the text takes it off the homepage until it's picked again.
    await fan.put("/api/reviews/mine").send({ rating: 5, comment: "Changed text" }).expect(200);
    expect((await request(app).get("/api/reviews/public")).body.reviews).toEqual([]);

    await boss.delete(`/api/admin/reviews/${id}`).expect(200);
    expect((await boss.get("/api/admin/stats")).body.reviews.count).toBe(0);
  });

  it("counts active users as those who worked on a resume in 30 days", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const boss = request.agent(app);
    await boss.post("/api/auth/register").send({ email: "boss@example.com", password: PASSWORD, fullName: "Boss", phone: "+91 98765 43210" });
    await boss.post("/api/admin/activate").send({ code: adminSetupCode() }).expect(200);
    const idle = request.agent(app);
    await idle.post("/api/auth/register").send({ email: "idle@example.com", password: PASSWORD, fullName: "Idle", phone: "+91 98765 43210" });
    await boss.post("/api/resumes").send({ name: "Mine" }).expect(201);
    const t = (await boss.get("/api/admin/stats")).body.totals;
    expect(t).toMatchObject({ users: 2, activeUsers: 1, signedUpWithResume: 1, signedUpWithoutResume: 1 });
  });
});

describe("password reset", () => {
  it("emails a one-time link; the new password works, the old one and other sessions stop", async () => {
    const original = await signUp("reset@example.com");
    outbox = [];
    await request(app).post("/api/auth/forgot-password").send({ email: "nobody@example.com" }).expect(200);
    expect(outbox).toHaveLength(0); // same answer for unknown emails, but nothing is sent

    await request(app).post("/api/auth/forgot-password").send({ email: "Reset@Example.com" }).expect(200);
    expect(outbox).toHaveLength(1);
    const token = tokenFrom(outbox[0].text, "reset-password");

    await request(app).post("/api/auth/reset-password").send({ token, password: "short" }).expect(400);
    const fresh = request.agent(app);
    await fresh.post("/api/auth/reset-password").send({ token, password: "a brand new password 2" }).expect(200);
    expect((await fresh.get("/api/auth/me")).body.user.emailVerified).toBe(true);
    await original.get("/api/auth/me").expect(401); // old sessions signed out

    await request(app).post("/api/auth/login").send({ email: "reset@example.com", password: PASSWORD }).expect(401);
    await request(app).post("/api/auth/login").send({ email: "reset@example.com", password: "a brand new password 2" }).expect(200);
    await request(app).post("/api/auth/reset-password").send({ token, password: "another new password 3" }).expect(400);
  });
});

describe("visit statistics", () => {
  async function adminAgent() {
    const boss = await signUp("boss@example.com");
    await request(app).post("/api/auth/verify-email").send({ token: tokenFrom(outbox[0].text, "verify-email") }).expect(200);
    return boss;
  }
  const track = (body: object, ua = UA_DESKTOP) => request(app).post("/api/track").set("User-Agent", ua).send(body).expect(204);

  it("counts views and daily visitors without storing ids, tokens, bots or admin pages", async () => {
    await track({ path: "/", referrer: "https://www.google.com/search?q=resume" });
    await track({ path: "/register?utm=x", referrer: "http://localhost:3000/" });
    await track({ path: "/resumes/3f2a1c9e-1111-4222-8333-944455556666" });
    await track({ path: "/r/AbCdEfGhIjKlMnOpQrStUvWx" }, UA_PHONE);
    await track({ path: "/admin" });
    await track({ path: "/" }, "Googlebot/2.1 (+http://www.google.com/bot.html)");

    const s = (await (await adminAgent()).get("/api/admin/stats").expect(200)).body;
    expect(s.traffic.views).toBe(4);
    expect(s.traffic.visitors).toBe(2); // the desktop browser and the phone
    expect(s.topPages.map((p: { path: string }) => p.path).sort()).toEqual(["/", "/r/[link]", "/register", "/resumes/[id]"]);
    expect(s.topReferrers.find((r: { source: string }) => r.source === "google.com")?.views).toBe(1);
    expect(s.devices.find((d: { device: string }) => d.device === "mobile")?.views).toBe(1);
  });

  it("counts sign-ups and real downloads, not the inline preview", async () => {
    const boss = await adminAgent();
    const { resume } = (await boss.post("/api/resumes").send({ name: "Mine" }).expect(201)).body;
    await boss.get(`/api/resumes/${resume.id}/export?format=txt`).expect(200);
    await boss.get(`/api/resumes/${resume.id}/export?format=txt&inline=1`).expect(200);
    const s = (await boss.get("/api/admin/stats")).body;
    expect(s.events).toMatchObject({ signup: 1, resume_created: 1, download_txt: 1 });
    expect(s.series.points.at(-1)).toMatchObject({ signups: 1, downloads: 1 });
    expect(s.earnings).toMatchObject({ totalPaise: 0, payments: 0 });
  });

  it("filters by period: 7 days, 30 days (default) or all time by month", async () => {
    const db = await useTestDb();
    const boss = await adminAgent();
    // One view today, one 10 days ago, one 100 days ago.
    await db.query("INSERT INTO page_views (day, path, visitor) VALUES (current_date, '/', 'a'), (current_date - 10, '/', 'b'), (current_date - 100, '/', 'c')");
    const get = async (range?: string) => (await boss.get(`/api/admin/stats${range ? `?range=${range}` : ""}`).expect(200)).body;
    const week = await get("7");
    const month = await get();
    const all = await get("all");
    expect([week.range, month.range, all.range]).toEqual(["7", "30", "all"]);
    expect([week.traffic.views, month.traffic.views, all.traffic.views]).toEqual([1, 2, 3]);
    expect(week.series).toMatchObject({ granularity: "day" });
    expect(week.series.points).toHaveLength(7);
    expect(all.series.granularity).toBe("month");
    expect(all.series.points).toHaveLength(12);
    expect(all.series.points.reduce((a: number, p: { views: number }) => a + p.views, 0)).toBe(3);
    expect((await get("nonsense")).range).toBe("30");
  });

  it("stores nothing when analytics is off", async () => {
    vi.stubEnv("ANALYTICS", "off");
    await track({ path: "/" });
    vi.stubEnv("ANALYTICS", "on");
    const s = (await (await adminAgent()).get("/api/admin/stats")).body;
    expect(s.traffic.views).toBe(0);
  });

  it("normalises paths and referrers", () => {
    expect(normalizePath("/resumes/3f2a1c9e-1111-4222-8333-944455556666/edit?x=1")).toBe("/resumes/[id]/edit");
    expect(normalizePath("//evil.com")).toBeNull();
    expect(referrerHost("https://www.linkedin.com/feed/", ["freeatsresume.in"])).toBe("linkedin.com");
    expect(referrerHost("https://freeatsresume.in/register", ["freeatsresume.in"])).toBe("");
  });
});
