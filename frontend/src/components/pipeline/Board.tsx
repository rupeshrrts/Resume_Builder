"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BellRing, CalendarClock, ExternalLink, MapPin, Plus, Trash, UserRound, Users } from "lucide-react";
import type { ContactInput, EventKind, Job, JobContact, JobEvent, JobStatus } from "@resume/shared/schema/job";
import type { ResumeSummary } from "@resume/shared/types/api";
import { api, ApiError } from "@/lib/api-client";
import { Badge, Modal, Notice, Spinner } from "../ui";
import { JobForm } from "../JobForm";

const COLUMNS: { id: JobStatus; label: string; dot: string }[] = [
  { id: "saved", label: "Saved", dot: "bg-slate-400" },
  { id: "applied", label: "Applied", dot: "bg-brand-500" },
  { id: "interviewing", label: "Interviewing", dot: "bg-violet-500" },
  { id: "offer", label: "Offer", dot: "bg-emerald-500" },
  { id: "rejected", label: "Rejected", dot: "bg-red-400" },
  { id: "withdrawn", label: "Withdrawn", dot: "bg-slate-300" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);
const nice = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

interface Upcoming {
  kind: "follow_up" | "interview";
  jobId: string;
  title: string;
  company: string;
  on: string;
}

export function Board({ jobs: initial, resumes }: { jobs: Job[]; resumes: ResumeSummary[] }) {
  const [jobs, setJobs] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<JobStatus | null>(null);
  const [open, setOpen] = useState<Job | null>(null);
  const [adding, setAdding] = useState(false);
  const [upcoming, setUpcoming] = useState<Upcoming[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refreshUpcoming = () => api<{ items: Upcoming[] }>("/api/pipeline/upcoming").then((r) => setUpcoming(r.items)).catch(() => undefined);
  useEffect(() => {
    refreshUpcoming();
  }, []);

  const byColumn = useMemo(() => {
    const m = new Map<JobStatus, Job[]>(COLUMNS.map((c) => [c.id, []]));
    for (const j of [...jobs].sort((a, b) => a.boardPosition - b.boardPosition || b.updatedAt - a.updatedAt)) m.get(j.status)!.push(j);
    return m;
  }, [jobs]);

  async function move(jobId: string, to: JobStatus, index?: number) {
    const col = (byColumn.get(to) ?? []).filter((j) => j.id !== jobId);
    const moved = jobs.find((j) => j.id === jobId);
    if (!moved) return;
    col.splice(index ?? col.length, 0, { ...moved, status: to });
    const moves = col.map((j, i) => ({ id: j.id, status: to, position: i }));
    // Optimistic update; the server's answer replaces it.
    setJobs((js) => js.map((j) => {
      const m = moves.find((x) => x.id === j.id);
      return m ? { ...j, status: m.status, boardPosition: m.position, appliedAt: m.status === "applied" && !j.appliedAt ? todayIso() : j.appliedAt } : j;
    }));
    try {
      setJobs((await api<{ jobs: Job[] }>("/api/jobs/arrange", { method: "PUT", body: { moves } })).jobs);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't move the card.");
    }
  }

  const overdue = upcoming.filter((u) => u.on < todayIso());
  const soon = upcoming.filter((u) => u.on >= todayIso());

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Applications</h1>
          <p className="mt-1 text-sm text-slate-600">Drag cards between stages. Open a card for contacts, interviews, notes and follow-up reminders.</p>
        </div>
        <button className="btn-primary" onClick={() => setAdding(true)}><Plus className="h-4 w-4" aria-hidden /> Add job</button>
      </div>
      {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : null}

      {upcoming.length ? (
        <section className="mt-5 flex flex-wrap gap-2" aria-label="Reminders">
          {[...overdue, ...soon].map((u, i) => {
            const late = u.on < todayIso();
            return (
              <button
                key={i}
                onClick={() => setOpen(jobs.find((j) => j.id === u.jobId) ?? null)}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs shadow-sm transition hover:-translate-y-0.5 ${late ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
              >
                {u.kind === "interview" ? <CalendarClock className="h-4 w-4 shrink-0" aria-hidden /> : <BellRing className="h-4 w-4 shrink-0" aria-hidden />}
                <span>
                  <span className="block font-semibold">{u.kind === "interview" ? "Interview" : late ? "Follow-up overdue" : "Follow up"} · {nice(u.on)}</span>
                  <span>{[u.title, u.company].filter(Boolean).join(" at ")}</span>
                </span>
              </button>
            );
          })}
        </section>
      ) : null}

      <div className="mt-6 grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-4 scroll-thin">
        {COLUMNS.map((c) => {
          const cards = byColumn.get(c.id) ?? [];
          return (
            <section
              key={c.id}
              aria-label={`${c.label} (${cards.length})`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(c.id);
              }}
              onDragLeave={() => setOver((o) => (o === c.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                if (dragging) move(dragging, c.id);
                setDragging(null);
              }}
              className={`flex min-h-64 flex-col rounded-2xl border p-2 transition ${over === c.id ? "border-brand-300 bg-brand-50/70" : "border-slate-200/70 bg-slate-100/60"}`}
            >
              <h2 className="flex items-center gap-2 px-2 py-1.5 text-sm font-bold">
                <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden />
                {c.label}
                <span className="ml-auto rounded-full bg-white px-2 text-xs font-semibold text-slate-500">{cards.length}</span>
              </h2>
              <ul className="mt-1 flex flex-1 flex-col gap-2">
                {cards.map((j, idx) => {
                  const linked = resumes.filter((r) => r.jobId === j.id);
                  const due = j.followUpOn && j.followUpOn <= todayIso() && (j.status === "saved" || j.status === "applied" || j.status === "interviewing");
                  return (
                    <li
                      key={j.id}
                      draggable
                      onDragStart={() => setDragging(j.id)}
                      onDragEnd={() => setDragging(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOver(null);
                        if (dragging && dragging !== j.id) move(dragging, c.id, idx);
                        setDragging(null);
                      }}
                      className={`group cursor-grab rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgb(15_23_42/0.05)] transition hover:border-brand-200 hover:shadow-md active:cursor-grabbing ${dragging === j.id ? "opacity-50" : ""}`}
                    >
                      <button className="block w-full text-left" onClick={() => setOpen(j)}>
                        <span className="flex items-start gap-2">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 font-display text-xs font-bold text-slate-600">
                            {(j.company || j.title || "?").slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{j.title || "Untitled role"}</span>
                            <span className="block truncate text-xs text-slate-500">{j.company || "Company not set"}</span>
                          </span>
                        </span>
                        <span className="mt-2 flex flex-wrap gap-1">
                          {j.location ? <Badge><MapPin className="h-3 w-3" />{j.location}</Badge> : null}
                          {j.appliedAt ? <Badge tone="blue">Applied {nice(j.appliedAt)}</Badge> : null}
                          {j.followUpOn ? <Badge tone={due ? "red" : "amber"}><BellRing className="h-3 w-3" />{nice(j.followUpOn)}</Badge> : null}
                          {linked.length ? <Badge tone="violet">{linked.length} resume{linked.length > 1 ? "s" : ""}</Badge> : null}
                        </span>
                      </button>
                      <label className="sr-only" htmlFor={`mv-${j.id}`}>Move {j.title} to</label>
                      <select
                        id={`mv-${j.id}`}
                        className="mt-2 w-full rounded-md border-slate-200 bg-slate-50 py-0.5 text-[11px] text-slate-600 opacity-70 group-hover:opacity-100 focus:opacity-100"
                        value={j.status}
                        onChange={(e) => move(j.id, e.target.value as JobStatus)}
                      >
                        {COLUMNS.map((o) => <option key={o.id} value={o.id}>Move to: {o.label}</option>)}
                      </select>
                    </li>
                  );
                })}
                {cards.length === 0 ? <li className="rounded-xl border-2 border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">Drop here</li> : null}
              </ul>
            </section>
          );
        })}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a job" wide>
        <JobForm
          onCancel={() => setAdding(false)}
          onSaved={(j) => {
            setJobs((js) => [j, ...js]);
            setAdding(false);
          }}
        />
      </Modal>
      {open ? (
        <JobDrawer
          job={open}
          resumes={resumes.filter((r) => r.jobId === open.id)}
          onClose={() => {
            setOpen(null);
            refreshUpcoming(); // timeline entries may have added or removed interviews
          }}
          onChange={(j) => {
            setJobs((js) => js.map((x) => (x.id === j.id ? j : x)));
            setOpen(j);
            refreshUpcoming();
          }}
          onDelete={(id) => {
            setJobs((js) => js.filter((x) => x.id !== id));
            setOpen(null);
            refreshUpcoming();
          }}
        />
      ) : null}
    </div>
  );
}

const EVENT_LABEL: Record<EventKind, string> = { note: "Note", interview: "Interview", follow_up: "Follow-up", offer: "Offer", rejection: "Rejection" };

function JobDrawer({ job, resumes, onClose, onChange, onDelete }: { job: Job; resumes: ResumeSummary[]; onClose: () => void; onChange: (j: Job) => void; onDelete: (id: string) => void }) {
  const [details, setDetails] = useState<{ contacts: JobContact[]; events: JobEvent[] } | null>(null);
  const [form, setForm] = useState(job);
  const [contact, setContact] = useState<ContactInput>({ name: "", role: "", email: "", link: "", notes: "" });
  const [event, setEvent] = useState<{ kind: EventKind; title: string; body: string; happensOn: string }>({ kind: "note", title: "", body: "", happensOn: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ contacts: JobContact[]; events: JobEvent[] }>(`/api/jobs/${job.id}/details`).then(setDetails).catch(() => setDetails({ contacts: [], events: [] }));
  }, [job.id]);

  const run = async (fn: () => Promise<void>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? [e.message, ...(e.issues ?? [])].join(" ") : "Something went wrong.");
    }
  };

  return (
    <Modal open onClose={onClose} title={[job.title || "Untitled role", job.company].filter(Boolean).join(" · ")} wide>
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr] text-sm">
        <section className="space-y-3">
          {error ? <Notice tone="error">{error}</Notice> : null}
          <div className="grid grid-cols-2 gap-3">
            {(["title", "company", "location"] as const).map((k) => (
              <div key={k} className={k === "location" ? "col-span-2" : ""}>
                <label className="label" htmlFor={`jd-${k}`}>{k[0].toUpperCase() + k.slice(1)}</label>
                <input id={`jd-${k}`} className="field" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
            <div>
              <label className="label" htmlFor="jd-applied">Applied on</label>
              <input id="jd-applied" type="date" className="field" value={form.appliedAt} onChange={(e) => setForm({ ...form, appliedAt: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="jd-follow">Follow up on</label>
              <input id="jd-follow" type="date" className="field" value={form.followUpOn} onChange={(e) => setForm({ ...form, followUpOn: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="jd-url">Posting URL</label>
              <div className="flex gap-2">
                <input id="jd-url" className="field" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
                {form.url ? <a className="btn-secondary px-2.5" href={form.url} target="_blank" rel="noreferrer noopener" aria-label="Open posting"><ExternalLink className="h-4 w-4" /></a> : null}
              </div>
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor="jd-notes">Notes</label>
              <textarea id="jd-notes" className="field" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={saving}
              onClick={() =>
                run(async () => {
                  setSaving(true);
                  try {
                    const { job: j } = await api<{ job: Job }>(`/api/jobs/${job.id}`, {
                      method: "PUT",
                      body: { title: form.title, company: form.company, location: form.location, url: form.url, appliedAt: form.appliedAt, followUpOn: form.followUpOn, notes: form.notes },
                    });
                    onChange(j);
                  } finally {
                    setSaving(false);
                  }
                })
              }
            >
              Save details
            </button>
            <button className="btn-danger" onClick={() => confirm("Delete this job and its contacts and timeline?") && run(async () => { await api(`/api/jobs/${job.id}`, { method: "DELETE" }); onDelete(job.id); })}>
              <Trash className="h-4 w-4" aria-hidden /> Delete
            </button>
          </div>
          <div>
            <p className="label">Resumes for this job</p>
            {resumes.length ? (
              <ul className="space-y-1">{resumes.map((r) => <li key={r.id}><Link className="text-brand-700 hover:underline" href={`/resumes/${r.id}`}>{r.name}</Link></li>)}</ul>
            ) : (
              <p className="text-xs text-slate-500">None yet. Open your master resume, pick this job in Job match, then “Tailor a copy”.</p>
            )}
          </div>
        </section>

        <section className="space-y-4">
          {!details ? <Spinner /> : (
            <>
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 font-semibold"><Users className="h-4 w-4" aria-hidden /> Contacts</h3>
                <ul className="space-y-1.5">
                  {details.contacts.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 font-medium"><UserRound className="h-3.5 w-3.5 text-slate-400" aria-hidden />{c.name}{c.role ? <span className="font-normal text-slate-500">· {c.role}</span> : null}</span>
                        {c.email ? <a className="block truncate text-xs text-brand-700" href={`mailto:${c.email}`}>{c.email}</a> : null}
                        {c.link ? <a className="block truncate text-xs text-brand-700" href={/^https?:/.test(c.link) ? c.link : `https://${c.link}`} target="_blank" rel="noreferrer noopener">{c.link}</a> : null}
                      </span>
                      <button className="btn-ghost h-7 w-7 p-0 hover:text-red-700" aria-label={`Remove ${c.name}`} onClick={() => run(async () => { await api(`/api/contacts/${c.id}`, { method: "DELETE" }); setDetails({ ...details, contacts: details.contacts.filter((x) => x.id !== c.id) }); })}>
                        <Trash className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <form
                  className="mt-2 grid grid-cols-2 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const { contact: c } = await api<{ contact: JobContact }>(`/api/jobs/${job.id}/contacts`, { body: contact });
                      setDetails({ ...details, contacts: [...details.contacts, c] });
                      setContact({ name: "", role: "", email: "", link: "", notes: "" });
                    });
                  }}
                >
                  <input className="field" placeholder="Name" aria-label="Contact name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                  <input className="field" placeholder="Role (e.g. Recruiter)" aria-label="Contact role" value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} />
                  <input className="field" placeholder="Email" aria-label="Contact email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                  <input className="field" placeholder="LinkedIn URL" aria-label="Contact link" value={contact.link} onChange={(e) => setContact({ ...contact, link: e.target.value })} />
                  <button className="btn-secondary col-span-2" disabled={!contact.name.trim()}><Plus className="h-4 w-4" aria-hidden /> Add contact</button>
                </form>
              </div>

              <div>
                <h3 className="mb-2 flex items-center gap-1.5 font-semibold"><CalendarClock className="h-4 w-4" aria-hidden /> Timeline</h3>
                <form
                  className="grid grid-cols-[auto_1fr] gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const { event: ev } = await api<{ event: JobEvent }>(`/api/jobs/${job.id}/events`, { body: event });
                      setDetails({ ...details, events: [ev, ...details.events] });
                      setEvent({ kind: "note", title: "", body: "", happensOn: "" });
                    });
                  }}
                >
                  <select className="field" aria-label="Entry type" value={event.kind} onChange={(e) => setEvent({ ...event, kind: e.target.value as EventKind })}>
                    {(Object.keys(EVENT_LABEL) as EventKind[]).map((k) => <option key={k} value={k}>{EVENT_LABEL[k]}</option>)}
                  </select>
                  <input className="field" aria-label="Title" placeholder={event.kind === "interview" ? "e.g. Technical round with Priya" : "Title"} value={event.title} onChange={(e) => setEvent({ ...event, title: e.target.value })} />
                  <input type="date" className="field" aria-label="Date" value={event.happensOn} onChange={(e) => setEvent({ ...event, happensOn: e.target.value })} />
                  <textarea className="field" rows={2} aria-label="Details" placeholder="Details, questions asked, how it went…" value={event.body} onChange={(e) => setEvent({ ...event, body: e.target.value })} />
                  <button className="btn-secondary col-span-2" disabled={!event.title.trim() && !event.body.trim()}><Plus className="h-4 w-4" aria-hidden /> Add to timeline</button>
                </form>
                <ol className="mt-3 space-y-2 border-l-2 border-slate-100 pl-4">
                  {details.events.map((ev) => (
                    <li key={ev.id} className="relative">
                      <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${ev.kind === "interview" ? "bg-violet-500" : ev.kind === "offer" ? "bg-emerald-500" : ev.kind === "rejection" ? "bg-red-400" : "bg-slate-300"}`} aria-hidden />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-slate-500">{EVENT_LABEL[ev.kind]}{ev.happensOn ? ` · ${nice(ev.happensOn)}` : ""}</p>
                          {ev.title ? <p className="font-medium">{ev.title}</p> : null}
                          {ev.body ? <p className="whitespace-pre-wrap text-slate-700">{ev.body}</p> : null}
                        </div>
                        <button className="btn-ghost h-7 w-7 shrink-0 p-0 hover:text-red-700" aria-label="Delete entry" onClick={() => run(async () => { await api(`/api/events/${ev.id}`, { method: "DELETE" }); setDetails({ ...details, events: details.events.filter((x) => x.id !== ev.id) }); })}>
                          <Trash className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                  {details.events.length === 0 ? <li className="text-xs text-slate-500">No entries yet.</li> : null}
                </ol>
              </div>
            </>
          )}
        </section>
      </div>
    </Modal>
  );
}
