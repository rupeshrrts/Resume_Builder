"use client";

import { useEffect, useRef, useState } from "react";
import { PROFILE_LINKS, newId, profileLinkIndex, setProfileLink, type ResumeData } from "@resume/shared/schema/resume";
import { toMonthIndex } from "@resume/shared/analysis/dates";
import { DateField, EntryCard, OriginBadge, SectionHeader, TextField, move } from "./fields";
import { BulletList } from "./BulletList";
import { SummaryAssist } from "./SummaryAssist";
import { useEditor } from "./context";

export type Update = (fn: (d: ResumeData) => void, structural?: boolean) => void;

/** Comma-separated list input that doesn't fight the cursor while typing. */
function ListInput({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(items.join(", "));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(items.join(", "));
  }, [items]);
  return (
    <div>
      <label className="label">
        {label}
        <input
          className="field mt-1 font-normal"
          value={text}
          placeholder={placeholder}
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false;
            setText(items.join(", "));
          }}
          onChange={(e) => {
            setText(e.target.value);
            onChange(e.target.value.split(/\s*[,;]\s*/).map((s) => s.trim()).filter(Boolean));
          }}
        />
      </label>
    </div>
  );
}

/** "Start on a new page": the user decides where a page ends; this entry and what follows move on. */
function NewPageToggle({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="mb-1.5 flex items-center gap-1.5 text-sm text-slate-600" title="Moves this entry, and everything after it, to the next page">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> Start on a new page
    </label>
  );
}

export function ContactForm({ data, update }: { data: ResumeData; update: Update }) {
  const c = data.contact;
  const set = (k: keyof typeof c) => (v: string) => update((d) => void ((d.contact as Record<string, unknown>)[k] = v));
  // LinkedIn, GitHub and Portfolio have their own fields above; the list below holds everything else.
  const profile = new Set(PROFILE_LINKS.map((p) => profileLinkIndex(c.links, p.label)).filter((i) => i >= 0));
  return (
    <section>
      <SectionHeader id="s-contact" title="Contact" help="Name, email and phone are essential. City and country are enough for location." />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Full name" value={c.fullName} onChange={set("fullName")} />
        <TextField label="Headline" value={c.headline} onChange={set("headline")} placeholder="e.g. Backend Engineer" />
        <TextField label="Email" type="email" value={c.email} onChange={set("email")} />
        <TextField label="Phone" type="tel" value={c.phone} onChange={set("phone")} placeholder="+91 98765 43210" hint="Include the country code when applying abroad." />
        <TextField label="Location" value={c.location} onChange={set("location")} placeholder="Pune, India" className="sm:col-span-2" />
        {PROFILE_LINKS.map((p) => (
          <TextField
            key={p.label}
            label={`${p.label} (optional)`}
            value={c.links[profileLinkIndex(c.links, p.label)]?.url ?? ""}
            onChange={(v) => update((d) => setProfileLink(d.contact, p.label, v))}
            placeholder={p.placeholder}
          />
        ))}
      </div>
      <div className="mt-3 space-y-2">
        <p className="label">Other links</p>
        {c.links.map((l, i) => profile.has(i) ? null : (
          <div key={l.id} className="flex items-end gap-2">
            <TextField label="Label" value={l.label} onChange={(v) => update((d) => void (d.contact.links[i].label = v))} className="w-32" />
            <TextField label="URL" value={l.url} onChange={(v) => update((d) => void (d.contact.links[i].url = v))} className="flex-1" placeholder="your-site.dev" />
            <button className="btn-ghost mb-0.5 h-8 px-2" aria-label="Remove link" onClick={() => update((d) => void d.contact.links.splice(i, 1), true)}>✕</button>
          </div>
        ))}
        {c.links.length < 6 ? (
          <button className="btn-ghost h-7 px-2 text-xs text-brand-700" onClick={() => update((d) => void d.contact.links.push({ id: newId("l"), label: "Blog", url: "" }), true)}>
            + Add another link (blog, Kaggle…)
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function SummaryForm({ data, update }: { data: ResumeData; update: Update }) {
  const [assist, setAssist] = useState(false);
  const s = data.summary;
  return (
    <section>
      <SectionHeader
        id="s-summary"
        title="Summary"
        help="2–4 lines: your role, experience level, strongest relevant skills and one notable result."
        action={<button className="text-xs font-medium text-violet-800 underline" onClick={() => setAssist((a) => !a)} aria-expanded={assist}>✦ Draft with AI</button>}
      />
      <label className="sr-only" htmlFor="summary-text">Summary</label>
      <textarea id="summary-text" className="field" rows={4} value={s.text} onChange={(e) => update((d) => void (d.summary.text = e.target.value))} />
      <div className="mt-1 flex gap-2">
        <OriginBadge origin={s.origin} />
        {s.origin === "ai" && s.sourceText !== undefined ? (
          <button className="text-[11px] text-slate-700 underline" onClick={() => update((d) => void (d.summary = { text: s.sourceText!, origin: "user" }), true)}>
            Restore previous summary
          </button>
        ) : null}
      </div>
      {assist ? (
        <SummaryAssist
          current={s.text}
          onClose={() => setAssist(false)}
          onAccept={(text) => {
            update((d) => void (d.summary = { text, origin: "ai", sourceText: s.sourceText ?? s.text }), true);
            setAssist(false);
          }}
        />
      ) : null}
    </section>
  );
}

export function ExperienceForm({ data, update }: { data: ResumeData; update: Update }) {
  const { mode } = useEditor();
  const sortByDate = () =>
    update((d) => {
      const key = (e: ResumeData["experience"][number]) => (e.current ? 1e7 : (toMonthIndex(e.endDate, true) ?? toMonthIndex(e.startDate) ?? 0)) * 100000 + (toMonthIndex(e.startDate) ?? 0);
      d.experience.sort((a, b) => key(b) - key(a));
    }, true);
  return (
    <section>
      <SectionHeader
        id="s-experience"
        title="Experience"
        help="Most recent first. Include internships; mark them as such."
        action={data.experience.length > 1 ? <button className="btn-ghost h-7 px-2 text-xs" onClick={sortByDate}>Sort by date</button> : null}
      />
      <div className="space-y-3">
        {data.experience.map((e, i) => (
          <EntryCard
            key={e.id}
            id={`e-${e.id}`}
            heading={e.title || "New role"}
            sub={e.company}
            onUp={i > 0 ? () => update((d) => void (d.experience = move(d.experience, i, -1)), true) : undefined}
            onDown={i < data.experience.length - 1 ? () => update((d) => void (d.experience = move(d.experience, i, 1)), true) : undefined}
            onRemove={() => update((d) => void d.experience.splice(i, 1), true)}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Job title" value={e.title} onChange={(v) => update((d) => void (d.experience[i].title = v))} />
              <TextField label="Company" value={e.company} onChange={(v) => update((d) => void (d.experience[i].company = v))} />
              <TextField label="Location" value={e.location} onChange={(v) => update((d) => void (d.experience[i].location = v))} />
              <div>
                <label className="label" htmlFor={`et-${e.id}`}>Type</label>
                <select id={`et-${e.id}`} className="field" value={e.employmentType} onChange={(ev) => update((d) => void (d.experience[i].employmentType = ev.target.value))}>
                  {["", "Full-time", "Part-time", "Contract", "Internship", "Freelance", "Apprenticeship", "Volunteer"].map((t) => <option key={t} value={t}>{t || "Not specified"}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <DateField label="Start" value={e.startDate} onChange={(v) => update((d) => void (d.experience[i].startDate = v))} />
              <DateField label="End" value={e.current ? "" : e.endDate} disabled={e.current} onChange={(v) => update((d) => void (d.experience[i].endDate = v))} />
              <label className="mb-1.5 flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={e.current} onChange={(ev) => update((d) => void (d.experience[i].current = ev.target.checked), true)} /> I currently work here
              </label>
              <NewPageToggle checked={!!e.pageBreakBefore} onChange={(on) => update((d) => void (d.experience[i].pageBreakBefore = on), true)} />
            </div>
            <BulletList bullets={e.bullets} onChange={(b, s) => update((d) => void (d.experience[i].bullets = b), s)} />
            {mode === "beginner" && e.bullets.length === 0 ? (
              <p className="text-xs text-slate-500">Tip: start each bullet with a verb (Built, Reduced, Led…), say what you did, and include a real number if you have one.</p>
            ) : null}
          </EntryCard>
        ))}
      </div>
      <button
        className="btn-secondary mt-2"
        onClick={() =>
          update((d) => void d.experience.unshift({ id: newId("exp"), title: "", company: "", location: "", employmentType: "", startDate: "", endDate: "", current: false, bullets: [{ id: newId("b"), text: "", origin: "user" }] }), true)
        }
      >
        + Add role
      </button>
    </section>
  );
}

export function ProjectsForm({ data, update }: { data: ResumeData; update: Update }) {
  return (
    <section>
      <SectionHeader id="s-projects" title="Projects" help="Problem, your approach, technologies, and a measurable outcome where you have one." />
      <div className="space-y-3">
        {data.projects.map((p, i) => (
          <EntryCard
            key={p.id}
            id={`e-${p.id}`}
            heading={p.name || "New project"}
            sub={p.technologies.slice(0, 3).join(", ")}
            onUp={i > 0 ? () => update((d) => void (d.projects = move(d.projects, i, -1)), true) : undefined}
            onDown={i < data.projects.length - 1 ? () => update((d) => void (d.projects = move(d.projects, i, 1)), true) : undefined}
            onRemove={() => update((d) => void d.projects.splice(i, 1), true)}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Project name" value={p.name} onChange={(v) => update((d) => void (d.projects[i].name = v))} />
              <TextField label="Short description or role (optional)" value={p.role} onChange={(v) => update((d) => void (d.projects[i].role = v))} placeholder="Live SaaS product" />
              <TextField label="Link (optional)" value={p.url} onChange={(v) => update((d) => void (d.projects[i].url = v))} placeholder="github.com/you/project" className="sm:col-span-2" />
            </div>
            <ListInput label="Technologies" items={p.technologies} onChange={(v) => update((d) => void (d.projects[i].technologies = v))} placeholder="Python, FastAPI, PostgreSQL" />
            <div className="flex flex-wrap items-end gap-4">
              <DateField label="When (month & year)" value={p.startDate} onChange={(v) => update((d) => void (d.projects[i].startDate = v))} />
              <DateField label="Until (optional)" value={p.endDate} onChange={(v) => update((d) => void (d.projects[i].endDate = v))} />
              <NewPageToggle checked={!!p.pageBreakBefore} onChange={(on) => update((d) => void (d.projects[i].pageBreakBefore = on), true)} />
            </div>
            <BulletList bullets={p.bullets} onChange={(b, s) => update((d) => void (d.projects[i].bullets = b), s)} placeholder="The problem, what you built and how, and the result." />
          </EntryCard>
        ))}
      </div>
      <button
        className="btn-secondary mt-2"
        onClick={() => update((d) => void d.projects.push({ id: newId("prj"), name: "", role: "", url: "", technologies: [], startDate: "", endDate: "", bullets: [{ id: newId("b"), text: "", origin: "user" }] }), true)}
      >
        + Add project
      </button>
    </section>
  );
}

export function EducationForm({ data, update }: { data: ResumeData; update: Update }) {
  return (
    <section>
      <SectionHeader id="s-education" title="Education" help="Degree, institution and year. Add CGPA or percentage if it helps your application." />
      <div className="space-y-3">
        {data.education.map((e, i) => (
          <EntryCard
            key={e.id}
            id={`e-${e.id}`}
            heading={e.degree || "New qualification"}
            sub={e.institution}
            onUp={i > 0 ? () => update((d) => void (d.education = move(d.education, i, -1)), true) : undefined}
            onDown={i < data.education.length - 1 ? () => update((d) => void (d.education = move(d.education, i, 1)), true) : undefined}
            onRemove={() => update((d) => void d.education.splice(i, 1), true)}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Degree / qualification" value={e.degree} onChange={(v) => update((d) => void (d.education[i].degree = v))} placeholder="B.Tech, MBA, Class XII" />
              <TextField label="Field of study" value={e.field} onChange={(v) => update((d) => void (d.education[i].field = v))} placeholder="Computer Science" />
              <TextField label="Institution" value={e.institution} onChange={(v) => update((d) => void (d.education[i].institution = v))} />
              <TextField label="Location" value={e.location} onChange={(v) => update((d) => void (d.education[i].location = v))} />
              <TextField label="Grade (optional)" value={e.grade} onChange={(v) => update((d) => void (d.education[i].grade = v))} placeholder="CGPA: 8.2/10 or 78%" />
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <DateField label="Start" value={e.startDate} onChange={(v) => update((d) => void (d.education[i].startDate = v))} />
              <DateField label="End (or expected)" value={e.endDate} onChange={(v) => update((d) => void (d.education[i].endDate = v))} />
              <NewPageToggle checked={!!e.pageBreakBefore} onChange={(on) => update((d) => void (d.education[i].pageBreakBefore = on), true)} />
            </div>
            <BulletList label="Details (optional)" bullets={e.bullets} onChange={(b, s) => update((d) => void (d.education[i].bullets = b), s)} placeholder="Relevant coursework, thesis, academic honours" />
          </EntryCard>
        ))}
      </div>
      <button
        className="btn-secondary mt-2"
        onClick={() => update((d) => void d.education.push({ id: newId("edu"), degree: "", field: "", institution: "", location: "", startDate: "", endDate: "", grade: "", bullets: [] }), true)}
      >
        + Add education
      </button>
    </section>
  );
}

export function SkillsForm({ data, update }: { data: ResumeData; update: Update }) {
  return (
    <section>
      <SectionHeader id="s-skills" title="Skills" help="Group related skills. List only what you can discuss in an interview; no ratings or bars." />
      <div className="space-y-2">
        {data.skills.map((g, i) => (
          <div key={g.id} id={`e-${g.id}`} className="flex scroll-mt-24 items-end gap-2">
            <TextField label="Group" value={g.category} onChange={(v) => update((d) => void (d.skills[i].category = v))} className="w-40 shrink-0" placeholder="Languages" />
            <div className="flex-1">
              <ListInput label="Skills (comma-separated)" items={g.items} onChange={(v) => update((d) => void (d.skills[i].items = v))} />
            </div>
            <button className="btn-ghost mb-0.5 h-8 px-2" aria-label={`Remove group ${g.category}`} onClick={() => update((d) => void d.skills.splice(i, 1), true)}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn-secondary mt-2" onClick={() => update((d) => void d.skills.push({ id: newId("sk"), category: "", items: [] }), true)}>
        + Add skill group
      </button>
    </section>
  );
}

export function CertificationsForm({ data, update }: { data: ResumeData; update: Update }) {
  return (
    <section>
      <SectionHeader id="s-certifications" title="Certifications" />
      <div className="space-y-2">
        {data.certifications.map((c, i) => (
          <div key={c.id} id={`e-${c.id}`} className="grid scroll-mt-24 items-end gap-2 rounded-md border border-slate-200 bg-white p-2 sm:grid-cols-[1fr_1fr_auto_auto]">
            <TextField label="Name" value={c.name} onChange={(v) => update((d) => void (d.certifications[i].name = v))} />
            <TextField label="Issuer" value={c.issuer} onChange={(v) => update((d) => void (d.certifications[i].issuer = v))} />
            <DateField label="Date" value={c.date} onChange={(v) => update((d) => void (d.certifications[i].date = v))} />
            <button className="btn-ghost h-8 px-2" aria-label="Remove certification" onClick={() => update((d) => void d.certifications.splice(i, 1), true)}>✕</button>
          </div>
        ))}
      </div>
      <button className="btn-secondary mt-2" onClick={() => update((d) => void d.certifications.push({ id: newId("cert"), name: "", issuer: "", date: "", url: "" }), true)}>
        + Add certification
      </button>
    </section>
  );
}

export function AdditionalForm({ data, update }: { data: ResumeData; update: Update }) {
  return (
    <section>
      <SectionHeader id="s-additional" title="Additional sections" help="Awards, publications, languages, volunteering, positions of responsibility." />
      <div className="space-y-3">
        {data.additional.map((a, i) => (
          <EntryCard
            key={a.id}
            id={`e-${a.id}`}
            heading={a.title || "New section"}
            onUp={i > 0 ? () => update((d) => void (d.additional = move(d.additional, i, -1)), true) : undefined}
            onDown={i < data.additional.length - 1 ? () => update((d) => void (d.additional = move(d.additional, i, 1)), true) : undefined}
            onRemove={() => update((d) => void d.additional.splice(i, 1), true)}
          >
            <TextField label="Section title" value={a.title} onChange={(v) => update((d) => void (d.additional[i].title = v))} placeholder="Awards" />
            <BulletList label="Items" bullets={a.bullets} onChange={(b, s) => update((d) => void (d.additional[i].bullets = b), s)} placeholder="" />
          </EntryCard>
        ))}
      </div>
      <button className="btn-secondary mt-2" onClick={() => update((d) => void d.additional.push({ id: newId("add"), title: "", bullets: [{ id: newId("b"), text: "", origin: "user" }] }), true)}>
        + Add section
      </button>
    </section>
  );
}
