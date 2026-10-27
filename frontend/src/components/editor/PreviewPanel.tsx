"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ResumeData, ResumeSettings } from "@resume/shared/schema/resume";
import { buildDocument, hasPageBreaks } from "@resume/shared/render/model";
import { cssFontStack } from "@resume/shared/render/fonts";
import { fitSteps } from "@resume/shared/render/fit";
import { boldSpans } from "@resume/shared/render/rich";
import { typeScale } from "@resume/shared/render/templates";

const PAGE_PT = { A4: [595.28, 841.89], LETTER: [612, 792] } as const;
const INK = "#111827";
const MUTED = "#4b5563";
const LINK_BLUE = "#0563c1";
const PX_PER_PT = 96 / 72;
/** Space between page sheets, in screen pixels before scaling. */
const PAGE_GAP = 28;

/** One unbreakable piece of the résumé: a header, heading, entry title, bullet, paragraph… */
interface Atom {
  key: string;
  /** Space above it in points; dropped when it starts a page. */
  gap: number;
  /** Move to the next page together with the following atom (headings, entry titles). */
  keepWithNext?: boolean;
  /** The user asked for this to start on a new page. */
  breakBefore?: boolean;
  node: React.ReactNode;
}

/**
 * Live HTML preview built from the same document model and style rules as the PDF and DOCX
 * exports (backend/src/render/pdf.tsx), so what you see is what you download. Content is laid
 * out on real pages: when one is full the rest continues on the next, the same way the PDF
 * breaks, and "Fit on one page" walks the same tightening steps as the export.
 */
export function PreviewPanel({ data, settings, caption = true }: { data: ResumeData; settings: ResumeSettings; caption?: boolean }) {
  // A page break the user placed means they chose the pages themselves; nothing to fit.
  const steps = useMemo(() => (hasPageBreaks(buildDocument(data, settings)) ? [settings] : fitSteps(settings)), [data, settings]);
  // Which fit step is being tried for this content; -1 once none fits, which falls back to
  // the user's own settings. Any change to the content or settings starts over from step 0.
  const [fit, setFit] = useState({ steps, data, index: 0 });
  const stepIndex = fit.steps === steps && fit.data === data ? fit.index : 0;
  const s = stepIndex >= 0 ? steps[stepIndex] : steps[0];

  const doc = useMemo(() => buildDocument(data, s), [data, s]);
  const wrap = useRef<HTMLDivElement>(null);
  const measurer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Atom heights, tagged with the settings and content they were measured for so a stale
  // measurement (e.g. from the previous fit step) is never used to decide page breaks.
  const [heights, setHeights] = useState<{ s: ResumeSettings | null; data: ResumeData | null; values: number[] }>({ s: null, data: null, values: [] });
  const [pw, ph] = PAGE_PT[s.pageSize];
  const pageWidthPx = pw * PX_PER_PT;
  const pageHeightPx = ph * PX_PER_PT;
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth - 2) / pageWidthPx)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pageWidthPx]);

  const t = doc.template;
  const d = t.density;
  const ts = typeScale(t, s.fontSize);
  const base = ts.body;
  const band = t.header === "band";
  const align = t.header === "center" ? "center" : "left";
  const accent = t.useAccent && s.accentColor ? s.accentColor : band ? "#1f2937" : "#000";
  const headingColor = t.headingColor === "muted" ? "#6b7280" : t.headingColor === "accent" ? accent : INK;
  const bodyFont = cssFontStack(s.fontFamily);
  const headFont = cssFontStack(s.headingFont ?? s.fontFamily);
  const pt = (n: number) => `${n}pt`;
  const headingTracking = s.headingCase === "upper" ? Math.min(t.tracking, 0.8) : 0;
  const stacked = t.entryLayout === "stacked";
  const pipe = t.contactStyle === "pipe";
  const linkStyle: React.CSSProperties | undefined = pipe && !band ? { color: LINK_BLUE, textDecoration: "underline" } : undefined;
  const padTop = s.margin * 0.85;
  const padBottom = s.margin * 0.85;

  const headingStyle: React.CSSProperties = {
    fontFamily: headFont,
    fontWeight: t.headingColor === "muted" ? 600 : 700,
    fontSize: pt(ts.heading),
    color: headingColor,
    letterSpacing: pt(headingTracking),
    textAlign: t.heading === "centered" ? "center" : "left",
    ...(t.heading === "rule" || t.heading === "centered" ? { borderBottom: `0.75pt solid ${t.headingColor === "muted" ? "#d1d5db" : accent}`, paddingBottom: pt(2.5) } : {}),
    ...(t.heading === "bar" ? { borderLeft: `3pt solid ${accent}`, paddingLeft: pt(7) } : {}),
  };
  /** Text with the user's **bold** runs in bold. */
  const rich = (text: string) => boldSpans(text).map((p, i) => (p.bold ? <b key={i}>{p.text}</b> : <Fragment key={i}>{p.text}</Fragment>));
  const bullet = (x: string) => (
    <div style={{ display: "flex", paddingLeft: pt(stacked ? 12 : 4) }}>
      <span style={{ width: pt(10), flexShrink: 0, color: t.useAccent && s.accentColor ? accent : INK }}>•</span>
      <span>{rich(x)}</span>
    </div>
  );

  const header = (
    <>
      {doc.name ? (
        <div style={{ fontFamily: headFont, fontWeight: 700, fontSize: pt(ts.name), color: band ? "#fff" : t.nameColor === "ink" ? INK : accent, textAlign: align, lineHeight: 1.15, letterSpacing: pt(t.tracking) }}>
          {t.nameCase === "upper" ? doc.name.toUpperCase() : doc.name}
        </div>
      ) : (
        <div style={{ color: "#cbd5e1", fontSize: pt(t.nameSize), textAlign: align }}>Your name</div>
      )}
      {doc.headline ? (
        <div
          style={{
            fontWeight: t.headlineBold ? 700 : undefined,
            fontSize: pt(ts.headline),
            textAlign: align,
            marginTop: pt(3),
            color: band ? "#e5e7eb" : t.headlineBold ? INK : MUTED,
          }}
        >
          {doc.headline}
        </div>
      ) : null}
      {doc.contact.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", marginTop: pt(4), fontSize: pt(base - 0.5), color: band ? "#f3f4f6" : "#374151" }}>
          {doc.contact.map((c, i) => (
            <span key={i}>
              {i ? <span style={{ margin: `0 ${pt(pipe ? 4 : 5)}`, color: band ? "#c7d2fe" : "#9ca3af" }}>{pipe ? "|" : "·"}</span> : null}
              {c.href ? (
                <a href={c.href} target="_blank" rel="noreferrer noopener" style={linkStyle}>
                  {c.text}
                </a>
              ) : (
                c.text
              )}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );

  const atoms: Atom[] = [
    {
      key: "header",
      gap: 0,
      node: band ? (
        <div style={{ background: accent, margin: `0 ${pt(-s.margin)} ${pt(4)}`, padding: `${pt(padTop * 0.9)} ${pt(s.margin)} ${pt(14)}` }}>{header}</div>
      ) : (
        header
      ),
    },
  ];
  for (const sec of doc.sections) {
    // The heading's space below is padding inside its atom, so it is measured with it.
    atoms.push({ key: `${sec.key}:h`, gap: s.sectionSpacing * d - t.headingGapTrim, keepWithNext: true, breakBefore: sec.pageBreak, node: <div style={{ paddingBottom: pt(4 * d) }}><div style={headingStyle}>{sec.title}</div></div> });
    sec.blocks.forEach((b, bi) => {
      const k = `${sec.key}:${bi}`;
      if (b.type === "paragraph") atoms.push({ key: k, gap: 1, node: <p style={{ margin: 0 }}>{rich(b.text)}</p> });
      else if (b.type === "skills")
        b.rows.forEach((r, ri) =>
          atoms.push({
            key: `${k}:${ri}`,
            gap: 1.8 * d,
            node: (
              <p style={{ margin: 0 }}>
                {r.label ? <b>{r.label}: </b> : null}
                {r.items}
              </p>
            ),
          }),
        );
      else if (b.type === "list") b.items.forEach((x, xi) => atoms.push({ key: `${k}:${xi}`, gap: t.bulletGap * d, node: bullet(x) }));
      else {
        atoms.push({
          key: k,
          gap: 5 * d,
          keepWithNext: b.bullets.length > 0,
          breakBefore: b.pageBreak,
          node: (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: pt(8) }}>
                <span style={{ fontSize: pt(sec.key === "projects" || sec.key === "education" ? ts.projectTitle : ts.entryTitle) }}>
                  {b.titleHref ? (
                    <a href={b.titleHref} target="_blank" rel="noreferrer noopener" style={{ fontWeight: 700, color: LINK_BLUE, textDecoration: "underline" }}>
                      {b.title}
                    </a>
                  ) : (
                    <b>{b.title}</b>
                  )}
                  {b.titleSuffix ? <span> — {b.titleSuffix}</span> : null}
                  {b.subtitle && !stacked ? <span style={{ color: t.mutedSubtitles ? MUTED : undefined }}>, {b.subtitle}</span> : null}
                </span>
                {b.dates ? <span style={{ whiteSpace: "nowrap", fontSize: pt(ts.dates), color: t.mutedSubtitles ? MUTED : undefined, fontStyle: t.datesItalic ? "italic" : undefined }}>{b.dates}</span> : null}
              </div>
              {b.subtitle && stacked ? <div style={{ marginTop: pt(1) }}>{b.subtitle}</div> : null}
              {b.link ? <div style={{ fontSize: pt(base - 0.5) }}>{b.link.text}</div> : null}
              {b.meta ? <div style={{ fontStyle: "italic", fontSize: pt(base - 0.5), color: stacked ? "#374151" : MUTED }}>{b.meta}</div> : null}
            </>
          ),
        });
        b.bullets.forEach((x, xi) => atoms.push({ key: `${k}:${xi}`, gap: t.bulletGap * d, node: bullet(x) }));
      }
    });
  }

  // Measure every atom off-screen at full size, then pack them onto pages.
  const measure = () => {
    const el = measurer.current;
    if (!el) return;
    const values = Array.from(el.children, (c) => (c as HTMLElement).offsetHeight);
    setHeights((prev) => (prev.s === s && prev.data === data && prev.values.length === values.length && prev.values.every((h, i) => h === values[i]) ? prev : { s, data, values }));
  };
  const measureRef = useRef(measure);
  measureRef.current = measure;
  useLayoutEffect(measure);
  useEffect(() => {
    const el = measurer.current;
    if (!el) return;
    // Re-measure when web fonts finish loading or the measuring copy changes size.
    const ro = new ResizeObserver(() => measureRef.current());
    ro.observe(el);
    document.fonts?.ready.then(() => measureRef.current()).catch(() => undefined);
    return () => ro.disconnect();
  }, []);

  const firstTop = band ? 0 : padTop * PX_PER_PT;
  const usable = (page: number) => pageHeightPx - (page === 0 ? firstTop : padTop * PX_PER_PT) - padBottom * PX_PER_PT;
  const measured = heights.s === s && heights.data === data && heights.values.length === atoms.length;
  const pages: number[][] = [[]];
  if (measured) {
    const h = heights.values;
    let used = 0;
    atoms.forEach((a, i) => {
      const page = pages[pages.length - 1];
      const gapPx = page.length ? a.gap * PX_PER_PT : 0;
      let need = gapPx + h[i];
      if (a.keepWithNext && i + 1 < atoms.length) need += atoms[i + 1].gap * PX_PER_PT + h[i + 1];
      if (page.length && (a.breakBefore || used + need > usable(pages.length - 1))) {
        pages.push([i]);
        used = h[i];
      } else {
        page.push(i);
        used += gapPx + h[i];
      }
    });
  } else pages[0] = atoms.map((_, i) => i);

  // "Fit on one page": try the next tighter step while the content needs more than one page.
  useEffect(() => {
    if (!measured || steps.length === 1 || stepIndex < 0) return;
    if (pages.length > 1) setFit({ steps, data, index: stepIndex + 1 < steps.length ? stepIndex + 1 : -1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, pages.length, stepIndex, steps, data]);

  const sheetStyle = {
    "--rp-font": bodyFont,
    "--rp-size": base,
    "--rp-lh": s.lineHeight,
    color: INK,
    fontFeatureSettings: '"liga" 0, "clig" 0',
  } as React.CSSProperties;
  const totalHeight = pages.length * pageHeightPx + (pages.length - 1) * PAGE_GAP;

  return (
    <div ref={wrap} className="relative overflow-hidden">
      {caption ? (
        <p className="mb-2 text-xs text-slate-500">
          Live preview with the same fonts, layout and page breaks as the PDF.
          {pages.length > 1 ? ` ${pages.length} pages.` : ""}
          {steps.length > 1 && stepIndex < 0 ? " Too long to fit on one page without going below readable sizes, so it continues on the next page." : ""}
        </p>
      ) : null}
      {/* Off-screen copy used only to measure each atom's height. */}
      <div aria-hidden className="resume-preview pointer-events-none invisible absolute left-0 top-0" style={{ ...sheetStyle, width: pageWidthPx, padding: `0 ${pt(s.margin)}` }}>
        <div ref={measurer}>
          {atoms.map((a) => (
            <div key={a.key} style={{ display: "flow-root" }}>{a.node}</div>
          ))}
        </div>
      </div>
      <div style={{ width: pageWidthPx * scale, height: totalHeight * scale }}>
        <div className="origin-top-left" style={{ width: pageWidthPx, transform: `scale(${scale})` }}>
          {pages.map((page, pi) => (
            <Fragment key={pi}>
              {pi ? (
                <p className="text-center text-xs font-medium text-slate-400" style={{ height: PAGE_GAP, lineHeight: `${PAGE_GAP}px`, margin: 0 }}>
                  Page {pi + 1}
                </p>
              ) : null}
              <div
                className="resume-preview overflow-hidden bg-white shadow-[0_8px_30px_rgb(15_23_42/0.12)] ring-1 ring-slate-200"
                style={{ ...sheetStyle, width: pageWidthPx, height: pageHeightPx, padding: `${pi === 0 && band ? 0 : pt(padTop)} ${pt(s.margin)} ${pt(padBottom)}` }}
              >
                {page.map((i, j) => (
                  <div key={atoms[i].key} style={{ display: "flow-root", marginTop: j ? pt(atoms[i].gap) : 0 }}>
                    {atoms[i].node}
                  </div>
                ))}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
