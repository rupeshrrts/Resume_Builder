"use client";

import Link from "next/link";
import { useState } from "react";
import { Copy, Download, Eye, FileText, IndianRupee, KeyRound, Mail, MessageCircle, MousePointerClick, Search, Sparkles, Trash, UserPlus, Users } from "lucide-react";
import type { AdminStats } from "@resume/shared/types/api";
import { api, ApiError } from "@/lib/api-client";
import { Notice } from "../ui";
import { Stars } from "../ReviewCard";
import { Donut, NEUTRAL, SERIES, topWithOther } from "./Donut";

const inr = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const n = (v: number) => v.toLocaleString("en-IN");
const shortDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The period switch: label on the button, short form for tiles, and a phrase for sentences. */
const RANGES: { id: AdminStats["range"]; label: string; short: string; sentence: string }[] = [
  { id: "7", label: "7 days", short: "7 days", sentence: "over the last 7 days" },
  { id: "30", label: "30 days", short: "30 days", sentence: "over the last 30 days" },
  { id: "all", label: "All time", short: "all time", sentence: "since the start" },
];

/** Download formats in a fixed order, so each keeps its colour. */
const DOWNLOAD_FORMATS = [
  { id: "pdf", label: "PDF" },
  { id: "docx", label: "Word" },
  { id: "txt", label: "Text" },
  { id: "md", label: "Markdown" },
  { id: "json", label: "JSON" },
];

const EVENT_LABELS: Record<string, string> = {
  signup: "Sign-ups",
  resume_created: "Resumes created",
  download_pdf: "PDF downloads",
  download_docx: "Word downloads",
  download_txt: "Text downloads",
  download_md: "Markdown downloads",
  download_json: "JSON downloads",
  ai_request: "AI requests",
};

function Tile({ icon: Icon, label, value, sub, tone }: { icon: typeof Users; label: string; value: string; sub?: string; tone: string }) {
  return (
    <div className="card card-hover flex items-start gap-3 p-4">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md`}><Icon className="h-5 w-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="font-display text-2xl font-extrabold tabular-nums text-slate-900">{value}</p>
        {sub ? <p className="text-xs text-slate-500">{sub}</p> : null}
      </div>
    </div>
  );
}

type Point = AdminStats["series"]["points"][number];
const shortMonth = (key: string) => new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" });

/** One series of bars (per day or per month), with a hover/focus tooltip and a hidden table for screen readers. */
function SeriesBars({
  title,
  series,
  value,
  unit,
  periodText,
}: {
  title: string;
  series: AdminStats["series"];
  value: (d: Point) => number;
  unit: string;
  periodText: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const data = series.points;
  const monthly = series.granularity === "month";
  const label = (key: string) => (monthly ? shortMonth(key) : shortDay(key));
  const values = data.map(value);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const W = 600;
  const H = 150;
  const step = W / data.length;
  const barW = Math.max(4, step - 2); // 2px gap between bars
  const ticks = [...new Set([0, Math.ceil(max / 2), max])]; // with tiny numbers, half and max can coincide
  const h = hover != null ? data[hover] : null;
  return (
    <section className="card p-4" aria-label={title}>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500">{n(total)} {periodText}</p>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H + 18}`} className="h-44 w-full" role="img" aria-label={`${title}: ${n(total)} ${periodText}`} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => {
            const y = H - (t / max) * H;
            return (
              <g key={t}>
                <line x1={0} x2={W} y1={y} y2={y} stroke="#e2e8f0" strokeWidth={1} />
                {t > 0 ? <text x={2} y={y - 3} fontSize={10} fill="#94a3b8">{n(t)}</text> : null}
              </g>
            );
          })}
          {data.map((d, i) => {
            const v = values[i];
            const bh = v ? Math.max(3, (v / max) * H) : 0;
            const x = i * step + (step - barW) / 2;
            return (
              <g key={d.key} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${label(d.key)}: ${v} ${unit}`}>
                {/* Hit area taller than the bar */}
                <rect x={i * step} y={0} width={step} height={H} fill="transparent" />
                {bh ? <path d={`M${x},${H} V${H - bh + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${H} Z`} fill={hover === i ? "#4338ca" : "#6366f1"} /> : null}
                {/* Every bar is labelled when there are few (7 days, 12 months); weekly otherwise. */}
                {data.length <= 12 || i === 0 || i === data.length - 1 || (i % 7 === 0 && i < data.length - 4) ? (
                  <text
                    x={data.length <= 12 ? i * step + step / 2 : i === 0 ? 0 : i === data.length - 1 ? W : i * step + step / 2}
                    y={H + 14}
                    textAnchor={data.length <= 12 ? "middle" : i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}
                    fontSize={10}
                    fill="#94a3b8"
                  >
                    {i === data.length - 1 ? (monthly ? "This month" : "Today") : label(d.key)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={0} x2={W} y1={H} y2={H} stroke="#cbd5e1" strokeWidth={1} />
        </svg>
        {h ? (
          <div className="pointer-events-none absolute top-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-md" style={{ left: `clamp(0px, ${((hover! + 0.5) / data.length) * 100}% - 60px, calc(100% - 120px))` }}>
            <p className="font-semibold text-slate-900">{label(h.key)}</p>
            <p className="text-slate-600">{n(value(h))} {unit}</p>
          </div>
        ) : null}
      </div>
      <table className="sr-only">
        <caption>{title}</caption>
        <tbody>{data.map((d) => <tr key={d.key}><th>{d.key}</th><td>{value(d)}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

/** A ranked list with a proportional bar behind each count (one hue: it's magnitude, not identity). */
function RankList({ title, rows, empty }: { title: string; rows: { label: string; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="card p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-500">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} title={`${r.label}: ${n(r.value)}`}>
                <td className="relative py-1 pr-2">
                  <span className="absolute inset-y-0.5 left-0 rounded bg-brand-50" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden />
                  <span className="relative block truncate px-1.5 text-slate-800">{r.label}</span>
                </td>
                <td className="w-16 py-1 text-right tabular-nums text-slate-600">{n(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** All reviews, the star breakdown, and which ones show on the homepage. */
function ReviewsPanel({ reviews }: { reviews: AdminStats["reviews"] }) {
  const [items, setItems] = useState(reviews.items);
  const [busy, setBusy] = useState<string | null>(null);
  const maxBar = Math.max(1, ...reviews.distribution);
  return (
    <section className="card p-4" aria-labelledby="rev-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="rev-h" className="text-lg font-bold">Reviews</h2>
        <p className="text-xs text-slate-500">Turn on &ldquo;Show on homepage&rdquo; for the reviews visitors should see.</p>
      </div>
      {reviews.count === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No reviews yet. Users see a &ldquo;How is the resume builder?&rdquo; card on their dashboard after creating a resume.</p>
      ) : (
        <div className="mt-4 grid gap-6 md:grid-cols-[220px_1fr]">
          <div>
            <p className="font-display text-4xl font-extrabold text-slate-900">{reviews.average.toFixed(1)}</p>
            <Stars value={Math.round(reviews.average)} size="h-5 w-5" />
            <p className="mt-1 text-xs text-slate-500">{n(reviews.count)} review{reviews.count === 1 ? "" : "s"}</p>
            <ul className="mt-3 space-y-1 text-xs" aria-label="Reviews by stars">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = reviews.distribution[star - 1];
                return (
                  <li key={star} className="flex items-center gap-2" title={`${star} stars: ${count}`}>
                    <span className="w-3 text-slate-600">{star}</span>
                    <span className="h-2 flex-1 rounded-full bg-slate-100"><span className="block h-2 rounded-full bg-amber-400" style={{ width: `${(count / maxBar) * 100}%` }} /></span>
                    <span className="w-6 text-right tabular-nums text-slate-500">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1 scroll-thin">
            {items.map((r) => (
              <li key={r.id} className={`rounded-xl border p-3 text-sm ${r.featured ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <Stars value={r.rating} size="h-4 w-4" />
                    <span className="font-semibold text-slate-800">{r.name || "–"}</span>
                    <span className="text-xs text-slate-500">{r.email} · {when(r.updatedAt)}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${r.comment ? "" : "opacity-50"}`} title={r.comment ? "" : "Only reviews with a comment can be shown"}>
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5"
                        checked={r.featured}
                        disabled={!r.comment || busy === r.id}
                        onChange={async (e) => {
                          const featured = e.target.checked;
                          setBusy(r.id);
                          try {
                            await api(`/api/admin/reviews/${r.id}/feature`, { body: { featured } });
                            setItems((list) => list.map((x) => (x.id === r.id ? { ...x, featured } : x)));
                          } finally {
                            setBusy(null);
                          }
                        }}
                      />
                      Show on homepage
                    </label>
                    <button
                      className="btn-ghost h-7 w-7 p-0 hover:bg-red-50 hover:text-red-700"
                      title="Delete review"
                      aria-label={`Delete review by ${r.name || r.email}`}
                      disabled={busy === r.id}
                      onClick={async () => {
                        if (!confirm("Delete this review?")) return;
                        setBusy(r.id);
                        try {
                          await api(`/api/admin/reviews/${r.id}`, { method: "DELETE" });
                          setItems((list) => list.filter((x) => x.id !== r.id));
                        } finally {
                          setBusy(null);
                        }
                      }}
                    >
                      <Trash className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                </div>
                {r.comment ? <p className="mt-1.5 text-slate-700">&ldquo;{r.comment}&rdquo;</p> : <p className="mt-1.5 text-xs italic text-slate-400">Stars only, no comment</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Makes a one-time reset link for a user, to copy or send on WhatsApp. */
function ResetLinkButton({ email }: { email: string }) {
  const [state, setState] = useState<{ link?: string; error?: string; busy?: boolean; copied?: boolean }>({});
  if (state.link)
    return (
      <div className="flex flex-wrap items-center justify-end gap-1">
        <button
          className="btn-secondary h-7 px-2 text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(state.link!).catch(() => undefined);
            setState((s) => ({ ...s, copied: true }));
          }}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden /> {state.copied ? "Copied" : "Copy link"}
        </button>
        <a
          className="btn-secondary h-7 px-2 text-xs"
          target="_blank"
          rel="noreferrer"
          href={`https://wa.me/?text=${encodeURIComponent(`Here's your link to set a new password for Free ATS Resume Builder (works for 24 hours, once): ${state.link}`)}`}
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden /> WhatsApp
        </a>
      </div>
    );
  return (
    <div className="text-right">
      <button
        className="btn-ghost h-7 px-2 text-xs text-slate-600"
        title="Make a one-time password reset link for this user"
        disabled={state.busy}
        onClick={async () => {
          if (!confirm(`Create a password reset link for ${email}? Send it only to them.`)) return;
          setState({ busy: true });
          try {
            setState({ link: (await api<{ link: string }>("/api/admin/reset-link", { body: { email } })).link });
          } catch (err) {
            setState({ error: err instanceof ApiError ? err.message : "Failed" });
          }
        }}
      >
        <KeyRound className="h-3.5 w-3.5" aria-hidden /> Reset link
      </button>
      {state.error ? <p className="text-xs text-red-700">{state.error}</p> : null}
    </div>
  );
}

export function AdminDashboard({ stats, name }: { stats: AdminStats; name: string }) {
  const s = stats;
  const [query, setQuery] = useState("");
  const downloads = Object.entries(s.events).filter(([k]) => k.startsWith("download_")).reduce((a, [, v]) => a + v, 0);
  const period = RANGES.find((r) => r.id === s.range) ?? RANGES[1];
  const per = s.series.granularity === "month" ? "month" : "day";
  const users = s.recentUsers.filter((u) => !query.trim() || `${u.fullName} ${u.email} ${u.phone}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-violet-600 p-6 text-white shadow-[var(--shadow-lift)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-20 left-1/3 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-100">Admin dashboard</p>
            <h1 className="mt-1 text-3xl font-extrabold">Hi{name ? `, ${name.split(" ")[0]}` : ""} 👋</h1>
            <p className="mt-1 text-sm text-brand-100">How your site did {period.sentence} · updated {when(s.generatedAt)}</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">{s.analyticsOn ? "● Visit counting on" : "○ Visit counting off here"}</span>
            <span className="rounded-full bg-white/15 px-3 py-1.5 backdrop-blur">Only you can see this page</span>
          </div>
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Visitors today", n(s.traffic.visitorsToday)],
            ["Visits today", n(s.traffic.viewsToday)],
            ["New users this week", n(s.totals.usersLast7)],
            ["Earned this month", inr(s.earnings.monthPaise)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-white/10 p-3 backdrop-blur">
              <p className="text-xs text-brand-100">{label}</p>
              <p className="font-display text-2xl font-extrabold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </header>

      {!s.analyticsOn ? <Notice>Visit counting runs on the live site (or set ANALYTICS=on), so local testing doesn&apos;t mix into your real numbers. Accounts, resumes and earnings below are real.</Notice> : null}

      <nav aria-label="Period" className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Numbers {period.sentence}</h2>
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={r.id === "30" ? "/admin" : `/admin?range=${r.id}`}
              aria-current={r.id === s.range ? "page" : undefined}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${r.id === s.range ? "bg-brand-600 text-white shadow" : "text-slate-600 hover:bg-slate-100"}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </nav>

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={Users}
          tone="from-brand-500 to-brand-700"
          label="Registered users (total)"
          value={n(s.totals.users)}
          sub={s.range === "all" ? `+${n(s.totals.usersLast7)} this week` : `+${n(s.totals.newUsers)} in ${period.short}`}
        />
        <Tile icon={Eye} tone="from-sky-500 to-cyan-500" label={`Site visits (${period.short})`} value={n(s.traffic.views)} sub={`${n(s.traffic.visitors)} visitors`} />
        <Tile icon={FileText} tone="from-violet-500 to-fuchsia-500" label="Resumes (total)" value={n(s.totals.resumes)} sub={`${n(s.totals.tailored)} tailored copies`} />
        <Tile icon={IndianRupee} tone="from-emerald-500 to-teal-500" label={`Earnings (${period.short})`} value={inr(s.earnings.rangePaise)} sub={s.range === "all" ? `${n(s.earnings.payments)} payments` : `${n(s.earnings.payments)} payments · ${inr(s.earnings.totalPaise)} all time`} />
        <Tile icon={Download} tone="from-amber-500 to-orange-500" label={`Downloads (${period.short})`} value={n(downloads)} />
        <Tile icon={UserPlus} tone="from-rose-500 to-pink-500" label={`Sign-ups (${period.short})`} value={n(s.totals.newUsers)} />
        <Tile icon={MousePointerClick} tone="from-indigo-500 to-blue-500" label={`Active users (${period.short})`} value={n(s.totals.activeUsers)} sub="worked on a resume" />
        <Tile icon={Sparkles} tone="from-purple-500 to-violet-600" label={`AI requests (${period.short})`} value={n(s.events.ai_request ?? 0)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <SeriesBars title={`Visitors per ${per}`} series={s.series} value={(d) => d.visitors} unit="visitors" periodText={period.short === "all time" ? "in the last 12 months" : period.sentence.replace("over ", "in ")} />
        <SeriesBars title={`Sign-ups per ${per}`} series={s.series} value={(d) => d.signups} unit="sign-ups" periodText={period.short === "all time" ? "in the last 12 months" : period.sentence.replace("over ", "in ")} />
      </div>

      <section aria-label="Breakdown charts" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Donut
          title="Devices"
          centerLabel="visits"
          empty="No visits recorded yet."
          // Each device keeps its own colour whatever its rank.
          slices={(["mobile", "desktop", "tablet"] as const).map((dev, i) => ({
            label: dev[0].toUpperCase() + dev.slice(1),
            value: s.devices.find((d) => d.device === dev)?.views ?? 0,
            color: SERIES[i],
          }))}
        />
        <Donut
          title="Where visitors come from"
          centerLabel="visits"
          empty="No visits recorded yet."
          slices={topWithOther(s.topReferrers.map((r, i) => ({ label: r.source, value: r.views, color: SERIES[i % SERIES.length] })))}
        />
        <Donut
          title="Downloads by format"
          centerLabel="downloads"
          empty="No downloads yet."
          slices={DOWNLOAD_FORMATS.map((f, i) => ({ label: f.label, value: s.events[`download_${f.id}`] ?? 0, color: SERIES[i] }))}
        />
        <Donut
          title={`New users who built a resume (${period.short})`}
          centerLabel="sign-ups"
          empty="No sign-ups in this period."
          slices={[
            { label: "Built a resume", value: s.totals.signedUpWithResume, color: SERIES[2] },
            { label: "Not yet", value: s.totals.signedUpWithoutResume, color: NEUTRAL },
          ]}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <RankList title="Most visited pages" rows={s.topPages.map((p) => ({ label: p.path, value: p.views }))} empty="No visits recorded yet." />
        <RankList title="Where visitors come from (all sources)" rows={s.topReferrers.map((r) => ({ label: r.source, value: r.views }))} empty="No visits recorded yet." />
        <section className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Actions ({period.short})</h3>
          <ul className="space-y-1 text-sm">
            {Object.keys(EVENT_LABELS).filter((k) => s.events[k]).length === 0 ? <li className="text-xs text-slate-500">Nothing yet.</li> : null}
            {Object.entries(EVENT_LABELS).filter(([k]) => s.events[k]).map(([k, label]) => (
              <li key={k} className="flex justify-between"><span className="text-slate-700">{label}</span><span className="tabular-nums text-slate-600">{n(s.events[k])}</span></li>
            ))}
          </ul>
        </section>
      </div>

      <ReviewsPanel reviews={s.reviews} />

      <section className="card p-4" aria-labelledby="earn-h">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="earn-h" className="text-lg font-bold">Earnings</h2>
          <p className="text-sm text-slate-600">{inr(s.earnings.totalPaise)} from {n(s.earnings.payments)} payment{s.earnings.payments === 1 ? "" : "s"}</p>
        </div>
        {s.earnings.recent.length === 0 ? (
          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            No payments yet. The site is free, so nothing is earned until you add a way to get paid, for example a paid &ldquo;Premium&rdquo; plan with Razorpay (UPI and cards) or ads. Payments will appear here automatically.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 font-medium">Date</th><th className="font-medium">Amount</th><th className="font-medium">Source</th><th className="font-medium">Reference</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {s.earnings.recent.map((p) => (
                  <tr key={p.at + p.reference}><td className="py-1.5">{when(p.at)}</td><td className="tabular-nums">{inr(p.amountPaise)}</td><td>{p.source || "–"}</td><td className="text-slate-500">{p.reference || "–"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-4" aria-labelledby="users-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="users-h" className="text-lg font-bold">Latest sign-ups</h2>
            <p className="text-xs text-slate-500">Personal details: keep them private and use them only to run the site.</p>
          </div>
          <label className="relative">
            <span className="sr-only">Search users</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="field w-56 py-1.5 pl-8 text-xs" placeholder="Search name, email, mobile" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </div>
        {s.recentUsers.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No users yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-xs text-slate-500"><th className="py-1.5 font-medium">Name</th><th className="font-medium">Email</th><th className="font-medium">Mobile</th><th className="font-medium">Joined</th><th className="text-right font-medium">Resumes</th><th className="text-right font-medium"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.length === 0 ? <tr><td colSpan={6} className="py-4 text-center text-xs text-slate-500">No match.</td></tr> : null}
                {users.map((u) => (
                  <tr key={u.email}>
                    <td className="py-1.5 font-medium text-slate-800">{u.fullName || "–"}</td>
                    <td className="text-slate-700">
                      <span className="inline-flex items-center gap-1">{u.email}{u.verified ? <Mail className="h-3.5 w-3.5 text-emerald-600" aria-label="Email verified" /> : null}</span>
                    </td>
                    <td className="text-slate-700">{u.phone || "–"}</td>
                    <td className="text-slate-500">{when(u.joined)}</td>
                    <td className="text-right tabular-nums">{n(u.resumes)}</td>
                    <td className="pl-2"><ResetLinkButton email={u.email} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
