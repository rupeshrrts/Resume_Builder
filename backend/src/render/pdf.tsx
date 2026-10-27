import { Fragment } from "react";
import { Document, Link, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { hasPageBreaks, type DocBlock, type DocModel } from "@resume/shared/render/model";
import { FONTS, type FontId } from "@resume/shared/render/fonts";
import { fitSteps } from "@resume/shared/render/fit";
import { boldSpans } from "@resume/shared/render/rich";
import { typeScale } from "@resume/shared/render/templates";
import { makeFontSafe, registerPdfFonts, withPdfFonts } from "./fonts";

export function bodyFont(doc: DocModel): FontId {
  return doc.settings.fontFamily;
}
export function headingFont(doc: DocModel): FontId {
  return doc.settings.headingFont ?? doc.settings.fontFamily;
}

/** Makes every string drawable by the chosen fonts; returns what had to be replaced. */
export function sanitizeModel(doc: DocModel): { doc: DocModel; replaced: string[] } {
  const replaced = new Set<string>();
  const fonts = [...new Set([bodyFont(doc), headingFont(doc)])];
  const fix = (s: string) => {
    const r = makeFontSafe(s, fonts);
    r.replaced.forEach((c) => replaced.add(c));
    return r.text;
  };
  const blocks = (b: DocBlock): DocBlock => {
    switch (b.type) {
      case "paragraph":
        return { ...b, text: fix(b.text) };
      case "list":
        return { ...b, items: b.items.map(fix) };
      case "skills":
        return { ...b, rows: b.rows.map((r) => ({ label: fix(r.label), items: fix(r.items) })) };
      case "entry":
        return {
          ...b,
          title: fix(b.title),
          titleSuffix: fix(b.titleSuffix),
          subtitle: fix(b.subtitle),
          dates: fix(b.dates),
          meta: fix(b.meta),
          link: b.link ? { text: fix(b.link.text), href: b.link.href } : null,
          bullets: b.bullets.map(fix),
        };
    }
  };
  return {
    doc: {
      ...doc,
      name: fix(doc.name),
      headline: fix(doc.headline),
      contact: doc.contact.map((c) => ({ ...c, text: fix(c.text) })) as DocModel["contact"],
      sections: doc.sections.map((s) => ({ ...s, title: fix(s.title), blocks: s.blocks.map(blocks) })),
    },
    replaced: [...replaced],
  };
}

/** Font family + weight/style props for react-pdf (built-ins use named variants). */
function face(id: FontId, weight: 400 | 600 | 700, italic = false) {
  if (id === "Helvetica") return { fontFamily: weight >= 600 ? (italic ? "Helvetica-BoldOblique" : "Helvetica-Bold") : italic ? "Helvetica-Oblique" : "Helvetica" };
  if (id === "Times-Roman") return { fontFamily: weight >= 600 ? (italic ? "Times-BoldItalic" : "Times-Bold") : italic ? "Times-Italic" : "Times-Roman" };
  return { fontFamily: id, fontWeight: weight, fontStyle: italic ? ("italic" as const) : ("normal" as const) };
}

const INK = "#111827";
/** Ligatures (fi, fl, ft) extract as single letters in some parsers ("Certifed"), so they're off. */
const NO_LIGATURES = { liga: false, clig: false, dlig: false, hlig: false };
/** Wider spacing makes some parsers read headings as separate letters ("S K I L L S"). */
const MAX_HEADING_TRACKING = 0.8;
const MUTED = "#4b5563";
/** Word's default hyperlink blue, used where a template shows links as labelled text. */
const LINK_BLUE = "#0563c1";

function ResumePdf({ doc }: { doc: DocModel }) {
  const s = doc.settings;
  const t = doc.template;
  const bf = bodyFont(doc);
  const hf = headingFont(doc);
  const d = t.density;
  const ts = typeScale(t, s.fontSize);
  const base = ts.body;
  const accent = t.useAccent && s.accentColor ? s.accentColor : t.header === "band" ? "#1f2937" : "#000000";
  const headingColor = t.headingColor === "muted" ? "#6b7280" : t.headingColor === "accent" ? accent : INK;
  const band = t.header === "band";
  const align = t.header === "center" ? "center" : "left";
  const padTop = s.margin * 0.85;
  const stacked = t.entryLayout === "stacked";
  const pipe = t.contactStyle === "pipe";

  const st = StyleSheet.create({
    page: { paddingTop: band ? 0 : padTop, paddingBottom: s.margin * 0.85, paddingHorizontal: s.margin, ...face(bf, 400), fontSize: base, lineHeight: s.lineHeight, color: INK, fontFeatureSettings: NO_LIGATURES },
    band: { backgroundColor: accent, marginHorizontal: -s.margin, paddingHorizontal: s.margin, paddingTop: padTop * 0.9, paddingBottom: 14, marginBottom: 4 },
    name: { ...face(hf, 700), fontSize: ts.name, color: band ? "#ffffff" : t.nameColor === "ink" ? INK : accent, textAlign: align, lineHeight: 1.15, letterSpacing: t.tracking, fontFeatureSettings: NO_LIGATURES },
    headline: { ...(t.headlineBold ? face(bf, 700) : {}), fontSize: ts.headline, textAlign: align, marginTop: 3, color: band ? "#e5e7eb" : t.headlineBold ? INK : MUTED },
    contact: { flexDirection: "row", flexWrap: "wrap", justifyContent: align === "center" ? "center" : "flex-start", marginTop: 4 },
    contactItem: { fontSize: base - 0.5, color: band ? "#f3f4f6" : "#374151" },
    contactSep: { fontSize: base - 0.5, color: band ? "#c7d2fe" : "#9ca3af", marginHorizontal: pipe ? 4 : 5 },
    link: band ? { color: "#ffffff", textDecoration: "none" } : pipe ? { color: LINK_BLUE, textDecoration: "underline" } : { color: "#1f2937", textDecoration: "none" },
    titleLink: { color: LINK_BLUE, textDecoration: "underline" },
    headingWrap: {
      marginTop: s.sectionSpacing * d - t.headingGapTrim,
      marginBottom: 4 * d,
      ...(t.heading === "rule" || t.heading === "centered" ? { borderBottomWidth: 0.75, borderBottomColor: t.headingColor === "muted" ? "#d1d5db" : accent, paddingBottom: 2.5 } : {}),
      ...(t.heading === "bar" ? { borderLeftWidth: 3, borderLeftColor: accent, paddingLeft: 7 } : {}),
    },
    heading: {
      ...face(hf, t.headingColor === "muted" ? 600 : 700),
      fontSize: ts.heading,
      color: headingColor,
      letterSpacing: s.headingCase === "upper" ? Math.min(t.tracking, MAX_HEADING_TRACKING) : 0,
      fontFeatureSettings: NO_LIGATURES,
      textAlign: t.heading === "centered" ? "center" : "left",
    },
    entry: { marginTop: 5 * d },
    entryHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
    entryTitle: { flex: 1, paddingRight: 8, fontSize: ts.entryTitle },
    bold: face(bf, 700),
    subtitle: t.mutedSubtitles ? { color: MUTED } : {},
    dates: { textAlign: "right", fontSize: ts.dates, color: t.mutedSubtitles ? MUTED : INK, ...(t.datesItalic ? face(bf, 400, true) : {}) },
    meta: { ...face(bf, 400, true), fontSize: base - 0.5, marginTop: 1, color: stacked ? "#374151" : MUTED },
    detail: { marginTop: 1 },
    bulletRow: { flexDirection: "row", marginTop: t.bulletGap * d, paddingLeft: stacked ? 12 : 4 },
    bulletDot: { width: 10, color: t.useAccent && s.accentColor ? accent : INK },
    bulletText: { flex: 1 },
    para: { marginTop: 1 },
    skillRow: { marginTop: 1.8 * d },
  });

  /** Text with the user's **bold** runs as nested bold Text. */
  const rich = (text: string) => boldSpans(text).map((p, i) => (p.bold ? <Text key={i} style={st.bold}>{p.text}</Text> : p.text));
  const name = t.nameCase === "upper" ? doc.name.toUpperCase() : doc.name;
  const contactParts = doc.contact.flatMap((c, i) => {
    const node = c.href ? (
      <Link key={`c${i}`} src={c.href} style={[st.contactItem, st.link]}>
        {c.text}
      </Link>
    ) : (
      <Text key={`c${i}`} style={st.contactItem}>{c.text}</Text>
    );
    // Each item is its own unbreakable box; rows wrap between items, never inside one.
    return i === 0 ? [node] : [<Text key={`s${i}`} style={st.contactSep}>{pipe ? "|" : "·"}</Text>, node];
  });
  const header = (
    <>
      {doc.name ? <Text style={st.name}>{name}</Text> : null}
      {doc.headline ? <Text style={st.headline}>{doc.headline}</Text> : null}
      {contactParts.length ? <View style={st.contact}>{contactParts}</View> : null}
    </>
  );

  return (
    <Document title={doc.name ? `${doc.name} - Resume` : "Resume"} author={doc.name || undefined} creator="Resume Builder" producer="Resume Builder" language="en">
      <Page size={s.pageSize} style={st.page} wrap>
        {band ? <View style={st.band}>{header}</View> : header}
        {/* Sections are fragments so headings and entries are direct page children: react-pdf
            only honours `break` (the user's "start on a new page") on a page's own children. */}
        {doc.sections.map((sec) => (
          <Fragment key={sec.key}>
            {/* Keep the heading with at least a few lines of its content. */}
            <View style={st.headingWrap} minPresenceAhead={36} break={sec.pageBreak}>
              <Text style={st.heading}>{sec.title}</Text>
            </View>
            {sec.blocks.map((b, bi) => {
              if (b.type === "paragraph") return <Text key={bi} style={st.para}>{rich(b.text)}</Text>;
              if (b.type === "skills")
                return (
                  <View key={bi}>
                    {b.rows.map((r, ri) => (
                      <Text key={ri} style={st.skillRow}>
                        {r.label ? <Text style={st.bold}>{`${r.label}: `}</Text> : null}
                        {r.items}
                      </Text>
                    ))}
                  </View>
                );
              if (b.type === "list")
                return (
                  <View key={bi}>
                    {b.items.map((it, ii) => (
                      <View key={ii} style={st.bulletRow} wrap={false}>
                        <Text style={st.bulletDot}>•</Text>
                        <Text style={st.bulletText}>{rich(it)}</Text>
                      </View>
                    ))}
                  </View>
                );
              return (
                <View key={bi} style={st.entry} break={b.pageBreak}>
                  <View wrap={false} minPresenceAhead={24}>
                    <View style={st.entryHead}>
                      <Text style={sec.key === "projects" || sec.key === "education" ? [st.entryTitle, { fontSize: ts.projectTitle }] : st.entryTitle}>
                        {b.titleHref ? (
                          <Link src={b.titleHref} style={[st.bold, st.titleLink]}>
                            {b.title}
                          </Link>
                        ) : (
                          <Text style={st.bold}>{b.title}</Text>
                        )}
                        {b.titleSuffix ? <Text>{` — ${b.titleSuffix}`}</Text> : null}
                        {b.subtitle && !stacked ? <Text style={st.subtitle}>{`, ${b.subtitle}`}</Text> : null}
                      </Text>
                      {b.dates ? <Text style={st.dates}>{b.dates}</Text> : null}
                    </View>
                    {b.subtitle && stacked ? <Text style={st.detail}>{b.subtitle}</Text> : null}
                    {b.link ? (
                      <Link src={b.link.href} style={{ color: "#1f2937", textDecoration: "none", fontSize: base - 0.5 }}>
                        {b.link.text}
                      </Link>
                    ) : null}
                    {b.meta ? <Text style={st.meta}>{b.meta}</Text> : null}
                  </View>
                  {b.bullets.map((x, xi) => (
                    <View key={xi} style={st.bulletRow} wrap={false}>
                      <Text style={st.bulletDot}>•</Text>
                      <Text style={st.bulletText}>{rich(x)}</Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </Fragment>
        ))}
      </Page>
    </Document>
  );
}

/** Page objects in a PDF written by pdfkit ("/Type /Pages" is the page tree, not a page). */
const pageCount = (buf: Buffer) => (buf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

/**
 * Renders the first layout from fitSteps() that fits on one page. When even the tightest one
 * doesn't fit, a cramped two-page résumé is worse than the normal one, so the user's own
 * settings are used and the content continues on the next page.
 */
async function renderFitted(doc: DocModel): Promise<{ buffer: Buffer; doc: DocModel }> {
  // A page break the user placed means they chose the pages themselves; nothing to fit.
  const steps = hasPageBreaks(doc) ? [doc.settings] : fitSteps(doc.settings);
  const render = async (settings: DocModel["settings"]) => {
    const attempt = { ...doc, settings };
    return { buffer: await withPdfFonts(() => renderToBuffer(<ResumePdf doc={attempt} />)), doc: attempt };
  };
  const first = await render(steps[0]);
  if (steps.length === 1 || pageCount(first.buffer) <= 1) return first;
  for (const settings of steps.slice(1)) {
    const out = await render(settings);
    if (pageCount(out.buffer) <= 1) return out;
  }
  return first;
}

/** The document with the settings that "Fit on one page" settled on (unchanged otherwise), for DOCX. */
export async function fitDocument(model: DocModel): Promise<DocModel> {
  if (fitSteps(model.settings).length === 1 || hasPageBreaks(model)) return model;
  registerPdfFonts();
  const { doc } = await renderFitted(sanitizeModel(model).doc);
  return { ...model, settings: doc.settings };
}

export async function renderPdf(model: DocModel): Promise<{ buffer: Buffer; replaced: string[] }> {
  registerPdfFonts();
  const { doc, replaced } = sanitizeModel(model);
  const { buffer } = await renderFitted(doc);
  return { buffer, replaced };
}

export { FONTS };
