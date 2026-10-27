"use client";

import { SECTION_LABELS, SKILLS_TITLES, SUMMARY_TITLES, normalizeSectionOrder, type ResumeSettings, type SectionKey, type TemplateId } from "@resume/shared/schema/resume";
import { PRESETS, TEMPLATES, presetSettings, templateDefaults } from "@resume/shared/render/templates";
import { FONTS, FONT_IDS, type FontId } from "@resume/shared/render/fonts";
import { IconBtn, move } from "./fields";
import { TemplateThumb } from "../TemplateThumb";
import { Badge } from "../ui";

const ACCENTS = [
  { label: "Black and white", value: null, swatch: "#111827" },
  { label: "Navy", value: "#1f3b63", swatch: "#1f3b63" },
  { label: "Indigo", value: "#312e81", swatch: "#312e81" },
  { label: "Slate blue", value: "#2f4f6f", swatch: "#2f4f6f" },
  { label: "Teal", value: "#0f5257", swatch: "#0f5257" },
  { label: "Forest", value: "#1f4d36", swatch: "#1f4d36" },
  { label: "Burgundy", value: "#6b1e2e", swatch: "#6b1e2e" },
  { label: "Charcoal", value: "#374151", swatch: "#374151" },
];

/** Relative luminance (0 dark … 1 light) of a #rrggbb colour. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function FontSelect({ id, label, value, onChange, allowSame }: { id: string; label: string; value: FontId | null; onChange: (v: FontId | null) => void; allowSame?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="field" value={value ?? ""} onChange={(e) => onChange((e.target.value || null) as FontId | null)}>
        {allowSame ? <option value="">Same as body</option> : null}
        <optgroup label="Sans-serif">
          {FONT_IDS.filter((f) => FONTS[f].kind === "sans").map((f) => <option key={f} value={f}>{FONTS[f].label}</option>)}
        </optgroup>
        <optgroup label="Serif">
          {FONT_IDS.filter((f) => FONTS[f].kind === "serif").map((f) => <option key={f} value={f}>{FONTS[f].label}</option>)}
        </optgroup>
      </select>
    </div>
  );
}

export function DesignPanel({ settings, onChange, mode }: { settings: ResumeSettings; onChange: (fn: (s: ResumeSettings) => void, structural?: boolean) => void; mode: "beginner" | "advanced" }) {
  const order = normalizeSectionOrder(settings.sectionOrder);
  const hidden = new Set(settings.hiddenSections);
  const num = (k: "fontSize" | "margin" | "lineHeight" | "sectionSpacing", label: string, min: number, max: number, step: number, unit = "") => (
    <div>
      <label className="label" htmlFor={`ds-${k}`}>{label}: {settings[k]}{unit}</label>
      <input id={`ds-${k}`} type="range" min={min} max={max} step={step} value={settings[k]} className="w-full" onChange={(e) => onChange((s) => void (s[k] = Number(e.target.value)))} />
    </div>
  );
  return (
    <div className="space-y-5 text-sm">
      <section>
        <h3 className="mb-1.5 font-semibold">Template</h3>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
            const t = TEMPLATES[id];
            const active = settings.template === id;
            return (
              <button
                key={id}
                title={t.description}
                className={`group rounded-xl border p-1.5 text-left transition ${active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"}`}
                aria-pressed={active}
                onClick={() => onChange((s) => Object.assign(s, templateDefaults(id)), true)}
              >
                <TemplateThumb t={t} />
                <span className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
                  <span className="text-xs font-semibold">{t.label}</span>
                  {t.badge ? <Badge tone={t.badge === "Premium" ? "violet" : t.badge === "Popular" ? "blue" : "green"}>{t.badge}</Badge> : null}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-600">{TEMPLATES[settings.template].description}</p>
        <p className="mt-1 text-xs text-slate-500">Every template is single-column and text-based, with real embedded fonts, so it parses as reliably as it looks.</p>
      </section>

      <section>
        <h3 className="mb-1.5 font-semibold">Colour</h3>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button
              key={a.label}
              role="radio"
              aria-checked={settings.accentColor === a.value}
              aria-label={a.label}
              title={a.label}
              onClick={() => onChange((s) => void (s.accentColor = a.value))}
              className={`h-7 w-7 rounded-full ring-offset-2 transition ${settings.accentColor === a.value ? "ring-2 ring-brand-500" : "hover:scale-110"}`}
              style={{ background: a.swatch }}
            />
          ))}
          <label className="ml-1 flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="color"
              className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-white p-0.5"
              value={settings.accentColor ?? "#111827"}
              onChange={(e) => onChange((s) => void (s.accentColor = e.target.value))}
              aria-label="Custom colour"
            />
            Custom
          </label>
        </div>
        {!TEMPLATES[settings.template].useAccent ? <p className="mt-1 text-xs text-slate-500">Classic is always black and white.</p> : null}
        {settings.accentColor && /^#([0-9a-f]{2})/i.test(settings.accentColor) && luminance(settings.accentColor) > 0.6 ? (
          <p className="mt-1 text-xs text-amber-700">This colour is quite light; headings may be hard to read when printed.</p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <FontSelect id="ds-font" label="Body font" value={settings.fontFamily} onChange={(v) => onChange((s) => void (s.fontFamily = v ?? "Inter"))} />
        <FontSelect id="ds-hfont" label="Name & heading font" value={settings.headingFont} allowSame onChange={(v) => onChange((s) => void (s.headingFont = v))} />
      </section>

      <section>
        <h3 className="mb-1.5 font-semibold">Layout preset</h3>
        <label className="sr-only" htmlFor="ds-preset">Apply a section order preset</label>
        <select
          id="ds-preset"
          className="field"
          value=""
          onChange={(e) => {
            const p = PRESETS.find((x) => x.id === e.target.value);
            // Only the section order and headings change; no résumé content is touched.
            if (p) onChange((s) => void Object.assign(s, presetSettings(p)), true);
          }}
        >
          <option value="">Apply a section order for…</option>
          {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </section>

      <section>
        <h3 className="mb-1.5 font-semibold">When it's longer than one page</h3>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="When it's longer than one page">
          {(
            [
              { id: "continue", label: "Continue on next page", hint: "Keeps your sizes and spacing; the rest goes on page 2." },
              { id: "fit", label: "Fit on one page", hint: "Tightens spacing, then margins and text size, only as much as needed." },
            ] as const
          ).map((o) => (
            <label key={o.id} className={`cursor-pointer rounded-xl border p-3 transition ${settings.pageFit === o.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:border-slate-300"}`}>
              <input type="radio" name="ds-page-fit" className="sr-only" checked={settings.pageFit === o.id} onChange={() => onChange((s) => void (s.pageFit = o.id), true)} />
              <span className="block font-semibold">{o.label}</span>
              <span className="text-xs text-slate-500">{o.hint}</span>
            </label>
          ))}
        </div>
      </section>

      <section>
        <label className="mb-1.5 block font-semibold" htmlFor="ds-summary-title">Summary heading</label>
        <select
          id="ds-summary-title"
          className="field"
          value={settings.summaryTitle}
          onChange={(e) => onChange((s) => void (s.summaryTitle = e.target.value as ResumeSettings["summaryTitle"]), true)}
        >
          {SUMMARY_TITLES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
        <label className="mb-1.5 mt-3 block font-semibold" htmlFor="ds-skills-title">Skills heading</label>
        <select
          id="ds-skills-title"
          className="field"
          value={settings.skillsTitle}
          onChange={(e) => onChange((s) => void (s.skillsTitle = e.target.value as ResumeSettings["skillsTitle"]), true)}
        >
          {SKILLS_TITLES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
        </select>
      </section>

      <section>
        <h3 className="mb-1.5 font-semibold">Section order</h3>
        <ul className="space-y-1">
          {order.map((k, i) => (
            <li key={k} className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1">
              <span className={`flex-1 ${hidden.has(k) ? "text-slate-400 line-through" : ""}`}>{SECTION_LABELS[k as SectionKey]}</span>
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="checkbox" checked={!hidden.has(k)} onChange={(e) => onChange((s) => void (s.hiddenSections = e.target.checked ? s.hiddenSections.filter((x) => x !== k) : [...s.hiddenSections, k]), true)} /> Show
              </label>
              <label className="flex items-center gap-1 text-xs text-slate-600" title="Start this section on a new page">
                <input type="checkbox" checked={settings.pageBreaks.includes(k)} onChange={(e) => onChange((s) => void (s.pageBreaks = e.target.checked ? [...s.pageBreaks, k] : s.pageBreaks.filter((x) => x !== k)), true)} /> New page
              </label>
              <IconBtn label={`Move ${SECTION_LABELS[k]} up`} disabled={i === 0} onClick={() => onChange((s) => void (s.sectionOrder = move(order, i, -1)), true)}>↑</IconBtn>
              <IconBtn label={`Move ${SECTION_LABELS[k]} down`} disabled={i === order.length - 1} onClick={() => onChange((s) => void (s.sectionOrder = move(order, i, 1)), true)}>↓</IconBtn>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="ds-market">Target market</label>
          <select id="ds-market" className="field" value={settings.market} onChange={(e) => onChange((s) => {
            s.market = e.target.value as ResumeSettings["market"];
            s.pageSize = s.market === "US" ? "LETTER" : "A4";
          }, true)}>
            <option value="IN">India</option>
            <option value="US">United States</option>
            <option value="EU">Europe / UK</option>
            <option value="OTHER">Other</option>
          </select>
          <p className="mt-0.5 text-[11px] text-slate-500">Adjusts page size, phone checks and personal-detail guidance.</p>
        </div>
        <div>
          <label className="label" htmlFor="ds-style">AI writing style</label>
          <select id="ds-style" className="field" value={settings.writingStyle} onChange={(e) => onChange((s) => void (s.writingStyle = e.target.value as ResumeSettings["writingStyle"]))}>
            <option value="conservative">Conservative</option>
            <option value="balanced">Balanced</option>
            <option value="achievement">Achievement-focused</option>
          </select>
        </div>
      </section>

      {mode === "advanced" ? (
        <section className="grid gap-3 sm:grid-cols-2">
          {num("fontSize", "Body text size", 9, 12, 0.5, "pt")}
          {num("margin", "Page margin", 28, 72, 2, "pt")}
          {num("lineHeight", "Line spacing", 1.1, 1.6, 0.05)}
          {num("sectionSpacing", "Space between sections", 4, 20, 1, "pt")}
          <div>
            <label className="label" htmlFor="ds-hcase">Heading style</label>
            <select id="ds-hcase" className="field" value={settings.headingCase} onChange={(e) => onChange((s) => void (s.headingCase = e.target.value as ResumeSettings["headingCase"]))}>
              <option value="upper">UPPERCASE</option>
              <option value="title">Title Case</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ds-date">Date format</label>
            <select id="ds-date" className="field" value={settings.dateFormat} onChange={(e) => onChange((s) => void (s.dateFormat = e.target.value as ResumeSettings["dateFormat"]))}>
              <option value="MMM YYYY">Jan 2024</option>
              <option value="MM/YYYY">01/2024</option>
              <option value="YYYY-MM">2024-01</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ds-page">Page size</label>
            <select id="ds-page" className="field" value={settings.pageSize} onChange={(e) => onChange((s) => void (s.pageSize = e.target.value as ResumeSettings["pageSize"]))}>
              <option value="A4">A4</option>
              <option value="LETTER">US Letter</option>
            </select>
          </div>
        </section>
      ) : (
        <p className="text-xs text-slate-500">Switch to Advanced mode for text size, margins, spacing, date format and page size.</p>
      )}
    </div>
  );
}
