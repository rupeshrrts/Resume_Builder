"use client";

import { useState } from "react";
import { defaultSettings, type TemplateId } from "@resume/shared/schema/resume";
import { TEMPLATES, templateDefaults } from "@resume/shared/render/templates";
import { FONTS, FONT_IDS, type FontId } from "@resume/shared/render/fonts";
import { DEMO_RESUME } from "@resume/shared/demo";
import { PreviewPanel } from "../editor/PreviewPanel";
import { TemplateThumb } from "../TemplateThumb";
import { Badge } from "../ui";

const ACCENTS: { label: string; value: string | null }[] = [
  { label: "Black and white", value: null },
  { label: "Navy", value: "#1f3b63" },
  { label: "Indigo", value: "#312e81" },
  { label: "Teal", value: "#0f5257" },
  { label: "Burgundy", value: "#6b1e2e" },
];

export function TemplateShowcase() {
  const [template, setTemplate] = useState<TemplateId>("executive");
  const [accent, setAccent] = useState<string | null>(TEMPLATES.executive.defaultAccent);
  const [font, setFont] = useState<FontId>(TEMPLATES.executive.defaultFont);
  const settings = defaultSettings({
    ...templateDefaults(template),
    accentColor: accent,
    fontFamily: font,
    sectionOrder: ["summary", "experience", "skills", "projects", "education", "certifications", "additional"],
  });
  const t = TEMPLATES[template];

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[360px_1fr]">
      <div className="space-y-5">
        <div role="radiogroup" aria-label="Template" className="grid max-w-md grid-cols-4 gap-2">
          {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
            const active = template === id;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={active}
                aria-label={TEMPLATES[id].label}
                onClick={() => {
                  const d = templateDefaults(id);
                  setTemplate(id);
                  setFont(d.fontFamily);
                  setAccent(d.accentColor);
                }}
                className={`rounded-lg p-1 transition ${active ? "bg-white shadow-[var(--shadow-lift)] ring-2 ring-brand-500" : "hover:-translate-y-0.5 hover:bg-white/70"}`}
              >
                <TemplateThumb t={TEMPLATES[id]} />
                <span className="mt-1 block text-center text-[11px] font-semibold">{TEMPLATES[id].label}</span>
              </button>
            );
          })}
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">{t.label}</h3>
            {t.badge ? <Badge tone={t.badge === "Premium" ? "violet" : t.badge === "Popular" ? "blue" : "green"}>{t.badge}</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">{t.description}</p>
        </div>
        <div className="flex flex-wrap items-end gap-5">
          <div>
            <p className="label">Colour</p>
            <div className="flex gap-2" role="radiogroup" aria-label="Accent colour">
              {ACCENTS.map((a) => (
                <button
                  key={a.label}
                  role="radio"
                  aria-checked={accent === a.value}
                  aria-label={a.label}
                  title={a.label}
                  onClick={() => setAccent(a.value)}
                  className={`h-7 w-7 rounded-full ring-offset-2 transition ${accent === a.value ? "ring-2 ring-brand-500" : "hover:scale-110"}`}
                  style={{ background: a.value ?? "#111827" }}
                />
              ))}
            </div>
          </div>
          <div className="min-w-40 flex-1">
            <label className="label" htmlFor="ts-font">Typeface</label>
            <select id="ts-font" className="field" value={font} onChange={(e) => setFont(e.target.value as FontId)}>
              {FONT_IDS.map((f) => <option key={f} value={f}>{FONTS[f].label}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500">Every template is single-column and text-based, with the font embedded in the PDF, so it exports cleanly to PDF, Word and plain text.</p>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-slate-100 to-brand-50 p-4 sm:p-6">
        <PreviewPanel data={DEMO_RESUME} settings={settings} caption={false} />
      </div>
    </div>
  );
}
